import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import { makeId } from "@/lib/formatting";
import type { SalesLead } from "@/lib/admin-types";

export const runtime = "nodejs";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ partnerOrgId: string }> },
) {
  const { partnerOrgId } = await params;
  const { snapshot } = await readAdminStateSnapshot();
  const org = (snapshot.partnerOrgs ?? []).find(
    (entry) => entry.id === partnerOrgId,
  );

  if (!org || org.status !== "Active") {
    return NextResponse.json(
      { ok: false, error: "Referral link is not active." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    partnerOrg: { id: org.id, name: org.name },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ partnerOrgId: string }> },
) {
  const { consumeRateLimit } = await import("@/lib/rate-limit");
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const limit = await consumeRateLimit({
    scope: "refer-public",
    key: ip,
    limit: 10,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many submissions. Try again later." },
      { status: 429 },
    );
  }

  const { partnerOrgId } = await params;
  const { snapshot } = await readAdminStateSnapshot();
  const org = (snapshot.partnerOrgs ?? []).find(
    (entry) => entry.id === partnerOrgId,
  );
  if (!org || org.status !== "Active") {
    return NextResponse.json(
      { ok: false, error: "Referral link is not active." },
      { status: 404 },
    );
  }

  let payload: {
    contactName?: unknown;
    company?: unknown;
    email?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const contactName =
    typeof payload.contactName === "string" ? payload.contactName.trim() : "";
  const company = typeof payload.company === "string" ? payload.company.trim() : "";
  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";

  if (!contactName || !company || !isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "Contact name, company, and a valid email are required." },
      { status: 400 },
    );
  }

  const duplicate = snapshot.salesLeads.find(
    (lead) =>
      lead.partnerOrgId === partnerOrgId &&
      lead.email.toLowerCase() === email,
  );
  if (duplicate) {
    // Idempotent: pretend success so we don't leak who's already referred.
    return NextResponse.json({ ok: true });
  }

  const timestamp = new Date().toISOString();
  const salesLead: SalesLead = {
    id: makeId("slead"),
    ownerId: "",
    createdByRole: "partner",
    createdByEmail: `refer:${partnerOrgId}`,
    contactName,
    company,
    email,
    qualificationStage: "Havent Contacted",
    qualificationReason: null,
    status: "Open",
    createdAt: timestamp,
    lastUpdatedAt: timestamp,
    convertedClientProfileId: null,
    linkedAdminLeadId: null,
    partnerOrgId,
  };

  const nextSnapshot = {
    ...snapshot,
    salesLeads: [salesLead, ...snapshot.salesLeads],
  };
  await writeAdminStateSnapshot(nextSnapshot, `refer:${partnerOrgId}`);

  return NextResponse.json({ ok: true });
}

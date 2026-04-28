import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import { getServerAuthSession } from "@/lib/auth-server";
import { makeId } from "@/lib/formatting";
import type { SalesLead } from "@/lib/admin-types";

export const runtime = "nodejs";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function GET() {
  const session = await getServerAuthSession();
  if (!session || session.role !== "partner") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!session.partnerOrgId) {
    return NextResponse.json(
      { ok: false, error: "Your account is not linked to a partner organisation." },
      { status: 403 },
    );
  }

  const { backend, snapshot } = await readAdminStateSnapshot();
  const partnerLeads = snapshot.salesLeads.filter(
    (lead) => lead.partnerOrgId === session.partnerOrgId,
  );

  return NextResponse.json({ ok: true, backend, salesLeads: partnerLeads });
}

export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "partner") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!session.partnerOrgId) {
    return NextResponse.json(
      { ok: false, error: "Your account is not linked to a partner organisation." },
      { status: 403 },
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
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const contactName = typeof payload.contactName === "string" ? payload.contactName.trim() : "";
  const company = typeof payload.company === "string" ? payload.company.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";

  if (!contactName || !company || !isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "Contact name, company, and a valid email are required." },
      { status: 400 },
    );
  }

  const { snapshot } = await readAdminStateSnapshot();

  const duplicate = snapshot.salesLeads.find(
    (lead) =>
      lead.partnerOrgId === session.partnerOrgId &&
      lead.email.toLowerCase() === email,
  );
  if (duplicate) {
    return NextResponse.json(
      { ok: false, error: "You have already submitted a lead with this email." },
      { status: 409 },
    );
  }

  const timestamp = new Date().toISOString();
  const salesLead: SalesLead = {
    id: makeId("slead"),
    ownerId: "",
    createdByRole: "partner",
    createdByEmail: session.email,
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
    partnerOrgId: session.partnerOrgId,
  };

  const nextSnapshot = {
    ...snapshot,
    salesLeads: [salesLead, ...snapshot.salesLeads],
  };
  const backend = await writeAdminStateSnapshot(nextSnapshot, session.email);

  return NextResponse.json({ ok: true, backend, salesLead });
}

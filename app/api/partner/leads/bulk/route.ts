import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import { getServerAuthSession } from "@/lib/auth-server";
import { makeId } from "@/lib/formatting";
import type { SalesLead } from "@/lib/admin-types";

export const runtime = "nodejs";

const MAX_ROWS = 500;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

type ImportRow = {
  contactName: string;
  company: string;
  email: string;
};

type RowResult =
  | { status: "imported"; row: ImportRow; id: string }
  | { status: "skipped"; row: ImportRow; reason: string }
  | { status: "invalid"; row: Partial<ImportRow>; reason: string };

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

  let payload: { rows?: unknown };
  try {
    payload = (await request.json()) as { rows?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const incoming = Array.isArray(payload.rows) ? payload.rows : [];
  if (incoming.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No rows provided." },
      { status: 400 },
    );
  }
  if (incoming.length > MAX_ROWS) {
    return NextResponse.json(
      { ok: false, error: `Maximum ${MAX_ROWS} rows per import.` },
      { status: 400 },
    );
  }

  const { snapshot } = await readAdminStateSnapshot();
  const existingEmails = new Set(
    snapshot.salesLeads
      .filter((lead) => lead.partnerOrgId === session.partnerOrgId)
      .map((lead) => lead.email.toLowerCase()),
  );

  const results: RowResult[] = [];
  const newLeads: SalesLead[] = [];
  const seenInBatch = new Set<string>();
  const timestamp = new Date().toISOString();

  for (const entry of incoming) {
    const raw = (entry ?? {}) as Record<string, unknown>;
    const contactName = typeof raw.contactName === "string" ? raw.contactName.trim() : "";
    const company = typeof raw.company === "string" ? raw.company.trim() : "";
    const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";

    if (!contactName || !company || !isValidEmail(email)) {
      results.push({
        status: "invalid",
        row: { contactName, company, email },
        reason: "Missing contactName, company, or valid email.",
      });
      continue;
    }
    if (existingEmails.has(email) || seenInBatch.has(email)) {
      results.push({
        status: "skipped",
        row: { contactName, company, email },
        reason: "Duplicate email.",
      });
      continue;
    }

    const lead: SalesLead = {
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

    newLeads.push(lead);
    seenInBatch.add(email);
    results.push({ status: "imported", row: { contactName, company, email }, id: lead.id });
  }

  if (newLeads.length > 0) {
    const nextSnapshot = {
      ...snapshot,
      salesLeads: [...newLeads, ...snapshot.salesLeads],
    };
    await writeAdminStateSnapshot(nextSnapshot, session.email);
  }

  const summary = {
    total: incoming.length,
    imported: newLeads.length,
    skipped: results.filter((r) => r.status === "skipped").length,
    invalid: results.filter((r) => r.status === "invalid").length,
  };

  return NextResponse.json({ ok: true, summary, results });
}

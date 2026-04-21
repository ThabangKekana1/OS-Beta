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
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { backend, snapshot } = await readAdminStateSnapshot();
  const salesLeads =
    session.role === "sales" && session.agentId
      ? snapshot.salesLeads.filter((lead) => lead.ownerId === session.agentId)
      : snapshot.salesLeads;

  return NextResponse.json({ ok: true, backend, salesLeads });
}

export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: {
    contactName?: unknown;
    company?: unknown;
    email?: unknown;
    ownerId?: unknown;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const contactName = typeof payload.contactName === "string" ? payload.contactName.trim() : "";
  const company = typeof payload.company === "string" ? payload.company.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const ownerId =
    session.role === "sales"
      ? session.agentId
      : typeof payload.ownerId === "string"
        ? payload.ownerId.trim()
        : "";

  if (!contactName || !company || !isValidEmail(email) || !ownerId) {
    return NextResponse.json(
      { ok: false, error: "Contact name, company, valid email, and owner are required." },
      { status: 400 },
    );
  }

  const timestamp = new Date().toISOString();
  const salesLead: SalesLead = {
    id: makeId("slead"),
    ownerId,
    createdByRole: session.role,
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
  };
  const { snapshot } = await readAdminStateSnapshot();
  const nextSnapshot = {
    ...snapshot,
    salesLeads: [salesLead, ...snapshot.salesLeads],
  };
  const backend = await writeAdminStateSnapshot(nextSnapshot, session.email);

  return NextResponse.json({ ok: true, backend, salesLead, snapshot: nextSnapshot });
}

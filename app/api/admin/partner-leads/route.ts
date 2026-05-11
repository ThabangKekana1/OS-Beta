import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import { getServerAuthSession } from "@/lib/auth-server";
import { buildAdminLeadStubFromSalesLead } from "@/lib/client-registration";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { backend, snapshot } = await readAdminStateSnapshot();
  const partnerLeads = snapshot.salesLeads.filter(
    (lead) => lead.createdByRole === "partner",
  );

  return NextResponse.json({
    ok: true,
    backend,
    partnerLeads,
    partnerOrgs: snapshot.partnerOrgs ?? [],
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: { id?: unknown; ownerId?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  const ownerId = typeof payload.ownerId === "string" ? payload.ownerId.trim() : "";

  if (!id || !ownerId) {
    return NextResponse.json(
      { ok: false, error: "id and ownerId are required." },
      { status: 400 },
    );
  }

  const { snapshot } = await readAdminStateSnapshot();
  const lead = snapshot.salesLeads.find((entry) => entry.id === id);
  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }
  if (lead.createdByRole !== "partner") {
    return NextResponse.json(
      { ok: false, error: "Only partner-submitted leads can be assigned here." },
      { status: 400 },
    );
  }

  const timestamp = new Date().toISOString();
  let linkedAdminLeadId = lead.linkedAdminLeadId;
  let nextLeads = snapshot.leads;

  if (!linkedAdminLeadId) {
    const stub = buildAdminLeadStubFromSalesLead({
      contactName: lead.contactName,
      company: lead.company,
      email: lead.email,
      ownerId,
    });

    if (stub) {
      const adminLead = {
        ...stub.lead,
        partnerOrgId: lead.partnerOrgId ?? null,
        linkedSalesLeadId: lead.id,
        events: [
          ...stub.lead.events,
          {
            id: `${stub.lead.id}-partner-assignment`,
            title: "Partner lead assigned",
            detail: "Admin assigned this partner referral for outreach.",
            createdAt: new Date().toLocaleString(),
            tone: "system" as const,
          },
        ],
      };
      linkedAdminLeadId = adminLead.id;
      nextLeads = [adminLead, ...snapshot.leads];
    }
  } else {
    nextLeads = snapshot.leads.map((entry) =>
      entry.id === linkedAdminLeadId && entry.ownerId !== ownerId
        ? {
            ...entry,
            ownerId,
            lastTouched: "Just now",
          }
        : entry,
    );
  }

  const nextSnapshot = {
    ...snapshot,
    leads: nextLeads,
    salesLeads: snapshot.salesLeads.map((entry) =>
      entry.id === id
        ? { ...entry, ownerId, linkedAdminLeadId, lastUpdatedAt: timestamp }
        : entry,
    ),
  };
  const backend = await writeAdminStateSnapshot(nextSnapshot, session.email);

  return NextResponse.json({ ok: true, backend });
}

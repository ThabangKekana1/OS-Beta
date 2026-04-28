import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import { getServerAuthSession } from "@/lib/auth-server";
import { salesLeadQualificationStages } from "@/lib/admin-types";
import type { SalesLeadQualificationStage } from "@/lib/admin-types";
import { buildAdminLeadStubFromSalesLead } from "@/lib/client-registration";

export const runtime = "nodejs";

const qualificationStages = new Set<SalesLeadQualificationStage>(salesLeadQualificationStages);

function requiresQualificationReason(stage: SalesLeadQualificationStage) {
  return stage === "Not Interested" || stage === "Does Not Qualify";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { backend, snapshot } = await readAdminStateSnapshot();
  const salesLead = snapshot.salesLeads.find((lead) => lead.id === id);

  if (!salesLead) {
    return NextResponse.json({ ok: false, error: "Sales lead not found." }, { status: 404 });
  }

  if (session.role === "sales" && session.agentId !== salesLead.ownerId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, backend, salesLead });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let payload: {
    qualificationStage?: unknown;
    qualificationReason?: unknown;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof payload.qualificationStage !== "string" ||
    !qualificationStages.has(payload.qualificationStage as SalesLeadQualificationStage)
  ) {
    return NextResponse.json(
      { ok: false, error: "Valid qualificationStage is required." },
      { status: 400 },
    );
  }

  const nextStage = payload.qualificationStage as SalesLeadQualificationStage;
  const reason =
    typeof payload.qualificationReason === "string"
      ? payload.qualificationReason.trim()
      : "";

  if (requiresQualificationReason(nextStage) && !reason) {
    return NextResponse.json(
      { ok: false, error: "qualificationReason is required for this stage." },
      { status: 400 },
    );
  }

  const { snapshot } = await readAdminStateSnapshot();
  const currentLead = snapshot.salesLeads.find((lead) => lead.id === id);

  if (!currentLead) {
    return NextResponse.json({ ok: false, error: "Sales lead not found." }, { status: 404 });
  }

  if (session.role === "sales" && session.agentId !== currentLead.ownerId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  if (currentLead.status === "Converted") {
    return NextResponse.json(
      { ok: false, error: "Converted leads cannot be requalified." },
      { status: 409 },
    );
  }

  const timestamp = new Date().toISOString();

  // Auto-handover: when a partner-originated lead reaches "Qualifies",
  // create a stub AdminLead so the Ops team picks it up in the Repository.
  const shouldHandover =
    nextStage === "Qualifies" &&
    currentLead.createdByRole === "partner" &&
    !currentLead.linkedAdminLeadId &&
    Boolean(currentLead.ownerId);

  let createdAdminLeadId: string | null = null;
  let nextLeads = snapshot.leads;

  if (shouldHandover) {
    const stub = buildAdminLeadStubFromSalesLead({
      contactName: currentLead.contactName,
      company: currentLead.company,
      email: currentLead.email,
      ownerId: currentLead.ownerId,
    });
    if (stub) {
      const stampedLead = {
        ...stub.lead,
        partnerOrgId: currentLead.partnerOrgId ?? null,
        linkedSalesLeadId: currentLead.id,
        events: [
          ...stub.lead.events,
          {
            id: `${stub.lead.id}-handover`,
            title: "Lead qualified by sales",
            detail: "Auto-created from partner referral on qualification.",
            createdAt: new Date().toLocaleString(),
            tone: "system" as const,
          },
        ],
      };
      createdAdminLeadId = stampedLead.id;
      nextLeads = [stampedLead, ...snapshot.leads];
    }
  }

  const nextSnapshot = {
    ...snapshot,
    leads: nextLeads,
    salesLeads: snapshot.salesLeads.map((lead) =>
      lead.id === id
        ? {
            ...lead,
            qualificationStage: nextStage,
            qualificationReason: requiresQualificationReason(nextStage) ? reason : null,
            lastUpdatedAt: timestamp,
            linkedAdminLeadId: createdAdminLeadId ?? lead.linkedAdminLeadId,
          }
        : lead,
    ),
  };
  const backend = await writeAdminStateSnapshot(nextSnapshot, session.email);

  return NextResponse.json({ ok: true, backend, snapshot: nextSnapshot, handover: createdAdminLeadId });
}

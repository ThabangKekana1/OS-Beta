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
    ownerId?: unknown;
    partnerOrgId?: unknown;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const hasQualificationUpdate = payload.qualificationStage !== undefined;
  const nextStage =
    typeof payload.qualificationStage === "string" &&
    qualificationStages.has(payload.qualificationStage as SalesLeadQualificationStage)
      ? (payload.qualificationStage as SalesLeadQualificationStage)
      : null;
  const nextOwnerId =
    typeof payload.ownerId === "string" ? payload.ownerId.trim() : undefined;
  const hasPartnerOrgId = Object.prototype.hasOwnProperty.call(payload, "partnerOrgId");
  const nextPartnerOrgId =
    typeof payload.partnerOrgId === "string" && payload.partnerOrgId.trim().length > 0
      ? payload.partnerOrgId.trim()
      : null;

  if (hasQualificationUpdate && !nextStage) {
    return NextResponse.json(
      { ok: false, error: "Valid qualificationStage is required." },
      { status: 400 },
    );
  }

  if (!hasQualificationUpdate && nextOwnerId === undefined && !hasPartnerOrgId) {
    return NextResponse.json(
      { ok: false, error: "No supported sales lead updates were provided." },
      { status: 400 },
    );
  }

  if (nextOwnerId !== undefined && nextOwnerId.length === 0) {
    return NextResponse.json(
      { ok: false, error: "ownerId cannot be empty." },
      { status: 400 },
    );
  }

  const reason =
    typeof payload.qualificationReason === "string"
      ? payload.qualificationReason.trim()
      : "";

  if (nextStage && requiresQualificationReason(nextStage) && !reason) {
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

  if ((nextOwnerId !== undefined || hasPartnerOrgId) && session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  if (nextPartnerOrgId) {
    const partnerExists = (snapshot.partnerOrgs ?? []).some(
      (org) => org.id === nextPartnerOrgId,
    );
    if (!partnerExists) {
      return NextResponse.json(
        { ok: false, error: "Partner org not found." },
        { status: 404 },
      );
    }
  }

  if (currentLead.status === "Converted" && hasQualificationUpdate) {
    return NextResponse.json(
      { ok: false, error: "Converted leads cannot be requalified." },
      { status: 409 },
    );
  }

  const timestamp = new Date().toISOString();

  // Auto-handover: when a partner-originated lead reaches "Qualifies",
  // create a stub AdminLead so the Ops team picks it up in the Repository.
  const resolvedOwnerId = nextOwnerId ?? currentLead.ownerId;
  const resolvedPartnerOrgId = hasPartnerOrgId ? nextPartnerOrgId : currentLead.partnerOrgId ?? null;
  const shouldHandover =
    nextStage === "Qualifies" &&
    currentLead.createdByRole === "partner" &&
    !currentLead.linkedAdminLeadId &&
    Boolean(resolvedOwnerId);

  const shouldCreateAssignmentStub =
    !currentLead.linkedAdminLeadId &&
    Boolean(resolvedOwnerId) &&
    (nextOwnerId !== undefined || hasPartnerOrgId);

  let createdAdminLeadId: string | null = null;
  let nextLeads = snapshot.leads;

  if (shouldHandover || shouldCreateAssignmentStub) {
    const stub = buildAdminLeadStubFromSalesLead({
      contactName: currentLead.contactName,
      company: currentLead.company,
      email: currentLead.email,
      ownerId: resolvedOwnerId,
    });
    if (stub) {
      const stampedLead = {
        ...stub.lead,
        partnerOrgId: resolvedPartnerOrgId,
        linkedSalesLeadId: currentLead.id,
        events: [
          ...stub.lead.events,
          {
            id: `${stub.lead.id}-${shouldHandover ? "handover" : "assignment"}`,
            title: shouldHandover ? "Lead qualified by sales" : "Lead assigned",
            detail: shouldHandover
              ? "Auto-created from partner referral on qualification."
              : "Auto-created for sequence tracking on assignment.",
            createdAt: new Date().toLocaleString(),
            tone: "system" as const,
          },
        ],
      };
      createdAdminLeadId = stampedLead.id;
      nextLeads = [stampedLead, ...snapshot.leads];
    }
  } else if (currentLead.linkedAdminLeadId && (nextOwnerId !== undefined || hasPartnerOrgId)) {
    nextLeads = snapshot.leads.map((lead) =>
      lead.id === currentLead.linkedAdminLeadId
        ? {
            ...lead,
            ownerId: resolvedOwnerId,
            partnerOrgId: resolvedPartnerOrgId,
            lastTouched: "Just now",
          }
        : lead,
    );
  }

  const nextSnapshot = {
    ...snapshot,
    leads: nextLeads,
    salesLeads: snapshot.salesLeads.map((lead) =>
      lead.id === id
        ? {
            ...lead,
            ownerId: resolvedOwnerId,
            partnerOrgId: resolvedPartnerOrgId,
            qualificationStage: nextStage ?? lead.qualificationStage,
            qualificationReason: nextStage
              ? requiresQualificationReason(nextStage)
                ? reason
                : null
              : lead.qualificationReason,
            lastUpdatedAt: timestamp,
            linkedAdminLeadId: createdAdminLeadId ?? lead.linkedAdminLeadId,
          }
        : lead,
    ),
  };
  const backend = await writeAdminStateSnapshot(nextSnapshot, session.email);

  return NextResponse.json({ ok: true, backend, snapshot: nextSnapshot, handover: createdAdminLeadId });
}

import { NextRequest, NextResponse } from "next/server";
import { normalizeAdminLead } from "@/lib/admin-storage";
import { makeId, timelineLabel } from "@/lib/formatting";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";
import { promoteLeadStage } from "@/lib/lead-stage";
import { authenticateMigrationProfileLead } from "@/lib/migration-profile-lead";
import { resolveProposalAcceptance } from "@/lib/f1-proposal";
import { countDocumentsByType } from "@/lib/document-taxonomy";
import { proposalReadiness } from "@/lib/utility-bill-analysis";
import { buildStoredBillPortfolio } from "@/lib/utility-bill-storage";
import {
  readAdminLeadByIdFromDatabase,
  upsertSingleLeadToDatabase,
} from "@/lib/supabase-db-store";
import type { AdminLead } from "@/lib/admin-types";

export const runtime = "nodejs";

type AcceptPayload = {
  profileId?: unknown;
  accessCode?: unknown;
};

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  let payload: AcceptPayload;

  try {
    payload = (await request.json()) as AcceptPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const limit = await consumeRateLimit({
    scope: "migration-proposal-accept",
    key: `${requestIp(request)}:${String(payload.profileId ?? "")}`,
    limit: 12,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many acceptance attempts. Try again later." },
      { status: 429 },
    );
  }

  const auth = await authenticateMigrationProfileLead(payload);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const linkedLead = auth.lead;

  const documentCounts = countDocumentsByType(linkedLead.documents);
  const { portfolio } = await buildStoredBillPortfolio(linkedLead.documents);
  const hasEngineeringApprovedProposal = linkedLead.documents.some((document) =>
    /proposal \(admin issued\)/i.test(document.title),
  );
  const readiness = proposalReadiness(portfolio, (documentCounts.signed_eoi ?? 0) >= 1, {
    requireEngineeringApproval: true,
    engineeringApproved: hasEngineeringApprovedProposal,
  });
  if (!readiness.ready) {
    return NextResponse.json(
      {
        ok: false,
        error: readiness.blockers[0]
          ?? "The signed EOI and audited six-period bill portfolio are required before acceptance.",
      },
      { status: 409 },
    );
  }

  const storedLead = await readAdminLeadByIdFromDatabase(linkedLead.id);
  if (!storedLead) {
    return NextResponse.json(
      { ok: false, error: "The linked client profile could not be loaded." },
      { status: 404 },
    );
  }

  const lead = normalizeAdminLead(storedLead);
  const acceptance = resolveProposalAcceptance(
    {
      proposalAcceptedAt: lead.proposalAcceptedAt,
      mandateSigningToken: lead.mandateSigningToken,
    },
    lead.company,
  );

  // Idempotent: re-accepting returns the original stamps with no new write,
  // event, or notification.
  if (acceptance.alreadyAccepted) {
    return NextResponse.json({
      ok: true,
      alreadyAccepted: true,
      acceptedAt: acceptance.proposalAcceptedAt,
      mandateToken: acceptance.mandateSigningToken,
    });
  }

  const acceptedLead: AdminLead = {
    ...lead,
    stage: promoteLeadStage(lead, "Proposal Accepted"),
    proposalAcceptedAt: acceptance.proposalAcceptedAt,
    proposalAcceptedBy: lead.contactName || lead.userProfile.fullName || null,
    mandateSigningToken: acceptance.mandateSigningToken,
    readinessScore: Math.max(lead.readinessScore, 80),
    nextAction: "Client accepted the Migration Proposal — send the Foundation-1 mandate for signature.",
    lastTouched: "Just now",
    events: [
      {
        id: makeId("event"),
        title: "Migration Proposal accepted",
        detail: `${lead.contactName || "Client"} accepted the Foundation-1 Migration Proposal through the client dashboard. Mandate e-sign link issued at /mandate/${acceptance.mandateSigningToken}.`,
        createdAt: timelineLabel(),
        tone: "client",
      },
      ...lead.events,
    ],
  };

  // Delta write: single-lead upsert only — never a full-snapshot write.
  await upsertSingleLeadToDatabase(acceptedLead, "client-proposal-accepted");

  void createNotification({
    audience: "admin",
    kind: "proposal_accepted",
    title: `Migration Proposal accepted by ${acceptedLead.company}`,
    body: `${acceptedLead.contactName || "The client"} accepted the Foundation-1 Migration Proposal. Mandate signature is the next gate.`,
    link: `/admin/leads/${acceptedLead.clientProfileId}`,
    metadata: {
      leadId: acceptedLead.id,
      clientProfileId: acceptedLead.clientProfileId,
      company: acceptedLead.company,
      proposalAcceptedAt: acceptance.proposalAcceptedAt,
    },
  });

  return NextResponse.json({
    ok: true,
    alreadyAccepted: false,
    acceptedAt: acceptance.proposalAcceptedAt,
    mandateToken: acceptance.mandateSigningToken,
  });
}

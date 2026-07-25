import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  buildDevMigrationPreviewProposal,
  isDevMigrationPreviewCredentials,
} from "@/lib/dev-migration-preview";
import { authenticateMigrationProfileLead } from "@/lib/migration-profile-lead";
import { buildF1Proposal } from "@/lib/f1-proposal";
import { countDocumentsByType } from "@/lib/document-taxonomy";
import {
  FOUNDATION_ASSESSMENT_COMPLETED_EVENT,
} from "@/lib/post-assessment-eoi";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { proposalReadiness } from "@/lib/utility-bill-analysis";
import { buildStoredBillPortfolio } from "@/lib/utility-bill-storage";

export const runtime = "nodejs";

type ProposalPayload = {
  profileId?: unknown;
  accessCode?: unknown;
};

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function stringField(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  let payload: ProposalPayload;

  try {
    payload = (await request.json()) as ProposalPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const limit = await consumeRateLimit({
    scope: "migration-proposal",
    key: `${requestIp(request)}:${String(payload.profileId ?? "")}`,
    limit: 60,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many proposal requests. Try again later." },
      { status: 429 },
    );
  }

  if (isDevMigrationPreviewCredentials(payload.profileId, payload.accessCode)) {
    const proposal = buildDevMigrationPreviewProposal();
    return NextResponse.json({
      ok: true,
      available: true,
      proposal,
      readiness: {
        signedEoi: true,
        recognisedBillingPeriods: proposal.billAudit?.uniquePeriodCount ?? 6,
        requiredBillingPeriods: 6,
        confidence: proposal.billAudit?.confidence ?? "high",
        blockers: [],
        warnings: proposal.billAudit?.warnings ?? [],
      },
      accepted: false,
      acceptanceReady: false,
      acceptanceBlockers: [
        "Final acceptance unlocks only after Foundation-1 records engineering approval.",
      ],
      acceptedAt: null,
      mandateToken: null,
      mandateSignedAt: null,
      eoiToken: null,
    });
  }

  const auth = await authenticateMigrationProfileLead(payload);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { lead } = auth;
  const documentCounts = countDocumentsByType(lead.documents);
  const hasSignedEoi = (documentCounts.signed_eoi ?? 0) >= 1;
  const hasEngineeringApprovedProposal = lead.documents.some((document) =>
    /proposal \(admin issued\)/i.test(document.title),
  );
  const { portfolio } = await buildStoredBillPortfolio(lead.documents);
  const readiness = proposalReadiness(portfolio, hasSignedEoi, {
    requireSignedEoi: false,
  });

  if (!readiness.ready) {
    return NextResponse.json({
      ok: true,
      available: false,
      reason: readiness.blockers[0]
        ?? "Foundation-1 is still validating your bill portfolio.",
      readiness: {
        signedEoi: hasSignedEoi,
        recognisedBillingPeriods: portfolio.uniquePeriodCount,
        requiredBillingPeriods: 6,
        confidence: portfolio.confidence,
        blockers: readiness.blockers,
        warnings: portfolio.warnings,
      },
    });
  }

  if (!portfolio.averageMonthlySpendExVat || !portfolio.averageMonthlyKwh || !portfolio.designBasis) {
    return NextResponse.json({
      ok: true,
      available: false,
      reason:
        "The uploaded statements do not yet provide a reconciled highest-bill period with matching electricity spend and kWh.",
    });
  }

  const proposal = buildF1Proposal({
    businessName: lead.company,
    contactName: lead.contactName,
    clientProfileId: lead.clientProfileId,
    siteCity: lead.siteCity,
    province: lead.province,
    utilityProvider: lead.utilityProvider,
    monthlySpend: portfolio.averageMonthlySpendExVat,
    monthlyKwh: portfolio.averageMonthlyKwh,
    billPortfolio: portfolio,
  });

  const existingEvents = Array.isArray(lead.payload?.events) ? lead.payload.events : [];
  const assessmentAlreadyRecorded = existingEvents.some((event) =>
    event
    && typeof event === "object"
    && !Array.isArray(event)
    && (event as Record<string, unknown>).title === FOUNDATION_ASSESSMENT_COMPLETED_EVENT,
  );
  if (!assessmentAlreadyRecorded) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const nextPayload = {
        ...(lead.payload ?? {}),
        readinessScore: Math.max(Number(lead.payload?.readinessScore ?? 0), 72),
        lastTouched: "Just now",
        nextAction: hasSignedEoi
          ? "Prepare the formal UFMS proposal from the completed Foundation-1 assessment."
          : "Review the completed Foundation-1 assessment, then sign the non-binding post-assessment EOI.",
        events: [
          {
            id: crypto.randomUUID(),
            title: FOUNDATION_ASSESSMENT_COMPLETED_EVENT,
            detail: `The six-period evidence pack produced the completed Foundation-1 assessment at ${proposal.generatedAt}. The non-binding EOI follows this assessment.`,
            createdAt: new Date().toISOString(),
            tone: "system",
          },
          ...existingEvents,
        ],
      };
      const { error } = await supabase
        .from("oneos_admin_leads")
        .update({
          readiness_score: Math.max(Number(lead.payload?.readinessScore ?? 0), 72),
          payload: nextPayload,
        })
        .eq("id", lead.id);
      if (error) {
        return NextResponse.json(
          { ok: false, error: "The assessment was generated but its completion state could not be recorded. Retry before continuing." },
          { status: 500 },
        );
      }
    }
  }

  const proposalAcceptedAt = stringField(lead.payload, "proposalAcceptedAt");
  const mandateToken = stringField(lead.payload, "mandateSigningToken");
  const mandateSignedAt = stringField(lead.payload, "mandateSignedAt");

  const acceptanceReadiness = proposalReadiness(portfolio, hasSignedEoi, {
    requireEngineeringApproval: true,
    engineeringApproved: hasEngineeringApprovedProposal,
  });

  return NextResponse.json({
    ok: true,
    available: true,
    proposal,
    readiness: {
      signedEoi: hasSignedEoi,
      recognisedBillingPeriods: portfolio.uniquePeriodCount,
      requiredBillingPeriods: 6,
      confidence: portfolio.confidence,
      blockers: [],
      warnings: portfolio.warnings,
    },
    accepted: Boolean(proposalAcceptedAt),
    acceptanceReady: acceptanceReadiness.ready,
    acceptanceBlockers: acceptanceReadiness.blockers,
    acceptedAt: proposalAcceptedAt,
    mandateToken: proposalAcceptedAt ? mandateToken : null,
    mandateSignedAt,
    eoiToken: lead.eoiSigningToken,
  });
}

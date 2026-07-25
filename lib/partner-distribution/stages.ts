import type { MigrationCaseStage } from "@/lib/migration-case-store";
import type {
  PartnerCaseSnapshot,
  PartnerMemberSummary,
  PartnerPipelineStage,
  PartnerReferral,
} from "@/lib/partner-distribution/types";

const STAGE_COPY: Record<
  PartnerPipelineStage,
  { foundationOne: string; client: string }
> = {
  invited: {
    foundationOne: "Foundation-1 is waiting for the member to open their invitation.",
    client: "Open the invitation and start the migration assessment.",
  },
  registered: {
    foundationOne: "Foundation-1 has created the member's secure migration case.",
    client: "Continue to the secure migration case.",
  },
  waiting_for_utility_bills: {
    foundationOne: "Foundation-1 is waiting for the six most recent utility billing periods.",
    client: "Upload all six utility billing periods in one bill pack.",
  },
  bills_under_review: {
    foundationOne: "Foundation-1 is validating the supplier, tariff, consumption and billing history.",
    client: "Respond if Foundation-1 asks for a missing or clearer billing period.",
  },
  proposal_being_prepared: {
    foundationOne: "Foundation-1 is preparing the formal migration proposal.",
    client: "No action is required while the proposal is prepared.",
  },
  proposal_ready: {
    foundationOne: "Foundation-1 has completed the bill-audited migration proposal.",
    client: "Review the proposal and complete the non-binding EOI.",
  },
  awaiting_decision: {
    foundationOne: "Foundation-1 has sent the formal migration proposal.",
    client: "Review and accept the formal migration proposal.",
  },
  kyc: {
    foundationOne: "Foundation-1 is coordinating the KYC readiness check.",
    client: "Complete the requested KYC readiness items.",
  },
  funding: {
    foundationOne: "Foundation-1 is coordinating the approved funding submission.",
    client: "Respond to any verified funding-partner query.",
  },
  term_sheet: {
    foundationOne: "Foundation-1 is coordinating the term-sheet decision.",
    client: "Review the term sheet with Foundation-1.",
  },
  migration: {
    foundationOne: "Foundation-1 is coordinating implementation handoff.",
    client: "Complete the agreed implementation actions.",
  },
  completed: {
    foundationOne: "Foundation-1 has recorded the migration as completed.",
    client: "No action is required.",
  },
};

export function partnerPipelineStage(
  canonicalStage: MigrationCaseStage | null,
): PartnerPipelineStage {
  if (!canonicalStage) return "invited";

  switch (canonicalStage) {
    case "bill_pack_required":
      return "waiting_for_utility_bills";
    case "bill_pack_processing":
    case "bill_pack_review":
      return "bills_under_review";
    case "proposal_ready":
    case "proposal_not_recommended":
      return "proposal_ready";
    case "eoi_signed":
      return "proposal_being_prepared";
    case "partner_proposal_ready":
      return "awaiting_decision";
    case "partner_proposal_signed":
    case "kyc_ready":
    case "kyc_verified":
      return "kyc";
    case "submitted_to_funder":
    case "kyc_handed_off":
    case "kyc_direct_submitted":
      return "funding";
    case "term_sheet_issued":
      return "term_sheet";
  }
}

export function buildPartnerMemberSummary(
  referral: PartnerReferral,
  caseSnapshot: PartnerCaseSnapshot | null,
): PartnerMemberSummary {
  const currentStage =
    !caseSnapshot && referral.status === "registered"
      ? "registered"
      : partnerPipelineStage(caseSnapshot?.canonicalStage ?? null);
  const copy = STAGE_COPY[currentStage];

  return {
    referralId: referral.id,
    company: caseSnapshot?.businessName ?? referral.memberBusinessName,
    contactName: caseSnapshot?.contactName ?? null,
    contactEmail: caseSnapshot?.contactEmail ?? referral.invitedEmail,
    invitedAt: referral.invitationSentAt ?? referral.createdAt,
    registeredAt: caseSnapshot?.createdAt ?? referral.registeredAt,
    caseId: caseSnapshot?.id ?? null,
    currentStage,
    canonicalStage: caseSnapshot?.canonicalStage ?? null,
    activeBillFileCount: caseSnapshot?.activeBillFileCount ?? 0,
    proposalGeneratedAt: caseSnapshot?.proposalGeneratedAt ?? null,
    proposalEconomicallyPositive:
      caseSnapshot?.proposalEconomicallyPositive ?? null,
    estimatedMonthlySavingsRands:
      caseSnapshot?.estimatedMonthlySavingsRands ?? null,
    qualifiedDealBookRands: caseSnapshot?.qualifiedDealBookRands ?? 0,
    whatFoundationOneIsDoing: copy.foundationOne,
    clientNextAction: copy.client,
  };
}

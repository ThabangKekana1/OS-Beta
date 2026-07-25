import type {
  PartnerMemberSummary,
  PartnerMissionMetrics,
  PartnerRevenue,
  PartnerSuccessChecklist,
} from "@/lib/partner-distribution/types";

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function calculatePartnerMissionMetrics(
  members: PartnerMemberSummary[],
  revenues: PartnerRevenue[],
): PartnerMissionMetrics {
  const activeMigrations = members.filter(
    (member) => member.currentStage === "migration",
  ).length;
  const businessesMigrated = members.filter(
    (member) => member.currentStage === "completed",
  ).length;

  return {
    businessesInvited: members.length,
    businessesRegistered: members.filter((member) => member.caseId).length,
    utilityBillsUploaded: members.filter(
      (member) => member.activeBillFileCount > 0,
    ).length,
    migrationProposals: members.filter(
      (member) => member.proposalGeneratedAt,
    ).length,
    qualifiedMigrationCases: members.filter(
      (member) => member.proposalEconomicallyPositive === true,
    ).length,
    activeMigrations,
    estimatedMonthlyMemberSavingsRands: sum(
      members.map((member) =>
        Math.max(0, member.estimatedMonthlySavingsRands ?? 0),
      ),
    ),
    qualifiedDealBookRands: sum(
      members.map((member) => Math.max(0, member.qualifiedDealBookRands)),
    ),
    businessesMigrated,
    rewards: {
      configured: revenues.length > 0,
      estimatedRevenuePipelineRands: sum(
        revenues
          .filter(
            (revenue) =>
              revenue.status === "estimated" || revenue.status === "confirmed",
          )
          .map((revenue) => revenue.amountRands),
      ),
      confirmedRevenueRands: sum(
        revenues
          .filter(
            (revenue) =>
              revenue.status === "confirmed" || revenue.status === "paid",
          )
          .map((revenue) => revenue.amountRands),
      ),
      paymentsReceivedRands: sum(
        revenues
          .filter((revenue) => revenue.status === "paid")
          .map((revenue) => revenue.amountRands),
      ),
    },
  };
}

export function calculatePartnerSuccessChecklist(
  members: PartnerMemberSummary[],
): PartnerSuccessChecklist {
  return {
    firstMemberInvited: members.length > 0,
    firstRegistration: members.some((member) => Boolean(member.caseId)),
    firstBillsUploaded: members.some(
      (member) => member.activeBillFileCount > 0,
    ),
    firstProposalGenerated: members.some((member) =>
      Boolean(member.proposalGeneratedAt),
    ),
    firstProposalAccepted: members.some((member) =>
      [
        "partner_proposal_signed",
        "kyc_ready",
        "kyc_verified",
        "submitted_to_funder",
        "kyc_handed_off",
        "term_sheet_issued",
      ].includes(member.canonicalStage ?? ""),
    ),
    firstMigration: members.some(
      (member) =>
        member.currentStage === "migration" ||
        member.currentStage === "completed",
    ),
  };
}


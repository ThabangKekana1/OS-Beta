import type { MigrationCaseStage } from "@/lib/migration-case-store";

export const PARTNER_TYPES = [
  "association",
  "cooperative",
  "government_programme",
  "consultant",
  "introducer",
] as const;

export type PartnerType = (typeof PARTNER_TYPES)[number];
export type PartnerOnboardingStatus = "pending" | "active" | "suspended";
export type PartnerReferralSource =
  | "paste"
  | "csv"
  | "individual_link"
  | "campaign_link"
  | "legacy";
export type PartnerReferralStatus =
  | "invited"
  | "registered"
  | "active"
  | "completed"
  | "cancelled"
  | "failed";
export type PartnerRevenueStatus = "estimated" | "confirmed" | "paid" | "void";

export type PartnerPipelineStage =
  | "invited"
  | "registered"
  | "waiting_for_utility_bills"
  | "bills_under_review"
  | "proposal_being_prepared"
  | "proposal_ready"
  | "awaiting_decision"
  | "kyc"
  | "funding"
  | "term_sheet"
  | "migration"
  | "completed";

export type PartnerOrganisation = {
  id: string;
  name: string;
  partnerType: PartnerType;
  onboardingStatus: PartnerOnboardingStatus;
  referralCode: string;
  contactName: string | null;
  contactEmail: string | null;
};

export type PartnerUser = {
  id: string;
  authUserId: string | null;
  organisationId: string;
  email: string;
  name: string;
  isActive: boolean;
};

export type PartnerReferral = {
  id: string;
  associationId: string;
  invitedEmail: string | null;
  memberBusinessName: string | null;
  source: PartnerReferralSource;
  status: PartnerReferralStatus;
  createdAt: string;
  invitationSentAt: string | null;
  registeredAt: string | null;
};

export type PartnerAgreement = {
  id: string;
  associationId: string;
  version: string;
  status: "draft" | "active" | "superseded" | "terminated";
  terms: Record<string, unknown>;
  acceptedByUserId: string | null;
  acceptedAt: string | null;
  effectiveAt: string | null;
};

export type PartnerRevenue = {
  id: string;
  associationId: string;
  caseId: string | null;
  status: PartnerRevenueStatus;
  amountRands: number;
};

export type PartnerActivity = {
  id: string;
  associationId: string;
  actorUserId: string | null;
  referralId: string | null;
  caseId: string | null;
  eventType:
    | "onboarding_started"
    | "onboarding_completed"
    | "invitation_created"
    | "invitation_sent"
    | "invitation_failed"
    | "invitation_cancelled"
    | "referral_registered"
    | "campaign_link_copied"
    | "partner_login"
    | "agreement_accepted"
    | "revenue_recorded";
  safeDetail: string | null;
  safeMetadata: Record<string, unknown>;
  createdAt: string;
};

export type PartnerCaseSnapshot = {
  id: string;
  referralId: string;
  businessName: string;
  contactName: string;
  contactEmail: string;
  canonicalStage: MigrationCaseStage;
  createdAt: string;
  activeBillFileCount: number;
  billPackCreatedAt: string | null;
  proposalGeneratedAt: string | null;
  proposalEconomicallyPositive: boolean | null;
  estimatedMonthlySavingsRands: number | null;
  qualifiedDealBookRands: number;
};

export type PartnerMemberSummary = {
  referralId: string;
  company: string | null;
  contactName: string | null;
  contactEmail: string | null;
  invitedAt: string;
  registeredAt: string | null;
  caseId: string | null;
  currentStage: PartnerPipelineStage;
  canonicalStage: MigrationCaseStage | null;
  activeBillFileCount: number;
  proposalGeneratedAt: string | null;
  proposalEconomicallyPositive: boolean | null;
  estimatedMonthlySavingsRands: number | null;
  qualifiedDealBookRands: number;
  whatFoundationOneIsDoing: string;
  clientNextAction: string;
};

export type PartnerMissionMetrics = {
  businessesInvited: number;
  businessesRegistered: number;
  utilityBillsUploaded: number;
  migrationProposals: number;
  qualifiedMigrationCases: number;
  activeMigrations: number;
  estimatedMonthlyMemberSavingsRands: number;
  qualifiedDealBookRands: number;
  businessesMigrated: number;
  rewards: {
    configured: boolean;
    estimatedRevenuePipelineRands: number;
    confirmedRevenueRands: number;
    paymentsReceivedRands: number;
  };
};

export type PartnerSuccessChecklist = {
  firstMemberInvited: boolean;
  firstRegistration: boolean;
  firstBillsUploaded: boolean;
  firstProposalGenerated: boolean;
  firstProposalAccepted: boolean;
  firstMigration: boolean;
};

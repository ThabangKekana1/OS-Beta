export const adminLeadStages = [
  "Client Registered",
  "EOI Generated",
  "EOI Signed",
  "Utility Bills Uploaded",
  "Compliance Pack Uploaded",
  "Term Sheet Uploaded",
  "Onboarding Complete",
  "Disqualified",
] as const;

export type AdminLeadStage = (typeof adminLeadStages)[number];
export type AdminLeadPriority = "Standard" | "Priority" | "Executive";
export const adminLeadContactStatuses = [
  "Not Contacted",
  "Contacted",
  "Interested",
  "Not Interested",
  "Follow Up",
  "Converted",
] as const;
export type AdminLeadContactStatus = (typeof adminLeadContactStatuses)[number];
export const adminLeadOrigins = ["created", "website", "imported"] as const;
export type AdminLeadOrigin = (typeof adminLeadOrigins)[number];
export const adminLeadOriginLabels: Record<AdminLeadOrigin, string> = {
  created: "Created",
  website: "Migrate",
  imported: "Imported",
};
export const adminLeadPartners = ["Foundation-1", "New Lantern"] as const;
export type AdminLeadPartner = (typeof adminLeadPartners)[number];

export const partnerOrgTiers = ["Standard", "Bronze", "Silver", "Gold"] as const;
export type PartnerOrgTier = (typeof partnerOrgTiers)[number];

export const partnerOrgStatuses = ["Active", "Paused", "Archived"] as const;
export type PartnerOrgStatus = (typeof partnerOrgStatuses)[number];

export interface PartnerOrg {
  id: string;
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  tier: PartnerOrgTier;
  commissionPct: number;
  status: PartnerOrgStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
export const salesLeadQualificationStages = [
  "Havent Contacted",
  "Contacted",
  "Interested",
  "Not Interested",
  "Does Not Qualify",
  "Qualifies",
] as const;
export type SalesLeadQualificationStage = (typeof salesLeadQualificationStages)[number];
export type SalesLeadStatus = "Open" | "Converted";
export type SalesLeadCreatorRole = "admin" | "sales" | "partner";
export type AdminTaskStatus = "open" | "done";
export type AdminTaskOwner = "Agent" | "Client" | "Ops" | "Legal";
export type AdminEventTone = "system" | "agent" | "client";
export type AdminDocumentStatus =
  | "pending"
  | "received"
  | "reviewed"
  | "issued"
  | "signed";
export type AdminDocumentUploaderType = "Client" | "Sales Team" | "Admin Team";
export type RegistrationSourceRole = "admin" | "sales" | "partner";

export interface AdminAgent {
  id: string;
  name: string;
  role: "Admin" | "Sales Agent" | "Sales Manager" | "RevOps";
  region: string;
}

export interface AdminLeadTask {
  id: string;
  title: string;
  owner: AdminTaskOwner;
  dueLabel: string;
  status: AdminTaskStatus;
}

export interface AdminLeadNote {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}

export interface AdminLeadEvent {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  tone: AdminEventTone;
}

export interface AdminLeadDocument {
  id: string;
  title: string;
  category: string;
  fileType: "PDF" | "DOCX" | "XLSX" | "PNG" | "TXT";
  status: AdminDocumentStatus;
  uploadedAt: string;
  uploadedBy: string;
  uploadedByType: AdminDocumentUploaderType;
  sourceAccount: string;
  sourceWorkspace: string;
  storagePath?: string | null;
  fileName?: string | null;
  contentType?: string | null;
}

export interface OneOSUserProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  joinedAt: string;
}

export interface AdminLeadRegistrationSource {
  linkId: string;
  profileName: string;
  profileRole: RegistrationSourceRole;
  profileAgentId: string | null;
  partnerOrgId?: string | null;
  channel: "dashboard" | "public_link";
}

export interface AdminLeadDisqualification {
  reason: string;
  by: string;
  at: string;
}

export interface MigrationAssessmentLeadSummary {
  profileId?: string | null;
  qualificationStatus?: string | null;
  recommendedPathway?: string | null;
  monthlySpend?: number | null;
  annualSpend?: number | null;
  tenYearSpend?: number | null;
  bestTenYearSaving?: number | null;
  preferredContactMethod?: "email" | "whatsapp" | "phone" | string | null;
  sourceCampaign?: string | null;
  referrer?: string | null;
  generatedAt?: string | null;
}

export interface SalesLead {
  id: string;
  ownerId: string;
  createdByRole: SalesLeadCreatorRole;
  createdByEmail: string | null;
  contactName: string;
  company: string;
  email: string;
  qualificationStage: SalesLeadQualificationStage;
  qualificationReason: string | null;
  status: SalesLeadStatus;
  createdAt: string;
  lastUpdatedAt: string;
  convertedClientProfileId: string | null;
  linkedAdminLeadId: string | null;
  partnerOrgId?: string | null;
}

export interface AdminLead {
  id: string;
  clientProfileId: string;
  createdAt: string;
  registeredAt: string | null;
  manuallyAddedAt: string | null;
  company: string;
  businessRegistrationNumber: string;
  industry: string;
  contactFirstName?: string;
  contactSurname?: string;
  contactPosition?: string;
  contactName: string;
  monthlyElectricitySpendEstimateZar: number;
  isBusinessRegistered: boolean;
  isClientRegistered: boolean;
  isBusinessOperational: boolean;
  hasSixMonthUtilityBill: boolean;
  physicalAddress: string;
  city: string;
  province: string;
  source: "Migrate Portal" | "Referral" | "Outbound";
  origin: AdminLeadOrigin;
  partner: AdminLeadPartner | null;
  partnerOrgId?: string | null;
  stage: AdminLeadStage;
  contactStatus: AdminLeadContactStatus;
  priority: AdminLeadPriority;
  ownerId: string;
  linkedSalesLeadId: string | null;
  registrationSource?: AdminLeadRegistrationSource | null;
  migrationAssessment?: MigrationAssessmentLeadSummary | null;
  readinessScore: number;
  estimatedValueZar: number;
  lastTouched: string;
  nextAction: string;
  migrateAccountName: string;
  migrateAccountId: string;
  userProfile: OneOSUserProfile;
  eoiSigningToken: string | null;
  eoiSignatureId: string | null;
  eoiSignedBy: string | null;
  eoiSignedAt: string | null;
  eoiAcceptedTermsAt: string | null;
  onboardingCompletedAt: string | null;
  disqualification: AdminLeadDisqualification | null;
  tasks: AdminLeadTask[];
  documents: AdminLeadDocument[];
  notes: AdminLeadNote[];
  events: AdminLeadEvent[];
}

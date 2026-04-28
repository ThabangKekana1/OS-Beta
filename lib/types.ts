export const migrationStages = [
  "New",
  "Registered",
  "Qualification In Progress",
  "Awaiting Service Acceptance",
  "Awaiting Documents",
  "Documents Under Review",
  "Proposal Issued",
  "Awaiting Signed Proposal",
  "Term Sheet Issued",
  "Awaiting Signed Term Sheet",
  "Internal Review",
  "Close Ready",
  "Closed",
] as const;

export const conversationModes = [
  "Migrate",
  "Qualify",
  "Register",
  "Review Documents",
  "Proposal Support",
  "Term Sheet Support",
  "Close Deal",
] as const;

export type CaseStage = (typeof migrationStages)[number];
export type ConversationMode = (typeof conversationModes)[number];
export type MessageType = "user" | "assistant" | "system" | "internal";
export type ProductLine = "Generocity" | "Lumen-1";
export type DocumentStatus =
  | "available"
  | "pending"
  | "received"
  | "reviewed"
  | "issued"
  | "signed";
export type TaskStatus = "open" | "done" | "blocked";

export interface WorkspaceOption {
  id: string;
  label: string;
  description: string;
}

export interface NavItem {
  id: string;
  label: string;
  href: string;
  count?: number;
}

export interface BusinessLocation {
  id: string;
  label: string;
  address: string;
  city: string;
  province: string;
}

export interface Business {
  id: string;
  name: string;
  legalName: string;
  sector: string;
  location: string;
  province: string;
  locations: BusinessLocation[];
  monthlySpendZar: number;
  averageMonthlyUsageKwh: number;
  siteCount: number;
  decisionMaker: string;
}

export interface ConversationMessage {
  id: string;
  type: MessageType;
  title?: string;
  content: string;
  timestamp: string;
  mode?: ConversationMode;
}

export interface DocumentSubmission {
  id: string;
  title: string;
  category: string;
  fileType: "PDF" | "DOCX" | "XLSX" | "PNG";
  status: DocumentStatus;
  updatedAt: string;
  size: string;
  audience: "Client" | "Internal" | "Shared";
}

export interface Proposal {
  id: string;
  status: "draft" | "issued" | "signed";
  title: string;
  summary: string;
  savingsRange: string;
  termYears: number;
  updatedAt: string;
}

export interface TermSheet {
  id: string;
  status: "draft" | "issued" | "signed";
  title: string;
  summary: string;
  updatedAt: string;
}

export interface ActivityEvent {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  tone: "system" | "client" | "internal";
}

export interface TaskItem {
  id: string;
  title: string;
  owner: "Client" | "1OS" | "Legal";
  dueLabel: string;
  status: TaskStatus;
}

export interface QualificationSummary {
  recommendedProduct: ProductLine | null;
  confidence: "High" | "Medium" | "Manual Review";
  tariffProfile: string;
  loadProfile: string;
  rationale: string[];
}

export interface ChecklistItem {
  id: string;
  label: string;
  complete: boolean;
}

export interface MigrationCase {
  id: string;
  business: Business;
  stage: CaseStage;
  owner: string;
  nextAction: string;
  lastUpdated: string;
  priority: "Standard" | "Priority" | "Executive";
  productRecommendation: ProductLine | null;
  qualificationSummary: QualificationSummary;
  missingItems: string[];
  messages: ConversationMessage[];
  documents: DocumentSubmission[];
  proposal: Proposal | null;
  termSheet: TermSheet | null;
  activity: ActivityEvent[];
  tasks: TaskItem[];
  closeChecklist: ChecklistItem[];
}

export interface ResourceItem {
  id: string;
  title: string;
  category: string;
  summary: string;
  fileType: "PDF" | "DOCX";
  size: string;
  updatedAt: string;
  audience: "Client" | "Internal" | "Shared";
}

export interface DocumentCentreEntry {
  id: string;
  title: string;
  category: string;
  fileType: string;
  status: string;
  updatedAt: string;
  size: string;
  sourceType: "Case" | "Resource";
  sourceLabel: string;
  caseId?: string;
}

export const caseStageLabels: Record<CaseStage, string> = {
  New: "Getting Started",
  Registered: "Registered",
  "Qualification In Progress": "Qualification in Progress",
  "Awaiting Service Acceptance": "Waiting for Your Approval",
  "Awaiting Documents": "Waiting for Your Documents",
  "Documents Under Review": "In 1OS Review",
  "Proposal Issued": "Proposal Ready",
  "Awaiting Signed Proposal": "Waiting for Signed Proposal",
  "Term Sheet Issued": "Term Sheet Ready",
  "Awaiting Signed Term Sheet": "Waiting for Signed Term Sheet",
  "Internal Review": "Final 1OS Review",
  "Close Ready": "Ready to Close",
  Closed: "Migration Closed",
};

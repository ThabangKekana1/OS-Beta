import "dotenv/config";
import { PrismaClient, UserRole, StageCategory } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const databaseConnectionString = connectionString;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseConnectionString }),
});

function isLocalDatabase(url: string) {
  try {
    const parsed = new URL(url);
    return ["localhost", "127.0.0.1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

async function main() {
  console.log("Seeding Foundation-1 configuration...");

  // ── Stage Definitions ──
  const stages = [
    { code: "LEAD_SOURCED", name: "Lead Sourced", orderIndex: 1, ownerRole: "SALES_REPRESENTATIVE" as UserRole, category: "EARLY_LEAD" as StageCategory, isTerminal: false, isCustomerVisible: false, targetDurationHours: 24 },
    { code: "REGISTRATION_LINK_SENT", name: "Registration Link Sent", orderIndex: 2, ownerRole: "SALES_REPRESENTATIVE" as UserRole, category: "EARLY_LEAD" as StageCategory, isTerminal: false, isCustomerVisible: false, targetDurationHours: 48 },
    { code: "BUSINESS_REGISTERED", name: "Business Registered", orderIndex: 3, ownerRole: "BUSINESS_USER" as UserRole, category: "REGISTRATION" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 72 },
    { code: "APPLICATION_COMPLETED", name: "Application Completed", orderIndex: 4, ownerRole: "BUSINESS_USER" as UserRole, category: "REGISTRATION" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 48 },
    { code: "FOUNDATION_ONE_CONTRACT_SIGNED", name: "Foundation-1 Contract Signed", orderIndex: 5, ownerRole: "BUSINESS_USER" as UserRole, category: "REGISTRATION" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 72 },
    { code: "EXPRESSION_OF_INTEREST_REQUESTED", name: "Expression of Interest Requested", orderIndex: 6, ownerRole: "ADMINISTRATOR" as UserRole, category: "EXPRESSION_OF_INTEREST" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 24 },
    { code: "EXPRESSION_OF_INTEREST_UPLOADED", name: "Expression of Interest Uploaded", orderIndex: 7, ownerRole: "BUSINESS_USER" as UserRole, category: "EXPRESSION_OF_INTEREST" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 72 },
    { code: "EXPRESSION_OF_INTEREST_SENT_TO_PARTNER", name: "EoI Sent to Partner", orderIndex: 8, ownerRole: "ADMINISTRATOR" as UserRole, category: "EXPRESSION_OF_INTEREST" as StageCategory, isTerminal: false, isCustomerVisible: false, targetDurationHours: 48 },
    { code: "EXPRESSION_OF_INTEREST_APPROVED", name: "Expression of Interest Approved", orderIndex: 9, ownerRole: "ADMINISTRATOR" as UserRole, category: "EXPRESSION_OF_INTEREST" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 120 },
    { code: "UTILITY_BILL_REQUESTED", name: "Utility Bill Requested", orderIndex: 10, ownerRole: "ADMINISTRATOR" as UserRole, category: "UTILITY_REVIEW" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 24 },
    { code: "UTILITY_BILL_UPLOADED", name: "Utility Bill Uploaded", orderIndex: 11, ownerRole: "BUSINESS_USER" as UserRole, category: "UTILITY_REVIEW" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 72 },
    { code: "UTILITY_BILL_SENT_TO_PARTNER", name: "Utility Bill Sent to Partner", orderIndex: 12, ownerRole: "ADMINISTRATOR" as UserRole, category: "UTILITY_REVIEW" as StageCategory, isTerminal: false, isCustomerVisible: false, targetDurationHours: 120 },
    { code: "PROPOSAL_RECEIVED", name: "Proposal Received", orderIndex: 13, ownerRole: "ADMINISTRATOR" as UserRole, category: "PROPOSAL" as StageCategory, isTerminal: false, isCustomerVisible: false, targetDurationHours: 48 },
    { code: "PROPOSAL_DELIVERED_TO_BUSINESS", name: "Proposal Delivered", orderIndex: 14, ownerRole: "ADMINISTRATOR" as UserRole, category: "PROPOSAL" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 24 },
    { code: "PROPOSAL_SIGNED_BY_BUSINESS", name: "Proposal Signed", orderIndex: 15, ownerRole: "BUSINESS_USER" as UserRole, category: "PROPOSAL" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 120 },
    { code: "PROPOSAL_SENT_TO_PARTNER", name: "Proposal Sent to Partner", orderIndex: 16, ownerRole: "ADMINISTRATOR" as UserRole, category: "PROPOSAL" as StageCategory, isTerminal: false, isCustomerVisible: false, targetDurationHours: 48 },
    { code: "TERM_SHEET_RECEIVED", name: "Term Sheet Received", orderIndex: 17, ownerRole: "ADMINISTRATOR" as UserRole, category: "TERM_SHEET" as StageCategory, isTerminal: false, isCustomerVisible: false, targetDurationHours: 48 },
    { code: "TERM_SHEET_DELIVERED_TO_BUSINESS", name: "Term Sheet Delivered", orderIndex: 18, ownerRole: "ADMINISTRATOR" as UserRole, category: "TERM_SHEET" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 24 },
    { code: "TERM_SHEET_SIGNED_BY_BUSINESS", name: "Term Sheet Signed", orderIndex: 19, ownerRole: "BUSINESS_USER" as UserRole, category: "TERM_SHEET" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 120 },
    { code: "TERM_SHEET_SENT_TO_PARTNER", name: "Term Sheet Sent to Partner", orderIndex: 20, ownerRole: "ADMINISTRATOR" as UserRole, category: "TERM_SHEET" as StageCategory, isTerminal: false, isCustomerVisible: false, targetDurationHours: 48 },
    { code: "KNOW_YOUR_CUSTOMER_REQUESTED", name: "KYC Requested", orderIndex: 21, ownerRole: "ADMINISTRATOR" as UserRole, category: "KNOW_YOUR_CUSTOMER" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 24 },
    { code: "KNOW_YOUR_CUSTOMER_UPLOADED", name: "KYC Uploaded", orderIndex: 22, ownerRole: "BUSINESS_USER" as UserRole, category: "KNOW_YOUR_CUSTOMER" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 120 },
    { code: "KNOW_YOUR_CUSTOMER_SENT_TO_PARTNER", name: "KYC Sent to Partner", orderIndex: 23, ownerRole: "ADMINISTRATOR" as UserRole, category: "KNOW_YOUR_CUSTOMER" as StageCategory, isTerminal: false, isCustomerVisible: false, targetDurationHours: 120 },
    { code: "NEDBANK_APPROVED", name: "Nedbank Approved", orderIndex: 24, ownerRole: "ADMINISTRATOR" as UserRole, category: "APPROVAL" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 240 },
    { code: "SITE_INSPECTION_STARTED", name: "Site Inspection Started", orderIndex: 25, ownerRole: "ADMINISTRATOR" as UserRole, category: "DELIVERY" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 168 },
    { code: "INSTALLATION_IN_PROGRESS", name: "Installation In Progress", orderIndex: 26, ownerRole: "ADMINISTRATOR" as UserRole, category: "DELIVERY" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: 336 },
    { code: "COMMISSIONED", name: "Commissioned", orderIndex: 27, ownerRole: "ADMINISTRATOR" as UserRole, category: "DELIVERY" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: null },
    { code: "ACTIVE_SUPPORT", name: "Active Support", orderIndex: 28, ownerRole: "ADMINISTRATOR" as UserRole, category: "LIVE_SUPPORT" as StageCategory, isTerminal: false, isCustomerVisible: true, targetDurationHours: null },
    { code: "DISQUALIFIED", name: "Disqualified", orderIndex: 99, ownerRole: "ADMINISTRATOR" as UserRole, category: "CLOSED" as StageCategory, isTerminal: true, isCustomerVisible: true, targetDurationHours: null },
    { code: "LOST", name: "Lost", orderIndex: 100, ownerRole: "ADMINISTRATOR" as UserRole, category: "CLOSED" as StageCategory, isTerminal: true, isCustomerVisible: true, targetDurationHours: null },
  ];

  for (const s of stages) {
    await prisma.pipelineStageDefinition.upsert({
      where: { code: s.code },
      update: s,
      create: s,
    });
  }
  console.log(`  ${stages.length} stage definitions seeded`);

  // ── Document Type Definitions ──
  const docTypes = [
    { code: "FOUNDATION_ONE_CONTRACT", name: "Foundation-1 Contract", requiredForStageCode: "FOUNDATION_ONE_CONTRACT_SIGNED", visibleToBusiness: true, visibleToSalesRepresentative: true, visibleToAdministrator: true, canBusinessUpload: true, canAdministratorUpload: true, requiresReview: true },
    { code: "EXPRESSION_OF_INTEREST", name: "Expression of Interest", requiredForStageCode: "EXPRESSION_OF_INTEREST_UPLOADED", visibleToBusiness: true, visibleToSalesRepresentative: true, visibleToAdministrator: true, canBusinessUpload: true, canAdministratorUpload: true, requiresReview: true },
    { code: "SIX_MONTH_UTILITY_BILL", name: "Six Month Utility Bill", requiredForStageCode: "UTILITY_BILL_UPLOADED", visibleToBusiness: true, visibleToSalesRepresentative: true, visibleToAdministrator: true, canBusinessUpload: true, canAdministratorUpload: true, requiresReview: true },
    { code: "PROPOSAL", name: "Proposal", requiredForStageCode: "PROPOSAL_RECEIVED", visibleToBusiness: true, visibleToSalesRepresentative: false, visibleToAdministrator: true, canBusinessUpload: false, canAdministratorUpload: true, requiresReview: false },
    { code: "SIGNED_PROPOSAL", name: "Signed Proposal", requiredForStageCode: "PROPOSAL_SIGNED_BY_BUSINESS", visibleToBusiness: true, visibleToSalesRepresentative: false, visibleToAdministrator: true, canBusinessUpload: true, canAdministratorUpload: true, requiresReview: true },
    { code: "TERM_SHEET", name: "Term Sheet", requiredForStageCode: "TERM_SHEET_RECEIVED", visibleToBusiness: true, visibleToSalesRepresentative: false, visibleToAdministrator: true, canBusinessUpload: false, canAdministratorUpload: true, requiresReview: false },
    { code: "SIGNED_TERM_SHEET", name: "Signed Term Sheet", requiredForStageCode: "TERM_SHEET_SIGNED_BY_BUSINESS", visibleToBusiness: true, visibleToSalesRepresentative: false, visibleToAdministrator: true, canBusinessUpload: true, canAdministratorUpload: true, requiresReview: true },
    { code: "KYC_DOCUMENT_PACK", name: "Know Your Customer Document Pack", requiredForStageCode: "KNOW_YOUR_CUSTOMER_UPLOADED", visibleToBusiness: true, visibleToSalesRepresentative: false, visibleToAdministrator: true, canBusinessUpload: true, canAdministratorUpload: true, requiresReview: true },
    { code: "SITE_INSPECTION_PACK", name: "Site Inspection Pack", requiredForStageCode: "SITE_INSPECTION_STARTED", visibleToBusiness: true, visibleToSalesRepresentative: false, visibleToAdministrator: true, canBusinessUpload: false, canAdministratorUpload: true, requiresReview: false },
    { code: "INSTALLATION_COMPLETION_PACK", name: "Installation Completion Pack", requiredForStageCode: "INSTALLATION_IN_PROGRESS", visibleToBusiness: true, visibleToSalesRepresentative: false, visibleToAdministrator: true, canBusinessUpload: false, canAdministratorUpload: true, requiresReview: false },
  ];

  for (const dt of docTypes) {
    const { requiredForStageCode, ...dtData } = dt;
    const stage = await prisma.pipelineStageDefinition.findUnique({ where: { code: requiredForStageCode } });
    await prisma.documentTypeDefinition.upsert({
      where: { code: dt.code },
      update: { ...dtData, requiredForStageId: stage?.id },
      create: { ...dtData, requiredForStageId: stage?.id },
    });
  }
  console.log(`  ${docTypes.length} document type definitions seeded`);

  // ── Stall Reason Definitions ──
  const stallReasons = [
    { code: "NO_RESPONSE_FROM_BUSINESS", name: "No Response from Business", category: "Business" },
    { code: "INCOMPLETE_APPLICATION", name: "Incomplete Application", category: "Business" },
    { code: "FOUNDATION_ONE_CONTRACT_NOT_SIGNED", name: "Foundation-1 Contract Not Signed", category: "Business" },
    { code: "EXPRESSION_OF_INTEREST_MISSING", name: "Expression of Interest Missing", category: "Document" },
    { code: "EXPRESSION_OF_INTEREST_REJECTED", name: "Expression of Interest Rejected", category: "Document" },
    { code: "UTILITY_BILL_MISSING", name: "Utility Bill Missing", category: "Document" },
    { code: "UTILITY_BILL_BELOW_THRESHOLD", name: "Utility Bill Below Threshold", category: "Qualification" },
    { code: "PROPOSAL_DELAYED_BY_PARTNER", name: "Proposal Delayed by Partner", category: "Partner" },
    { code: "PROPOSAL_NOT_ACCEPTED_BY_BUSINESS", name: "Proposal Not Accepted by Business", category: "Business" },
    { code: "TERM_SHEET_DELAYED_BY_PARTNER", name: "Term Sheet Delayed by Partner", category: "Partner" },
    { code: "TERM_SHEET_NOT_SIGNED", name: "Term Sheet Not Signed", category: "Business" },
    { code: "KNOW_YOUR_CUSTOMER_INCOMPLETE", name: "KYC Incomplete", category: "Document" },
    { code: "KNOW_YOUR_CUSTOMER_REJECTED", name: "KYC Rejected", category: "Document" },
    { code: "BANK_APPROVAL_PENDING", name: "Bank Approval Pending", category: "Partner" },
    { code: "SITE_INSPECTION_PENDING", name: "Site Inspection Pending", category: "Delivery" },
    { code: "ADMINISTRATOR_BACKLOG", name: "Administrator Backlog", category: "Internal" },
    { code: "SALES_REPRESENTATIVE_POOR_QUALIFICATION", name: "Poor Lead Qualification", category: "Quality" },
    { code: "DUPLICATE_LEAD", name: "Duplicate Lead", category: "Data" },
    { code: "BUSINESS_NO_LONGER_INTERESTED", name: "Business No Longer Interested", category: "Business" },
    { code: "TECHNICAL_PLATFORM_ISSUE", name: "Technical Platform Issue", category: "Internal" },
  ];

  for (const sr of stallReasons) {
    await prisma.stallReasonDefinition.upsert({
      where: { code: sr.code },
      update: sr,
      create: sr,
    });
  }
  console.log(`  ${stallReasons.length} stall reason definitions seeded`);
  console.log("  No demo users or sample business records created");
  console.log("\nSeed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import "dotenv/config";
import { PrismaClient, UserRole, StageCategory } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

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
  console.log("Seeding Foundation-1 Pilot Command Centre...");
  const allowDemoSeed = process.env.ALLOW_DEMO_SEED === "true";
  if (!isLocalDatabase(databaseConnectionString) && !allowDemoSeed) {
    throw new Error("Refusing to seed a non-local database without ALLOW_DEMO_SEED=true");
  }

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

  // ── Pilot Users and Sample Data Reset ──
  const pilotPassword = "Password123!";
  const passwordHash = await bcrypt.hash(pilotPassword, 10);

  await prisma.notification.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.note.deleteMany();
  await prisma.task.deleteMany();
  await prisma.documentSubmission.deleteMany();
  await prisma.pipelineStageHistory.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.dealPipeline.deleteMany();
  await prisma.businessUserProfile.deleteMany();
  await prisma.business.deleteMany();
  await prisma.salesRepresentativeProfile.deleteMany();
  await prisma.user.deleteMany();
  console.log("  Existing pilot users and sample records cleared");

  const superAdmin = await prisma.user.create({
    data: {
      firstName: "Pilot",
      lastName: "Super Admin",
      email: "superadmin@foundation1.test",
      passwordHash,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  });

  const administrator = await prisma.user.create({
    data: {
      firstName: "Pilot",
      lastName: "Administrator",
      email: "admin@foundation1.test",
      passwordHash,
      role: "ADMINISTRATOR",
      status: "ACTIVE",
    },
  });

  const salesRepresentative = await prisma.user.create({
    data: {
      firstName: "Pilot",
      lastName: "Sales",
      email: "rep@foundation1.test",
      passwordHash,
      role: "SALES_REPRESENTATIVE",
      status: "ACTIVE",
    },
  });

  await prisma.salesRepresentativeProfile.create({
    data: {
      userId: salesRepresentative.id,
      uniqueReferralCode: "REP-PILOT-001",
      onboardingStatus: "COMPLETED",
      pilotCohort: "PILOT_1",
      performanceScore: 88,
    },
  });

  const businessUser = await prisma.user.create({
    data: {
      firstName: "Pilot",
      lastName: "Business",
      email: "business@foundation1.test",
      passwordHash,
      role: "BUSINESS_USER",
      status: "ACTIVE",
    },
  });
  console.log("  4 pilot users seeded");

  const stageMap: Record<string, string> = {};
  const allStages = await prisma.pipelineStageDefinition.findMany();
  for (const s of allStages) stageMap[s.code] = s.id;

  const sampleBusinesses = [
    { legalName: "Apex Cold Storage (Pty) Ltd", regNum: "2024/100001/07", industry: "Cold Storage", spend: 26000, stage: "LEAD_SOURCED", qual: "UNASSESSED" as const, stageAgeDays: 2, health: "HEALTHY" as const, isStalled: false, stallReasonCode: null, linkBusinessUser: false },
    { legalName: "BlueWave Farms (Pty) Ltd", regNum: "2024/100002/07", industry: "Agriculture", spend: 34000, stage: "UTILITY_BILL_REQUESTED", qual: "DOCUMENTS_PENDING" as const, stageAgeDays: 3, health: "WAITING_ON_BUSINESS" as const, isStalled: true, stallReasonCode: "UTILITY_BILL_MISSING", linkBusinessUser: false },
    { legalName: "Cedar Logistics (Pty) Ltd", regNum: "2024/100003/07", industry: "Logistics", spend: 54000, stage: "PROPOSAL_DELIVERED_TO_BUSINESS", qual: "QUALIFIED" as const, stageAgeDays: 2, health: "WAITING_ON_BUSINESS" as const, isStalled: false, stallReasonCode: null, linkBusinessUser: false },
    { legalName: "Delta Foods (Pty) Ltd", regNum: "2024/100004/07", industry: "Food Processing", spend: 61000, stage: "TERM_SHEET_DELIVERED_TO_BUSINESS", qual: "QUALIFIED" as const, stageAgeDays: 1, health: "WAITING_ON_BUSINESS" as const, isStalled: false, stallReasonCode: null, linkBusinessUser: true },
    { legalName: "Eagle Manufacturing (Pty) Ltd", regNum: "2024/100005/07", industry: "Manufacturing", spend: 72000, stage: "KNOW_YOUR_CUSTOMER_REQUESTED", qual: "DOCUMENTS_PENDING" as const, stageAgeDays: 2, health: "WAITING_ON_BUSINESS" as const, isStalled: false, stallReasonCode: null, linkBusinessUser: false },
    { legalName: "Frontier Retail (Pty) Ltd", regNum: "2024/100006/07", industry: "Retail", spend: 49000, stage: "NEDBANK_APPROVED", qual: "QUALIFIED" as const, stageAgeDays: 4, health: "WAITING_ON_PARTNER" as const, isStalled: false, stallReasonCode: null, linkBusinessUser: false },
    { legalName: "Granite Works (Pty) Ltd", regNum: "2024/100007/07", industry: "Construction", spend: 14000, stage: "DISQUALIFIED", qual: "DISQUALIFIED" as const, stageAgeDays: 5, health: "STALLED" as const, isStalled: false, stallReasonCode: null, linkBusinessUser: false },
    { legalName: "Harbour Engineering (Pty) Ltd", regNum: "2024/100008/07", industry: "Engineering", spend: 57000, stage: "PROPOSAL_SIGNED_BY_BUSINESS", qual: "QUALIFIED" as const, stageAgeDays: 2, health: "WAITING_ON_ADMINISTRATOR" as const, isStalled: true, stallReasonCode: "ADMINISTRATOR_BACKLOG", linkBusinessUser: false },
  ];

  const previousStageByCurrent: Record<string, string | null> = {
    LEAD_SOURCED: null,
    UTILITY_BILL_REQUESTED: "EXPRESSION_OF_INTEREST_APPROVED",
    PROPOSAL_DELIVERED_TO_BUSINESS: "PROPOSAL_RECEIVED",
    TERM_SHEET_DELIVERED_TO_BUSINESS: "TERM_SHEET_RECEIVED",
    KNOW_YOUR_CUSTOMER_REQUESTED: "TERM_SHEET_SENT_TO_PARTNER",
    NEDBANK_APPROVED: "KNOW_YOUR_CUSTOMER_SENT_TO_PARTNER",
    DISQUALIFIED: "APPLICATION_COMPLETED",
    PROPOSAL_SIGNED_BY_BUSINESS: "PROPOSAL_DELIVERED_TO_BUSINESS",
  };

  const businessesByRegistration = new Map<string, { id: string; dealPipelineId: string }>();

  for (const sampleBusiness of sampleBusinesses) {
    const stageEnteredAt = new Date(Date.now() - sampleBusiness.stageAgeDays * 24 * 60 * 60 * 1000);

    const business = await prisma.business.create({
      data: {
        legalName: sampleBusiness.legalName,
        tradingName: sampleBusiness.legalName.replace(/ \(Pty\) Ltd/, ""),
        registrationNumber: sampleBusiness.regNum,
        industry: sampleBusiness.industry,
        monthlyElectricitySpendEstimate: sampleBusiness.spend,
        contactPersonName: `${sampleBusiness.legalName.split(" ")[0]} Contact`,
        contactPersonEmail: `contact@${sampleBusiness.legalName.split(" ")[0].toLowerCase()}.test`,
        contactPersonPhone: "+27110000000",
        physicalAddress: "1 Pilot Street",
        city: "Johannesburg",
        province: "Gauteng",
        sourceSalesRepresentativeId: salesRepresentative.id,
        assignedAdministratorId: administrator.id,
        currentStageId: stageMap[sampleBusiness.stage],
        qualificationStatus: sampleBusiness.qual,
        disqualificationReason: sampleBusiness.qual === "DISQUALIFIED" ? "Electricity spend below pilot threshold" : null,
      },
    });

    const dealPipeline = await prisma.dealPipeline.create({
      data: {
        businessId: business.id,
        sourceSalesRepresentativeId: salesRepresentative.id,
        assignedAdministratorId: administrator.id,
        currentStageId: stageMap[sampleBusiness.stage],
        stageEnteredAt,
        isStalled: sampleBusiness.isStalled,
        stalledAt: sampleBusiness.isStalled ? new Date(stageEnteredAt.getTime() + 6 * 60 * 60 * 1000) : null,
        stallReasonCode: sampleBusiness.stallReasonCode,
        priority: sampleBusiness.spend >= 55000 ? "HIGH" : sampleBusiness.spend >= 30000 ? "MEDIUM" : "LOW",
        healthStatus: sampleBusiness.health,
      },
    });

    const previousStageCode = previousStageByCurrent[sampleBusiness.stage];
    if (previousStageCode) {
      await prisma.pipelineStageHistory.create({
        data: {
          dealPipelineId: dealPipeline.id,
          fromStageId: null,
          toStageId: stageMap[previousStageCode],
          changedByUserId: sampleBusiness.stage === "LEAD_SOURCED" ? salesRepresentative.id : administrator.id,
          changedAt: new Date(stageEnteredAt.getTime() - 48 * 60 * 60 * 1000),
          note: "Pilot seed progression",
        },
      });
    }

    await prisma.pipelineStageHistory.create({
      data: {
        dealPipelineId: dealPipeline.id,
        fromStageId: previousStageCode ? stageMap[previousStageCode] : null,
        toStageId: stageMap[sampleBusiness.stage],
        changedByUserId: sampleBusiness.stage === "LEAD_SOURCED" ? salesRepresentative.id : administrator.id,
        changedAt: stageEnteredAt,
        previousStageDurationHours: previousStageCode ? 48 : null,
        note: "Pilot seed current stage",
      },
    });

    if (sampleBusiness.linkBusinessUser) {
      await prisma.businessUserProfile.create({
        data: {
          userId: businessUser.id,
          businessId: business.id,
          title: "Director",
          canSignDocuments: true,
          isPrimaryContact: true,
        },
      });
    }

    businessesByRegistration.set(sampleBusiness.regNum, { id: business.id, dealPipelineId: dealPipeline.id });
  }
  console.log(`  ${sampleBusinesses.length} sample businesses seeded`);

  const sampleDocuments = [
    {
      registrationNumber: "2024/100002/07",
      documentTypeCode: "SIX_MONTH_UTILITY_BILL",
      uploaderId: administrator.id,
      fileName: "bluewave-utility-bill-request.txt",
      fileUrl: "request://utility-bill",
      direction: "ADMIN_TO_BUSINESS" as const,
      purpose: "REQUESTED_DOCUMENT" as const,
      exchangePhase: "UTILITY_BILL" as const,
      businessActionRequired: true,
      adminReviewRequired: false,
      partnerHandoffRequired: false,
      reviewStatus: "APPROVED" as const,
      visibleToBusiness: true,
      visibleToAdministrator: true,
      visibleToSalesRepresentative: true,
    },
    {
      registrationNumber: "2024/100003/07",
      documentTypeCode: "PROPOSAL",
      uploaderId: administrator.id,
      fileName: "cedar-logistics-proposal.pdf",
      fileUrl: "/uploads/cedar-logistics-proposal.pdf",
      direction: "ADMIN_TO_BUSINESS" as const,
      purpose: "DELIVERED_DOCUMENT" as const,
      exchangePhase: "PROPOSAL" as const,
      businessActionRequired: true,
      adminReviewRequired: false,
      partnerHandoffRequired: false,
      reviewStatus: "APPROVED" as const,
      visibleToBusiness: true,
      visibleToAdministrator: true,
      visibleToSalesRepresentative: false,
      businessDownloadedAt: new Date(Date.now() - 36 * 60 * 60 * 1000),
      returnedFromPartnerAt: new Date(Date.now() - 60 * 60 * 60 * 1000),
      partnerStatus: "RECEIVED_FROM_PARTNER",
    },
    {
      registrationNumber: "2024/100004/07",
      documentTypeCode: "TERM_SHEET",
      uploaderId: administrator.id,
      fileName: "delta-foods-term-sheet.pdf",
      fileUrl: "/uploads/delta-foods-term-sheet.pdf",
      direction: "ADMIN_TO_BUSINESS" as const,
      purpose: "DELIVERED_DOCUMENT" as const,
      exchangePhase: "TERM_SHEET" as const,
      businessActionRequired: true,
      adminReviewRequired: false,
      partnerHandoffRequired: false,
      reviewStatus: "APPROVED" as const,
      visibleToBusiness: true,
      visibleToAdministrator: true,
      visibleToSalesRepresentative: false,
      businessDownloadedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      returnedFromPartnerAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      partnerStatus: "RECEIVED_FROM_PARTNER",
    },
    {
      registrationNumber: "2024/100005/07",
      documentTypeCode: "KYC_DOCUMENT_PACK",
      uploaderId: administrator.id,
      fileName: "eagle-manufacturing-kyc-request.txt",
      fileUrl: "request://kyc",
      direction: "ADMIN_TO_BUSINESS" as const,
      purpose: "REQUESTED_DOCUMENT" as const,
      exchangePhase: "KNOW_YOUR_CUSTOMER" as const,
      businessActionRequired: true,
      adminReviewRequired: false,
      partnerHandoffRequired: false,
      reviewStatus: "APPROVED" as const,
      visibleToBusiness: true,
      visibleToAdministrator: true,
      visibleToSalesRepresentative: false,
    },
    {
      registrationNumber: "2024/100008/07",
      documentTypeCode: "PROPOSAL",
      uploaderId: administrator.id,
      fileName: "harbour-engineering-proposal.pdf",
      fileUrl: "/uploads/harbour-engineering-proposal.pdf",
      direction: "ADMIN_TO_BUSINESS" as const,
      purpose: "DELIVERED_DOCUMENT" as const,
      exchangePhase: "PROPOSAL" as const,
      businessActionRequired: false,
      adminReviewRequired: false,
      partnerHandoffRequired: false,
      reviewStatus: "APPROVED" as const,
      visibleToBusiness: true,
      visibleToAdministrator: true,
      visibleToSalesRepresentative: false,
      businessDownloadedAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
      returnedSignedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      returnedFromPartnerAt: new Date(Date.now() - 96 * 60 * 60 * 1000),
      partnerStatus: "RECEIVED_FROM_PARTNER",
    },
    {
      registrationNumber: "2024/100008/07",
      documentTypeCode: "SIGNED_PROPOSAL",
      uploaderId: businessUser.id,
      fileName: "harbour-engineering-signed-proposal.pdf",
      fileUrl: "/uploads/harbour-engineering-signed-proposal.pdf",
      direction: "BUSINESS_TO_ADMIN" as const,
      purpose: "SIGNED_RETURN" as const,
      exchangePhase: "PROPOSAL" as const,
      businessActionRequired: false,
      adminReviewRequired: false,
      partnerHandoffRequired: true,
      reviewStatus: "APPROVED" as const,
      visibleToBusiness: true,
      visibleToAdministrator: true,
      visibleToSalesRepresentative: false,
      parentRegistrationNumber: "2024/100008/07",
      parentFileName: "harbour-engineering-proposal.pdf",
    },
  ];

  for (const sampleDocument of sampleDocuments) {
    const business = businessesByRegistration.get(sampleDocument.registrationNumber);
    const documentType = await prisma.documentTypeDefinition.findUnique({
      where: { code: sampleDocument.documentTypeCode },
    });
    if (!business || !documentType) continue;

    const parentSubmission = sampleDocument.parentFileName
      ? await prisma.documentSubmission.findFirst({
          where: {
            businessId: business.id,
            originalFileName: sampleDocument.parentFileName,
          },
        })
      : null;

    await prisma.documentSubmission.create({
      data: {
        businessId: business.id,
        dealPipelineId: business.dealPipelineId,
        parentSubmissionId: parentSubmission?.id ?? null,
        documentTypeId: documentType.id,
        uploadedByUserId: sampleDocument.uploaderId,
        direction: sampleDocument.direction,
        purpose: sampleDocument.purpose,
        exchangePhase: sampleDocument.exchangePhase,
        visibleToBusiness: sampleDocument.visibleToBusiness,
        visibleToAdministrator: sampleDocument.visibleToAdministrator,
        visibleToSalesRepresentative: sampleDocument.visibleToSalesRepresentative,
        businessActionRequired: sampleDocument.businessActionRequired,
        adminReviewRequired: sampleDocument.adminReviewRequired,
        partnerHandoffRequired: sampleDocument.partnerHandoffRequired,
        fileUrl: sampleDocument.fileUrl,
        originalFileName: sampleDocument.fileName,
        mimeType: sampleDocument.fileName.endsWith(".txt") ? "text/plain" : "application/pdf",
        fileSize: sampleDocument.fileName.endsWith(".txt") ? 0 : 524288,
        versionNumber: 1,
        reviewStatus: sampleDocument.reviewStatus,
        businessDownloadedAt: sampleDocument.businessDownloadedAt ?? null,
        returnedSignedAt: sampleDocument.returnedSignedAt ?? null,
        reviewedByUserId: sampleDocument.reviewStatus === "APPROVED" ? administrator.id : null,
        reviewedAt: sampleDocument.reviewStatus === "APPROVED" ? new Date(Date.now() - 12 * 60 * 60 * 1000) : null,
        forwardedToPartnerAt: null,
        returnedFromPartnerAt: sampleDocument.returnedFromPartnerAt ?? null,
        partnerStatus: sampleDocument.partnerStatus ?? null,
      },
    });

    if (parentSubmission && sampleDocument.purpose === "SIGNED_RETURN") {
      await prisma.documentSubmission.update({
        where: { id: parentSubmission.id },
        data: {
          businessActionRequired: false,
          returnedSignedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });
    }
  }
  console.log(`  ${sampleDocuments.length} exchange documents seeded`);

  const sampleTasks = [
    {
      title: "Review Cedar proposal response",
      registrationNumber: "2024/100003/07",
      assignedToUserId: administrator.id,
      createdByUserId: superAdmin.id,
      description: "Prepare the proposal follow-up if the business has not returned a signed version.",
      taskType: "BUSINESS_FOLLOW_UP",
      priority: "HIGH" as const,
      ownerRole: "ADMINISTRATOR" as UserRole,
      dueAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
    },
    {
      title: "Check Eagle Know Your Customer pack",
      registrationNumber: "2024/100005/07",
      assignedToUserId: administrator.id,
      createdByUserId: superAdmin.id,
      description: "Confirm the outstanding Know Your Customer request is followed up.",
      taskType: "KYC_REVIEW",
      priority: "URGENT" as const,
      ownerRole: "ADMINISTRATOR" as UserRole,
      dueAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
    },
    {
      title: "Forward Harbour signed proposal",
      registrationNumber: "2024/100008/07",
      assignedToUserId: administrator.id,
      createdByUserId: superAdmin.id,
      description: "Signed proposal is approved and waiting for partner handoff.",
      taskType: "DOCUMENT_REVIEW",
      priority: "HIGH" as const,
      ownerRole: "ADMINISTRATOR" as UserRole,
      dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
    {
      title: "Download and sign the term sheet",
      registrationNumber: "2024/100004/07",
      assignedToUserId: businessUser.id,
      createdByUserId: administrator.id,
      description: "Return the signed term sheet to continue the pilot workflow.",
      taskType: "BUSINESS_ACTION",
      priority: "HIGH" as const,
      ownerRole: "BUSINESS_USER" as UserRole,
      dueAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    },
  ];

  for (const sampleTask of sampleTasks) {
    const business = businessesByRegistration.get(sampleTask.registrationNumber);
    if (!business) continue;

    await prisma.task.create({
      data: {
        dealPipelineId: business.dealPipelineId,
        businessId: business.id,
        assignedToUserId: sampleTask.assignedToUserId,
        createdByUserId: sampleTask.createdByUserId,
        title: sampleTask.title,
        description: sampleTask.description,
        taskType: sampleTask.taskType,
        dueAt: sampleTask.dueAt,
        status: "OPEN",
        priority: sampleTask.priority,
        ownerRole: sampleTask.ownerRole,
      },
    });
  }
  console.log(`  ${sampleTasks.length} sample tasks seeded`);

  const sampleLeads = [
    { businessName: "Ivory Packaging (Pty) Ltd", contactName: "Lebo Khosa", contactEmail: "lebo@ivorypackaging.test", status: "NEW" as const },
    { businessName: "Jetstream Textiles (Pty) Ltd", contactName: "Nadia Jacobs", contactEmail: "nadia@jetstreamtextiles.test", status: "INVITE_SENT" as const },
    { businessName: "Kingfisher Milling (Pty) Ltd", contactName: "Peter Naidoo", contactEmail: "peter@kingfishermilling.test", status: "DEAD" as const, deadReason: "No longer interested" },
  ];

  for (const sampleLead of sampleLeads) {
    await prisma.lead.create({
      data: {
        salesRepresentativeId: salesRepresentative.id,
        businessName: sampleLead.businessName,
        contactName: sampleLead.contactName,
        contactEmail: sampleLead.contactEmail,
        status: sampleLead.status,
        inviteSentAt: sampleLead.status === "INVITE_SENT" ? new Date(Date.now() - 24 * 60 * 60 * 1000) : null,
        deadReason: "deadReason" in sampleLead ? sampleLead.deadReason : null,
      },
    });
  }
  console.log(`  ${sampleLeads.length} sample leads seeded`);

  console.log("\nSeed completed successfully!");
  console.log("\nPilot login credentials:");
  console.log(`  Super Admin: superadmin@foundation1.test / ${pilotPassword}`);
  console.log(`  Administrator: admin@foundation1.test / ${pilotPassword}`);
  console.log(`  Sales Representative: rep@foundation1.test / ${pilotPassword}`);
  console.log(`  Business User: business@foundation1.test / ${pilotPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

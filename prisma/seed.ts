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
  console.log("Seeding Foundation-1 configuration...");
  const seedPilotCommunication = process.env.SEED_PILOT_COMMUNICATION === "true";
  const allowDemoSeed = process.env.ALLOW_DEMO_SEED === "true";

  if (seedPilotCommunication && !isLocalDatabase(databaseConnectionString) && !allowDemoSeed) {
    throw new Error("Refusing pilot communication seed on a non-local database without ALLOW_DEMO_SEED=true");
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
  if (!seedPilotCommunication) {
    console.log("  No demo users or sample business records created");
    console.log("\nSeed completed successfully!");
    console.log("  Set SEED_PILOT_COMMUNICATION=true to seed pilot communication examples.");
    return;
  }

  const passwordHash = await bcrypt.hash("Password123!", 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: "superadmin@foundation1.test" },
    update: {
      firstName: "Pilot",
      lastName: "Super Admin",
      passwordHash,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
    create: {
      firstName: "Pilot",
      lastName: "Super Admin",
      email: "superadmin@foundation1.test",
      passwordHash,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  });

  const administrator = await prisma.user.upsert({
    where: { email: "admin@foundation1.test" },
    update: {
      firstName: "Pilot",
      lastName: "Administrator",
      passwordHash,
      role: "ADMINISTRATOR",
      status: "ACTIVE",
    },
    create: {
      firstName: "Pilot",
      lastName: "Administrator",
      email: "admin@foundation1.test",
      passwordHash,
      role: "ADMINISTRATOR",
      status: "ACTIVE",
    },
  });

  const salesRepresentative = await prisma.user.upsert({
    where: { email: "rep@foundation1.test" },
    update: {
      firstName: "Pilot",
      lastName: "Sales",
      passwordHash,
      role: "SALES_REPRESENTATIVE",
      status: "ACTIVE",
    },
    create: {
      firstName: "Pilot",
      lastName: "Sales",
      email: "rep@foundation1.test",
      passwordHash,
      role: "SALES_REPRESENTATIVE",
      status: "ACTIVE",
    },
  });

  const businessUser = await prisma.user.upsert({
    where: { email: "business@foundation1.test" },
    update: {
      firstName: "Pilot",
      lastName: "Business",
      passwordHash,
      role: "BUSINESS_USER",
      status: "ACTIVE",
    },
    create: {
      firstName: "Pilot",
      lastName: "Business",
      email: "business@foundation1.test",
      passwordHash,
      role: "BUSINESS_USER",
      status: "ACTIVE",
    },
  });

  await prisma.salesRepresentativeProfile.upsert({
    where: { userId: salesRepresentative.id },
    update: {
      uniqueReferralCode: "REP-PILOT-001",
      onboardingStatus: "COMPLETED",
      pilotCohort: "PILOT_1",
      performanceScore: 88,
    },
    create: {
      userId: salesRepresentative.id,
      uniqueReferralCode: "REP-PILOT-001",
      onboardingStatus: "COMPLETED",
      pilotCohort: "PILOT_1",
      performanceScore: 88,
    },
  });

  const utilityBillStage = await prisma.pipelineStageDefinition.findUnique({
    where: { code: "UTILITY_BILL_REQUESTED" },
  });

  if (!utilityBillStage) {
    throw new Error("Required stage UTILITY_BILL_REQUESTED not found");
  }

  const business = await prisma.business.upsert({
    where: { registrationNumber: "2026/900001/07" },
    update: {
      legalName: "Pilot Foods (Pty) Ltd",
      tradingName: "Pilot Foods",
      industry: "Food Processing",
      monthlyElectricitySpendEstimate: 61000,
      contactPersonName: "Pilot Contact",
      contactPersonEmail: "contact@pilotfoods.test",
      contactPersonPhone: "+27110000001",
      physicalAddress: "1 Pilot Street",
      city: "Johannesburg",
      province: "Gauteng",
      sourceSalesRepresentativeId: salesRepresentative.id,
      assignedAdministratorId: administrator.id,
      currentStageId: utilityBillStage.id,
      qualificationStatus: "DOCUMENTS_PENDING",
      disqualificationReason: null,
      status: "ACTIVE",
    },
    create: {
      legalName: "Pilot Foods (Pty) Ltd",
      tradingName: "Pilot Foods",
      registrationNumber: "2026/900001/07",
      industry: "Food Processing",
      monthlyElectricitySpendEstimate: 61000,
      contactPersonName: "Pilot Contact",
      contactPersonEmail: "contact@pilotfoods.test",
      contactPersonPhone: "+27110000001",
      physicalAddress: "1 Pilot Street",
      city: "Johannesburg",
      province: "Gauteng",
      sourceSalesRepresentativeId: salesRepresentative.id,
      assignedAdministratorId: administrator.id,
      currentStageId: utilityBillStage.id,
      qualificationStatus: "DOCUMENTS_PENDING",
      disqualificationReason: null,
      status: "ACTIVE",
    },
  });

  const dealPipeline = await prisma.dealPipeline.upsert({
    where: { businessId: business.id },
    update: {
      sourceSalesRepresentativeId: salesRepresentative.id,
      assignedAdministratorId: administrator.id,
      currentStageId: utilityBillStage.id,
      healthStatus: "WAITING_ON_BUSINESS",
      isStalled: true,
      stallReasonCode: "UTILITY_BILL_MISSING",
      priority: "HIGH",
      stageEnteredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      stalledAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
    create: {
      businessId: business.id,
      sourceSalesRepresentativeId: salesRepresentative.id,
      assignedAdministratorId: administrator.id,
      currentStageId: utilityBillStage.id,
      healthStatus: "WAITING_ON_BUSINESS",
      isStalled: true,
      stallReasonCode: "UTILITY_BILL_MISSING",
      priority: "HIGH",
      stageEnteredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      stalledAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    },
  });

  const existingLead = await prisma.lead.findFirst({
    where: {
      salesRepresentativeId: salesRepresentative.id,
      contactEmail: "pilot.lead@foundation1.test",
    },
  });

  const lead = existingLead
    ? await prisma.lead.update({
        where: { id: existingLead.id },
        data: {
          businessName: "Pilot Lead Services (Pty) Ltd",
          contactName: "Lead Contact",
          contactPhone: "+27110000002",
          status: "INVITE_SENT",
          inviteSentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          deadReason: null,
          registeredBusinessId: business.id,
        },
      })
    : await prisma.lead.create({
        data: {
          salesRepresentativeId: salesRepresentative.id,
          businessName: "Pilot Lead Services (Pty) Ltd",
          contactName: "Lead Contact",
          contactEmail: "pilot.lead@foundation1.test",
          contactPhone: "+27110000002",
          status: "INVITE_SENT",
          inviteSentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          deadReason: null,
          registeredBusinessId: business.id,
        },
      });

  await prisma.businessUserProfile.upsert({
    where: { userId: businessUser.id },
    update: {
      businessId: business.id,
      title: "Director",
      canSignDocuments: true,
      isPrimaryContact: true,
    },
    create: {
      userId: businessUser.id,
      businessId: business.id,
      title: "Director",
      canSignDocuments: true,
      isPrimaryContact: true,
    },
  });

  const pilotPayments = [
    {
      referenceCode: "PILOT-PAY-001",
      description: "Registration conversion payout",
      amountCents: 125000,
      currency: "ZAR",
      status: "PAID" as const,
      dueAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
      paidAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
      notes: "Paid after registration completion review.",
    },
    {
      referenceCode: "PILOT-PAY-002",
      description: "Utility bill document completion payout",
      amountCents: 175000,
      currency: "ZAR",
      status: "PENDING" as const,
      dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      paidAt: null,
      notes: "Awaiting finance release after administrator review.",
    },
    {
      referenceCode: "PILOT-PAY-003",
      description: "Proposal handoff payout",
      amountCents: 225000,
      currency: "ZAR",
      status: "PENDING" as const,
      dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      paidAt: null,
      notes: "Scheduled once signed proposal is forwarded to partner.",
    },
  ];

  for (const payment of pilotPayments) {
    await prisma.salesRepPayment.upsert({
      where: { referenceCode: payment.referenceCode },
      update: {
        salesRepresentativeId: salesRepresentative.id,
        businessId: business.id,
        leadId: lead.id,
        dealPipelineId: dealPipeline.id,
        description: payment.description,
        amountCents: payment.amountCents,
        currency: payment.currency,
        status: payment.status,
        dueAt: payment.dueAt,
        paidAt: payment.paidAt,
        notes: payment.notes,
      },
      create: {
        referenceCode: payment.referenceCode,
        salesRepresentativeId: salesRepresentative.id,
        businessId: business.id,
        leadId: lead.id,
        dealPipelineId: dealPipeline.id,
        description: payment.description,
        amountCents: payment.amountCents,
        currency: payment.currency,
        status: payment.status,
        dueAt: payment.dueAt,
        paidAt: payment.paidAt,
        notes: payment.notes,
      },
    });
  }

  await prisma.communicationThread.deleteMany({
    where: {
      subject: {
        in: [
          "[PILOT] Utility bill support question",
          "[PILOT] Lead stuck at qualification",
          "[PILOT] Internal risk note",
        ],
      },
    },
  });

  await prisma.communicationThread.create({
    data: {
      threadType: "BUSINESS_SUPPORT",
      visibilityScope: "BUSINESS_ADMIN",
      businessId: business.id,
      dealPipelineId: dealPipeline.id,
      createdByUserId: businessUser.id,
      recipientRole: "ADMINISTRATOR",
      subject: "[PILOT] Utility bill support question",
      status: "PENDING",
      lastMessageAt: new Date(Date.now() - 30 * 60 * 1000),
      lastRespondedByRole: "ADMINISTRATOR",
      messages: {
        create: [
          {
            authorUserId: businessUser.id,
            body: "We are unsure which six-month utility bill format is accepted.",
          },
          {
            authorUserId: administrator.id,
            body: "Please upload the municipal PDF statements for the last six months.",
          },
        ],
      },
    },
  });

  await prisma.communicationThread.create({
    data: {
      threadType: "SALES_ESCALATION",
      visibilityScope: "SALES_ADMIN",
      businessId: business.id,
      leadId: lead.id,
      dealPipelineId: dealPipeline.id,
      createdByUserId: salesRepresentative.id,
      recipientRole: "ADMINISTRATOR",
      subject: "[PILOT] Lead stuck at qualification",
      status: "PENDING",
      lastMessageAt: new Date(Date.now() - 45 * 60 * 1000),
      lastRespondedByRole: "ADMINISTRATOR",
      messages: {
        create: [
          {
            authorUserId: salesRepresentative.id,
            body: "Lead is stalled because the utility bill is still outstanding.",
          },
          {
            authorUserId: administrator.id,
            body: "Escalation received. I have requested the utility bill and set a follow-up task.",
          },
        ],
      },
    },
  });

  await prisma.communicationThread.create({
    data: {
      threadType: "INTERNAL_ADMIN_NOTE",
      visibilityScope: "ADMIN_ONLY",
      businessId: business.id,
      dealPipelineId: dealPipeline.id,
      createdByUserId: administrator.id,
      recipientRole: "ADMINISTRATOR",
      subject: "[PILOT] Internal risk note",
      status: "OPEN",
      lastMessageAt: new Date(Date.now() - 60 * 60 * 1000),
      lastRespondedByRole: "ADMINISTRATOR",
      messages: {
        create: [
          {
            authorUserId: administrator.id,
            body: "Flagging responsiveness risk. If utility bill is not received in 48 hours, escalate to supervisor.",
          },
        ],
      },
    },
  });

  console.log("  Pilot communication sample data seeded");
  console.log(`  Super Administrator: ${superAdmin.email}`);
  console.log(`  Administrator: ${administrator.email}`);
  console.log(`  Sales Representative: ${salesRepresentative.email}`);
  console.log(`  Business User: ${businessUser.email}`);
  console.log("\nSeed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

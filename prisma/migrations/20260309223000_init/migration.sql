-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMINISTRATOR', 'SALES_REPRESENTATIVE', 'BUSINESS_USER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED', 'PENDING');

-- CreateEnum
CREATE TYPE "QualificationStatus" AS ENUM ('UNASSESSED', 'EARLY_INTEREST', 'REGISTERED', 'DOCUMENTS_PENDING', 'QUALIFIED', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DealHealthStatus" AS ENUM ('HEALTHY', 'AT_RISK', 'STALLED', 'OVERDUE', 'WAITING_ON_BUSINESS', 'WAITING_ON_ADMINISTRATOR', 'WAITING_ON_PARTNER');

-- CreateEnum
CREATE TYPE "DealPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DocumentReviewStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentDirection" AS ENUM ('ADMIN_TO_BUSINESS', 'BUSINESS_TO_ADMIN');

-- CreateEnum
CREATE TYPE "DocumentPurpose" AS ENUM ('REQUESTED_DOCUMENT', 'DELIVERED_DOCUMENT', 'SIGNED_RETURN', 'SUPPORTING_DOCUMENT');

-- CreateEnum
CREATE TYPE "DocumentExchangePhase" AS ENUM ('EXPRESSION_OF_INTEREST', 'UTILITY_BILL', 'PROPOSAL', 'TERM_SHEET', 'KNOW_YOUR_CUSTOMER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('INTERNAL', 'CUSTOMER_VISIBLE');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'URGENT', 'SUCCESS');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'INVITE_SENT', 'REGISTERED', 'CONVERTED', 'DEAD');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "StageCategory" AS ENUM ('EARLY_LEAD', 'REGISTRATION', 'EXPRESSION_OF_INTEREST', 'UTILITY_REVIEW', 'PROPOSAL', 'TERM_SHEET', 'KNOW_YOUR_CUSTOMER', 'APPROVAL', 'DELIVERY', 'LIVE_SUPPORT', 'CLOSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRepresentativeProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "uniqueReferralCode" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'PENDING',
    "pilotCohort" TEXT DEFAULT 'PILOT_1',
    "notes" TEXT,
    "performanceScore" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesRepresentativeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessUserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "title" TEXT,
    "canSignDocuments" BOOLEAN NOT NULL DEFAULT false,
    "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessUserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "salesRepresentativeId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "inviteSentAt" TIMESTAMP(3),
    "registeredBusinessId" TEXT,
    "deadReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradingName" TEXT,
    "registrationNumber" TEXT NOT NULL,
    "industry" TEXT,
    "monthlyElectricitySpendEstimate" DOUBLE PRECISION,
    "contactPersonName" TEXT NOT NULL,
    "contactPersonEmail" TEXT NOT NULL,
    "contactPersonPhone" TEXT,
    "physicalAddress" TEXT,
    "city" TEXT,
    "province" TEXT,
    "status" "BusinessStatus" NOT NULL DEFAULT 'ACTIVE',
    "qualificationStatus" "QualificationStatus" NOT NULL DEFAULT 'UNASSESSED',
    "disqualificationReason" TEXT,
    "sourceSalesRepresentativeId" TEXT NOT NULL,
    "assignedAdministratorId" TEXT,
    "currentStageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStageDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "ownerRole" "UserRole" NOT NULL,
    "category" "StageCategory" NOT NULL,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCustomerVisible" BOOLEAN NOT NULL DEFAULT true,
    "targetDurationHours" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStageDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealPipeline" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sourceSalesRepresentativeId" TEXT NOT NULL,
    "assignedAdministratorId" TEXT,
    "currentStageId" TEXT NOT NULL,
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isStalled" BOOLEAN NOT NULL DEFAULT false,
    "stalledAt" TIMESTAMP(3),
    "stallReasonCode" TEXT,
    "nextRequiredAction" TEXT,
    "nextRequiredActionOwner" "UserRole",
    "priority" "DealPriority" NOT NULL DEFAULT 'MEDIUM',
    "healthStatus" "DealHealthStatus" NOT NULL DEFAULT 'HEALTHY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealPipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStageHistory" (
    "id" TEXT NOT NULL,
    "dealPipelineId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousStageDurationHours" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "PipelineStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTypeDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requiredForStageId" TEXT,
    "visibleToBusiness" BOOLEAN NOT NULL DEFAULT true,
    "visibleToSalesRepresentative" BOOLEAN NOT NULL DEFAULT false,
    "visibleToAdministrator" BOOLEAN NOT NULL DEFAULT true,
    "canBusinessUpload" BOOLEAN NOT NULL DEFAULT false,
    "canAdministratorUpload" BOOLEAN NOT NULL DEFAULT true,
    "requiresReview" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTypeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSubmission" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "dealPipelineId" TEXT,
    "parentSubmissionId" TEXT,
    "documentTypeId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "direction" "DocumentDirection" NOT NULL DEFAULT 'BUSINESS_TO_ADMIN',
    "purpose" "DocumentPurpose" NOT NULL DEFAULT 'SUPPORTING_DOCUMENT',
    "exchangePhase" "DocumentExchangePhase" NOT NULL DEFAULT 'EXPRESSION_OF_INTEREST',
    "visibleToBusiness" BOOLEAN NOT NULL DEFAULT true,
    "visibleToAdministrator" BOOLEAN NOT NULL DEFAULT true,
    "visibleToSalesRepresentative" BOOLEAN NOT NULL DEFAULT false,
    "businessActionRequired" BOOLEAN NOT NULL DEFAULT false,
    "adminReviewRequired" BOOLEAN NOT NULL DEFAULT true,
    "partnerHandoffRequired" BOOLEAN NOT NULL DEFAULT false,
    "fileUrl" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "reviewStatus" "DocumentReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "businessDownloadedAt" TIMESTAMP(3),
    "returnedSignedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "forwardedToPartnerAt" TIMESTAMP(3),
    "returnedFromPartnerAt" TIMESTAMP(3),
    "partnerStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StallReasonDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StallReasonDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "dealPipelineId" TEXT,
    "businessId" TEXT,
    "assignedToUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "taskType" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "ownerRole" "UserRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "dealPipelineId" TEXT,
    "businessId" TEXT,
    "authorUserId" TEXT NOT NULL,
    "noteType" "NoteType" NOT NULL DEFAULT 'INTERNAL',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SalesRepresentativeProfile_userId_key" ON "SalesRepresentativeProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesRepresentativeProfile_uniqueReferralCode_key" ON "SalesRepresentativeProfile"("uniqueReferralCode");

-- CreateIndex
CREATE INDEX "SalesRepresentativeProfile_uniqueReferralCode_idx" ON "SalesRepresentativeProfile"("uniqueReferralCode");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUserProfile_userId_key" ON "BusinessUserProfile"("userId");

-- CreateIndex
CREATE INDEX "BusinessUserProfile_businessId_idx" ON "BusinessUserProfile"("businessId");

-- CreateIndex
CREATE INDEX "Lead_salesRepresentativeId_idx" ON "Lead"("salesRepresentativeId");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_contactEmail_idx" ON "Lead"("contactEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Business_registrationNumber_key" ON "Business"("registrationNumber");

-- CreateIndex
CREATE INDEX "Business_sourceSalesRepresentativeId_idx" ON "Business"("sourceSalesRepresentativeId");

-- CreateIndex
CREATE INDEX "Business_assignedAdministratorId_idx" ON "Business"("assignedAdministratorId");

-- CreateIndex
CREATE INDEX "Business_qualificationStatus_idx" ON "Business"("qualificationStatus");

-- CreateIndex
CREATE INDEX "Business_registrationNumber_idx" ON "Business"("registrationNumber");

-- CreateIndex
CREATE INDEX "Business_currentStageId_idx" ON "Business"("currentStageId");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStageDefinition_code_key" ON "PipelineStageDefinition"("code");

-- CreateIndex
CREATE INDEX "PipelineStageDefinition_code_idx" ON "PipelineStageDefinition"("code");

-- CreateIndex
CREATE INDEX "PipelineStageDefinition_orderIndex_idx" ON "PipelineStageDefinition"("orderIndex");

-- CreateIndex
CREATE INDEX "PipelineStageDefinition_category_idx" ON "PipelineStageDefinition"("category");

-- CreateIndex
CREATE UNIQUE INDEX "DealPipeline_businessId_key" ON "DealPipeline"("businessId");

-- CreateIndex
CREATE INDEX "DealPipeline_currentStageId_idx" ON "DealPipeline"("currentStageId");

-- CreateIndex
CREATE INDEX "DealPipeline_sourceSalesRepresentativeId_idx" ON "DealPipeline"("sourceSalesRepresentativeId");

-- CreateIndex
CREATE INDEX "DealPipeline_assignedAdministratorId_idx" ON "DealPipeline"("assignedAdministratorId");

-- CreateIndex
CREATE INDEX "DealPipeline_isStalled_idx" ON "DealPipeline"("isStalled");

-- CreateIndex
CREATE INDEX "DealPipeline_healthStatus_idx" ON "DealPipeline"("healthStatus");

-- CreateIndex
CREATE INDEX "DealPipeline_priority_idx" ON "DealPipeline"("priority");

-- CreateIndex
CREATE INDEX "PipelineStageHistory_dealPipelineId_idx" ON "PipelineStageHistory"("dealPipelineId");

-- CreateIndex
CREATE INDEX "PipelineStageHistory_changedAt_idx" ON "PipelineStageHistory"("changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTypeDefinition_code_key" ON "DocumentTypeDefinition"("code");

-- CreateIndex
CREATE INDEX "DocumentTypeDefinition_code_idx" ON "DocumentTypeDefinition"("code");

-- CreateIndex
CREATE INDEX "DocumentSubmission_businessId_idx" ON "DocumentSubmission"("businessId");

-- CreateIndex
CREATE INDEX "DocumentSubmission_dealPipelineId_idx" ON "DocumentSubmission"("dealPipelineId");

-- CreateIndex
CREATE INDEX "DocumentSubmission_parentSubmissionId_idx" ON "DocumentSubmission"("parentSubmissionId");

-- CreateIndex
CREATE INDEX "DocumentSubmission_documentTypeId_idx" ON "DocumentSubmission"("documentTypeId");

-- CreateIndex
CREATE INDEX "DocumentSubmission_direction_purpose_exchangePhase_idx" ON "DocumentSubmission"("direction", "purpose", "exchangePhase");

-- CreateIndex
CREATE INDEX "DocumentSubmission_businessActionRequired_exchangePhase_idx" ON "DocumentSubmission"("businessActionRequired", "exchangePhase");

-- CreateIndex
CREATE INDEX "DocumentSubmission_reviewStatus_idx" ON "DocumentSubmission"("reviewStatus");

-- CreateIndex
CREATE INDEX "DocumentSubmission_versionNumber_idx" ON "DocumentSubmission"("versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "StallReasonDefinition_code_key" ON "StallReasonDefinition"("code");

-- CreateIndex
CREATE INDEX "StallReasonDefinition_code_idx" ON "StallReasonDefinition"("code");

-- CreateIndex
CREATE INDEX "Task_dealPipelineId_idx" ON "Task"("dealPipelineId");

-- CreateIndex
CREATE INDEX "Task_businessId_idx" ON "Task"("businessId");

-- CreateIndex
CREATE INDEX "Task_assignedToUserId_idx" ON "Task"("assignedToUserId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_dueAt_idx" ON "Task"("dueAt");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_idx" ON "ActivityLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ActivityLog_actorUserId_idx" ON "ActivityLog"("actorUserId");

-- CreateIndex
CREATE INDEX "ActivityLog_actionType_idx" ON "ActivityLog"("actionType");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Note_dealPipelineId_idx" ON "Note"("dealPipelineId");

-- CreateIndex
CREATE INDEX "Note_businessId_idx" ON "Note"("businessId");

-- CreateIndex
CREATE INDEX "Note_authorUserId_idx" ON "Note"("authorUserId");

-- CreateIndex
CREATE INDEX "Note_noteType_idx" ON "Note"("noteType");

-- AddForeignKey
ALTER TABLE "SalesRepresentativeProfile" ADD CONSTRAINT "SalesRepresentativeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessUserProfile" ADD CONSTRAINT "BusinessUserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessUserProfile" ADD CONSTRAINT "BusinessUserProfile_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_salesRepresentativeId_fkey" FOREIGN KEY ("salesRepresentativeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_registeredBusinessId_fkey" FOREIGN KEY ("registeredBusinessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_sourceSalesRepresentativeId_fkey" FOREIGN KEY ("sourceSalesRepresentativeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_assignedAdministratorId_fkey" FOREIGN KEY ("assignedAdministratorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "PipelineStageDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealPipeline" ADD CONSTRAINT "DealPipeline_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealPipeline" ADD CONSTRAINT "DealPipeline_sourceSalesRepresentativeId_fkey" FOREIGN KEY ("sourceSalesRepresentativeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealPipeline" ADD CONSTRAINT "DealPipeline_assignedAdministratorId_fkey" FOREIGN KEY ("assignedAdministratorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealPipeline" ADD CONSTRAINT "DealPipeline_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "PipelineStageDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealPipeline" ADD CONSTRAINT "DealPipeline_stallReasonCode_fkey" FOREIGN KEY ("stallReasonCode") REFERENCES "StallReasonDefinition"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStageHistory" ADD CONSTRAINT "PipelineStageHistory_dealPipelineId_fkey" FOREIGN KEY ("dealPipelineId") REFERENCES "DealPipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStageHistory" ADD CONSTRAINT "PipelineStageHistory_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "PipelineStageDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStageHistory" ADD CONSTRAINT "PipelineStageHistory_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "PipelineStageDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStageHistory" ADD CONSTRAINT "PipelineStageHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTypeDefinition" ADD CONSTRAINT "DocumentTypeDefinition_requiredForStageId_fkey" FOREIGN KEY ("requiredForStageId") REFERENCES "PipelineStageDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSubmission" ADD CONSTRAINT "DocumentSubmission_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSubmission" ADD CONSTRAINT "DocumentSubmission_dealPipelineId_fkey" FOREIGN KEY ("dealPipelineId") REFERENCES "DealPipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSubmission" ADD CONSTRAINT "DocumentSubmission_parentSubmissionId_fkey" FOREIGN KEY ("parentSubmissionId") REFERENCES "DocumentSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSubmission" ADD CONSTRAINT "DocumentSubmission_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentTypeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSubmission" ADD CONSTRAINT "DocumentSubmission_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSubmission" ADD CONSTRAINT "DocumentSubmission_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_dealPipelineId_fkey" FOREIGN KEY ("dealPipelineId") REFERENCES "DealPipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_dealPipelineId_fkey" FOREIGN KEY ("dealPipelineId") REFERENCES "DealPipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "CommunicationThreadType" AS ENUM ('BUSINESS_SUPPORT', 'SALES_ESCALATION', 'INTERNAL_ADMIN_NOTE');

-- CreateEnum
CREATE TYPE "CommunicationVisibilityScope" AS ENUM ('BUSINESS_ADMIN', 'SALES_ADMIN', 'ADMIN_ONLY');

-- CreateEnum
CREATE TYPE "CommunicationStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "CommunicationThread" (
    "id" TEXT NOT NULL,
    "threadType" "CommunicationThreadType" NOT NULL,
    "visibilityScope" "CommunicationVisibilityScope" NOT NULL,
    "businessId" TEXT,
    "leadId" TEXT,
    "dealPipelineId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "recipientRole" "UserRole",
    "subject" TEXT,
    "status" "CommunicationStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRespondedByRole" "UserRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isSystemMessage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunicationThread_threadType_status_idx" ON "CommunicationThread"("threadType", "status");

-- CreateIndex
CREATE INDEX "CommunicationThread_visibilityScope_status_idx" ON "CommunicationThread"("visibilityScope", "status");

-- CreateIndex
CREATE INDEX "CommunicationThread_businessId_status_idx" ON "CommunicationThread"("businessId", "status");

-- CreateIndex
CREATE INDEX "CommunicationThread_leadId_status_idx" ON "CommunicationThread"("leadId", "status");

-- CreateIndex
CREATE INDEX "CommunicationThread_dealPipelineId_status_idx" ON "CommunicationThread"("dealPipelineId", "status");

-- CreateIndex
CREATE INDEX "CommunicationThread_createdByUserId_idx" ON "CommunicationThread"("createdByUserId");

-- CreateIndex
CREATE INDEX "CommunicationThread_lastMessageAt_idx" ON "CommunicationThread"("lastMessageAt");

-- CreateIndex
CREATE INDEX "CommunicationMessage_threadId_createdAt_idx" ON "CommunicationMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationMessage_authorUserId_idx" ON "CommunicationMessage"("authorUserId");

-- AddCheckConstraint
ALTER TABLE "CommunicationThread"
ADD CONSTRAINT "CommunicationThread_context_required"
CHECK ("businessId" IS NOT NULL OR "leadId" IS NOT NULL OR "dealPipelineId" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "CommunicationThread" ADD CONSTRAINT "CommunicationThread_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationThread" ADD CONSTRAINT "CommunicationThread_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationThread" ADD CONSTRAINT "CommunicationThread_dealPipelineId_fkey" FOREIGN KEY ("dealPipelineId") REFERENCES "DealPipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationThread" ADD CONSTRAINT "CommunicationThread_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CommunicationThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationMessage" ADD CONSTRAINT "CommunicationMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

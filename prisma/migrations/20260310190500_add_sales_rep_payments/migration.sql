CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

CREATE TABLE "SalesRepPayment" (
    "id" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "salesRepresentativeId" TEXT NOT NULL,
    "businessId" TEXT,
    "leadId" TEXT,
    "dealPipelineId" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesRepPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesRepPayment_referenceCode_key" ON "SalesRepPayment"("referenceCode");
CREATE INDEX "SalesRepPayment_salesRepresentativeId_status_idx" ON "SalesRepPayment"("salesRepresentativeId", "status");
CREATE INDEX "SalesRepPayment_status_dueAt_idx" ON "SalesRepPayment"("status", "dueAt");
CREATE INDEX "SalesRepPayment_businessId_idx" ON "SalesRepPayment"("businessId");
CREATE INDEX "SalesRepPayment_leadId_idx" ON "SalesRepPayment"("leadId");
CREATE INDEX "SalesRepPayment_dealPipelineId_idx" ON "SalesRepPayment"("dealPipelineId");

ALTER TABLE "SalesRepPayment"
ADD CONSTRAINT "SalesRepPayment_salesRepresentativeId_fkey"
FOREIGN KEY ("salesRepresentativeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesRepPayment"
ADD CONSTRAINT "SalesRepPayment_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesRepPayment"
ADD CONSTRAINT "SalesRepPayment_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesRepPayment"
ADD CONSTRAINT "SalesRepPayment_dealPipelineId_fkey"
FOREIGN KEY ("dealPipelineId") REFERENCES "DealPipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { calculateMigrationAssessment } from "@/lib/calculateMigrationAssessment";
import { currentiseEskomBill } from "@/lib/eskom-tariff-currentisation";
import { buildF1Proposal } from "@/lib/f1-proposal";
import {
  aggregateUtilityBills,
  analyseUtilityBillText,
  canonicaliseUtilityBillAnalyses,
} from "@/lib/utility-bill-analysis";

export const DEV_MIGRATION_PREVIEW_PROFILE_ID = "F1-P28SLRVY";
export const DEV_MIGRATION_PREVIEW_ACCESS_CODE = "7575";
export const DEV_EOI_PREVIEW_TOKEN = "eoi-preview-ratang";

const PREVIEW_GENERATED_AT = "2026-07-09T00:00:00.000Z";
const RATANG_MONTHS = ["October", "November", "December", "January", "February", "March"];

export function isDevEoiPreviewToken(token: unknown) {
  return process.env.NODE_ENV !== "production" && token === DEV_EOI_PREVIEW_TOKEN;
}

export function buildDevEoiPreviewLead(options: {
  signedBy?: string | null;
  signedAt?: string | null;
} = {}) {
  const signedBy = options.signedBy?.trim() || null;
  const signedAt = options.signedAt ?? null;
  return {
    clientProfileId: "F1-RATANG",
    company: "Ratang Liquor",
    businessRegistrationNumber: "2020/000000/07",
    contactName: "Authorised Director",
    physicalAddress: "Masemola, Limpopo",
    userProfile: { phone: "+27 69 036 8243", role: "Director" },
    stage: signedAt ? "EOI Signed" : "EOI Generated",
    eoiSignatureId: signedAt ? "preview-signature-ratang" : null,
    eoiSignedBy: signedBy,
    eoiSignedAt: signedAt,
    eoiAcceptedTermsAt: signedAt,
    isSigned: Boolean(signedAt),
  };
}

export function isDevMigrationPreviewCredentials(profileId: unknown, accessCode: unknown) {
  return process.env.NODE_ENV !== "production"
    && String(profileId ?? "").trim().toUpperCase() === DEV_MIGRATION_PREVIEW_PROFILE_ID
    && String(accessCode ?? "").replace(/\D/g, "") === DEV_MIGRATION_PREVIEW_ACCESS_CODE;
}

export function buildDevMigrationPreviewAssessment() {
  const monthlyElectricitySpend = 19_711.56;
  return {
    input: { monthlyElectricitySpend, monthlySpend: monthlyElectricitySpend },
    result: calculateMigrationAssessment({ monthlyElectricitySpend }),
    documents: [],
    profileId: DEV_MIGRATION_PREVIEW_PROFILE_ID,
    accessCode: DEV_MIGRATION_PREVIEW_ACCESS_CODE,
    status: "proposal_ready" as const,
    registration: {
      assessmentId: "00000000-0000-4000-8000-000000000001",
      backend: "local" as const,
      leadId: "ratang-local-preview",
      clientProfileId: "F1-RATANG",
      businessName: "Ratang Liquor",
      contactName: "Ratang Liquor",
      email: "preview@foundation-1.local",
      phone: "+27 69 036 8243",
      companyRegistrationNumber: "",
      monthlyElectricitySpendEstimateZar: monthlyElectricitySpend,
      hasSixMonthUtilityBill: true,
      city: "Masemola",
      province: "Limpopo",
      registeredAt: PREVIEW_GENERATED_AT,
    },
    updatedAt: PREVIEW_GENERATED_AT,
  };
}

export function buildDevMigrationPreviewStatus() {
  const documents = [
    {
      id: "ratang-eoi",
      title: "Signed Expression of Interest - Ratang Liquor",
      status: "signed",
      uploadedByType: "Client",
      fileName: "ratang-signed-eoi.pdf",
      createdAt: PREVIEW_GENERATED_AT,
    },
    ...RATANG_MONTHS.map((month, index) => ({
      id: `ratang-bill-${index + 1}`,
      title: `Utility Bill - ${month} 2025/26`,
      status: "validated",
      uploadedByType: "Client",
      fileName: `ratang-${month.toLowerCase()}-invoice.pdf`,
      createdAt: PREVIEW_GENERATED_AT,
    })),
  ];

  return {
    leadId: "ratang-local-preview",
    clientProfileId: "F1-RATANG",
    adminStage: "Proposal Ready",
    migrationStatus: "proposal_ready",
    readinessScore: 92,
    nextAction: "Review your bill-audited Migration Proposal.",
    documents,
    uploadToken: null,
    eoiToken: null,
    proposalAcceptedAt: null,
    mandateToken: null,
    mandateSignedAt: null,
    directKycSubmittedAt: null,
    directKycSubmittedBy: null,
    directKycRecipient: null,
    formalProposalIssued: false,
    assessmentCompleted: true,
  };
}

function buildRatangPortfolio() {
  const analyses = RATANG_MONTHS.map((month) => {
    const fileName = `1._Onboarding_6._Ratang_Liquor_Null_Retang_Liquor_Folder_Documents_Eskom_${month}_Invoice.pdf.txt`;
    const text = readFileSync(join(process.cwd(), "..", "_extract", "text", fileName), "utf8");
    return analyseUtilityBillText(text, { fileName, analysedAt: PREVIEW_GENERATED_AT });
  });
  const canonical = canonicaliseUtilityBillAnalyses(analyses);
  const currentisedBills = canonical.map((analysis) => ({
    sourceHash: analysis.sourceHash,
    ...currentiseEskomBill(analysis),
  }));
  return aggregateUtilityBills(analyses, PREVIEW_GENERATED_AT, { currentisedBills });
}

export function buildDevMigrationPreviewProposal() {
  const billPortfolio = buildRatangPortfolio();
  if (!billPortfolio.averageMonthlySpendExVat || !billPortfolio.averageMonthlyKwh) {
    throw new Error("The local Ratang preview bill portfolio is incomplete.");
  }
  return buildF1Proposal({
    businessName: "Ratang Liquor",
    contactName: "Ratang Liquor",
    clientProfileId: "F1-RATANG",
    siteCity: "Masemola",
    province: "Limpopo",
    utilityProvider: "Eskom",
    monthlySpend: billPortfolio.averageMonthlySpendExVat,
    monthlyKwh: billPortfolio.averageMonthlyKwh,
    billPortfolio,
    generatedAt: PREVIEW_GENERATED_AT,
  });
}

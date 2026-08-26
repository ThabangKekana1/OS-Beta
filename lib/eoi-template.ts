import { sanitizeFileSegment } from "@/lib/download-utils";

export type EoiTemplateLead = {
  clientProfileId: string;
  company: string;
  businessRegistrationNumber: string;
  contactName: string;
  physicalAddress: string;
  monthlyElectricitySpendEstimateZar?: number;
  userProfile: {
    phone: string;
    role: string;
  };
};

type BuildEoiTemplateOptions = {
  signedBy?: string | null;
};

export const EOI_TEMPLATE_TITLE = "Expression of Interest";

export function buildEoiTemplateText(
  lead: EoiTemplateLead,
  options: BuildEoiTemplateOptions = {},
) {
  const signedBy = options.signedBy?.trim() ?? "";
  const clientName = signedBy || lead.contactName;

  return [
    "EXPRESSION OF INTEREST: RENEWABLE ENERGY SUPPLY",
    "",
    "To Whom It May Concern: Foundation-1",
    "",
    `${lead.company} has reviewed the completed Foundation-1 energy migration assessment prepared from its submitted operating evidence.`,
    "",
    "Subject to the receipt of the relevant approvals, we confirm our interest in continuing from that assessment through Foundation-1 and its approved supply partners. We authorise a terms-formulation period and request engagement with the relevant stakeholders to prepare formal commercial, financial and technical options.",
    "",
    `Should we reach commercial and technical alignment, ${lead.company} would want to explore entering into a comprehensive Zero-Capex energy migration agreement.`,
    "",
    `This letter is a non-binding expression of interest, and remains subject to a contract between the parties. There is no intention that the content of this letter shall create legal relations between ${lead.company} and Foundation-1.`,
    "",
    "Kind Regards,",
    "",
    clientName,
    lead.userProfile.role,
    lead.company,
    lead.businessRegistrationNumber,
    `1-MI Profile Number: ${lead.clientProfileId}`,
  ].join("\n");
}

export function buildEoiTemplateFilename(company: string) {
  const companySlug = sanitizeFileSegment(company) || "client";
  return `${companySlug}-expression-of-interest.txt`;
}

/**
 * Legacy offline fallback retained for exceptional manual onboarding only.
 * The standard client journey uses the secure digital EOI signing route.
 */
export function buildBlankEoiTemplateText(): string {
  const today = new Date().toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return [
    "════════════════════════════════════════════════════════════════",
    "  OFFLINE FALLBACK ONLY: Use the secure digital EOI signing",
    "  link whenever available. Replace all [BRACKETED] fields.",
    "════════════════════════════════════════════════════════════════",
    "",
    `Date: ${today}`,
    "",
    "EXPRESSION OF INTEREST: RENEWABLE ENERGY SUPPLY",
    "",
    "To Whom It May Concern,",
    "Foundation-1",
    "",
    "[COMPANY NAME] has reviewed the completed Foundation-1 energy migration",
    "assessment prepared from its submitted operating evidence.",
    "",
    "Subject to the receipt of the relevant approvals, we confirm our interest",
    "in continuing from that assessment through Foundation-1 and its approved",
    "supply partners. We authorise a terms-formulation period and request",
    "engagement with the relevant stakeholders to prepare formal options.",
    "",
    "Should we reach commercial and technical alignment, [COMPANY NAME] would",
    "want to explore entering into a comprehensive Zero-Capex energy migration",
    "agreement.",
    "",
    "This letter is a non-binding expression of interest, and remains subject",
    "to a contract between the parties. There is no intention that the content",
    "of this letter shall create legal relations between [COMPANY NAME] and",
    "Foundation-1.",
    "",
    "Kind Regards,",
    "",
    "",
    "________________________________",
    "[AUTHORISED SIGNATORY FULL NAME]",
    "[POSITION / TITLE]",
    "[COMPANY NAME]",
    "[CIPC REGISTRATION NUMBER]",
    "",
    "",
    "────────────────────────────────────────────────────────────────",
    "SUBMISSION INSTRUCTIONS",
    "────────────────────────────────────────────────────────────────",
    "1. Complete all [BRACKETED] fields.",
    "2. Sign the document as the authorised representative.",
    "3. Scan or export it to PDF.",
    "4. Return only the signed EOI through the secure link supplied by",
    "   Foundation-1. Utility evidence must already have been assessed.",
    "",
    "Questions? Contact Foundation-1:",
    "  Email:  support@1os.foundation-1.co.za",
    "  Web:    https://www.foundation-1.co.za",
    "────────────────────────────────────────────────────────────────",
  ].join("\n");
}

export function buildBlankEoiTemplateFilename(): string {
  return "foundation-1-expression-of-interest-template.txt";
}

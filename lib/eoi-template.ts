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
    "To Whom It May Concern: Green Share VPP",
    "",
    `${lead.company} has been approached by Green Share VPP, to supply Renewable Energy to ${lead.company} sites for operation of its facilities.`,
    "",
    "Subject to the receipt of the relevant approvals, we hereby confirm our interest to procure renewable energy from Green Share VPP and would like to enter into an information sharing and terms formulation period with the intent of reaching commercial and technical alignment. We hereby request you to commence your engagement with the relevant stakeholder in order to procure the approvals required to make the said terms available.",
    "",
    `Should we reach commercial and technical alignment, ${lead.company} would want to explore entering into a comprehensive Zero-Capex Solar agreement.`,
    "",
    `This letter is a non-binding expression of interest, and remains subject to a contract between the parties. There is no intention that the content of this letter shall create legal relations between ${lead.company} and Green Share VPP.`,
    "",
    "Kind Regards,",
    "",
    clientName,
    lead.userProfile.role,
    lead.company,
    lead.businessRegistrationNumber,
    `1OS Profile Number: ${lead.clientProfileId}`,
  ].join("\n");
}

export function buildEoiTemplateFilename(company: string) {
  const companySlug = sanitizeFileSegment(company) || "client";
  return `${companySlug}-expression-of-interest.txt`;
}

/**
 * Builds a blank, printable Expression of Interest template for new prospects.
 * The client fills in the bracketed fields, prints on company letterhead, signs,
 * scans, and uploads it alongside their 6-month utility bills.
 */
export function buildBlankEoiTemplateText(): string {
  const today = new Date().toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return [
    "════════════════════════════════════════════════════════════════",
    "  IMPORTANT: Print this document on your official company",
    "  letterhead before signing. Replace all [BRACKETED] fields.",
    "════════════════════════════════════════════════════════════════",
    "",
    `Date: ${today}`,
    "",
    "EXPRESSION OF INTEREST: RENEWABLE ENERGY SUPPLY",
    "",
    "To Whom It May Concern,",
    "Green Share VPP",
    "",
    "[COMPANY NAME] has been approached by Green Share VPP, to supply",
    "Renewable Energy to [COMPANY NAME] sites for operation of its facilities.",
    "",
    "Subject to the receipt of the relevant approvals, we hereby confirm our",
    "interest to procure renewable energy from Green Share VPP and would like",
    "to enter into an information sharing and terms formulation period with the",
    "intent of reaching commercial and technical alignment. We hereby request",
    "you to commence your engagement with the relevant stakeholder in order to",
    "procure the approvals required to make the said terms available.",
    "",
    "Should we reach commercial and technical alignment, [COMPANY NAME] would",
    "want to explore entering into a comprehensive Zero-Capex Solar agreement.",
    "",
    "This letter is a non-binding expression of interest, and remains subject",
    "to a contract between the parties. There is no intention that the content",
    "of this letter shall create legal relations between [COMPANY NAME] and",
    "Green Share VPP.",
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
    "1. Print on your official company letterhead.",
    "2. Complete all [BRACKETED] fields in ink.",
    "3. Sign the letter and add the company stamp if applicable.",
    "4. Scan to PDF.",
    "5. Upload the signed EOI together with your 6 months of utility",
    "   bills at the secure link provided by your Foundation-1",
    "   consultant, or email to support@foundation-1.co.za.",
    "",
    "Questions? Contact Foundation-1:",
    "  Email:  support@foundation-1.co.za",
    "  Web:    https://www.foundation-1.co.za",
    "────────────────────────────────────────────────────────────────",
  ].join("\n");
}

export function buildBlankEoiTemplateFilename(): string {
  return "foundation-1-expression-of-interest-template.txt";
}

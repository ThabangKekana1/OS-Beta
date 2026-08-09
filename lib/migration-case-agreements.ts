/**
 * Pure agreement copy shared by the PDF generators, the case-state API and the
 * on-screen previews. No PDF dependencies: the client must be able to read
 * exactly what they sign before and after signing.
 */

export const MIGRATION_CASE_EOI_LETTER_TITLE = "EXPRESSION OF INTEREST: RENEWABLE ENERGY SUPPLY";
export const MIGRATION_CASE_EOI_LETTER_RECIPIENT = "Foundation-1 (Pty) Ltd";

export type MigrationCaseEoiLetterInput = {
  companyName: string;
  economicallyPositive: boolean;
};

/** The client-facing EOI letter body, based on the approved letter template. */
export function buildMigrationCaseEoiLetterParagraphs(input: MigrationCaseEoiLetterInput): string[] {
  const company = input.companyName;
  const shared = [
    `${company} has been approached by Foundation-1 (Pty) Ltd, to supply Renewable Energy to the ${company} site for operation of its facilities.`,
    `Subject to the receipt of the relevant approvals, we hereby confirm our interest to procure renewable energy through Foundation-1 (Pty) Ltd and would like to enter into an information sharing and terms formulation period with the intent of reaching commercial and technical alignment.`,
    "We hereby request you to commence your engagement with the relevant stakeholders in order to procure the approvals required to make the said terms available.",
  ];
  const intent = input.economicallyPositive
    ? `Should we reach commercial and technical alignment, ${company} would want to explore entering into a comprehensive Zero-Capex Solar agreement.`
    : `The completed bill-audited proposal identifies a current commercial gap. ${company} nevertheless authorises Foundation-1 (Pty) Ltd to retain and reassess this opportunity should system sizing, commercial pricing, consumption or utility tariffs change. This letter does not accept the current package or its modelled costs.`;
  const nonBinding = `This letter is a non-binding expression of interest, and remains subject to a contract between the parties. There is no intention that the content of this letter shall create legal relations between ${company} and Foundation-1 (Pty) Ltd.`;
  return [...shared, intent, nonBinding];
}

export const MIGRATION_CASE_NDA_VERSION = "2026-08-09.1";

export const FOUNDATION_NDA_SIGNATORY = {
  name: "Karman Kekana",
  position: "Director, Foundation-1 (Pty) Ltd",
};

export const FOUNDATION_NDA_PARTY = {
  name: "Foundation-1 (Pty) Ltd",
  registrationNumber: "2026/138664/07",
  contactName: "Karman Kekana",
  email: "karman@foundation-1.co.za",
  phone: "+27 69 811 7112", // business support line — never a personal number
};

/**
 * The clause summary shown on screen and printed in the NDA PDF. Kept short
 * and plain: the NDA exists to earn trust, honour POPIA and record the
 * client's consent to the ONLY sharing the pipeline performs.
 */
export function buildMigrationCaseNdaClauses(companyName: string): { title: string; body: string }[] {
  return [
    {
      title: "1. Mutual confidentiality",
      body: `Foundation-1 (Pty) Ltd and ${companyName} will keep each other's business, financial and technical information confidential, use it only for assessing and arranging the proposed energy migration, and not disclose it to any other party except as consented to below or as required by law.`,
    },
    {
      title: "2. POPIA compliance",
      body: `Foundation-1 processes personal information under the Protection of Personal Information Act, 4 of 2013. Information is collected directly from ${companyName}, used only for this migration case, stored securely, and never sold or used for unrelated marketing. ${companyName} may request access, correction or deletion at any time.`,
    },
    {
      title: "3. Limited, purpose-bound sharing consent",
      body: `${companyName} consents to Foundation-1 sharing ONLY its utility bills and its signed Expression of Interest with (a) the bank and (b) the wheeling provider, strictly for their own engineers and credit teams to assess this project. No other documents are shared without separate written consent, and no recipient may use the information for any other purpose.`,
    },
    {
      title: "4. Non-circumvention",
      body: `For 24 months from signature, ${companyName} will not conclude an energy-related transaction directly or indirectly with Foundation-1's banking partner in respect of the zero-capex energy product, or with Foundation-1's wheeling provider in respect of wheeled energy, bypassing Foundation-1, without Foundation-1's prior written consent. These introductions and commercial routes are Foundation-1's confidential business assets. This clause does not restrict any relationship that demonstrably pre-dates this agreement, and does not oblige ${companyName} to transact.`,
    },
    {
      title: "5. No obligation to transact",
      body: `This agreement creates no obligation on either party to conclude any transaction. It protects information while the parties assess whether commercial and technical alignment can be reached.`,
    },
    {
      title: "6. Duration and return",
      body: `Confidentiality obligations apply while the migration case is open and for 24 months after it closes. On written request, each party will delete or return the other's confidential information, save for records required by law.`,
    },
  ];
}

export const UFMS_KYC_RECIPIENT = "info@ufms.net";
export const UFMS_KYC_RECIPIENT_DISPLAY = "info@UFMS.net";
export const UFMS_KYC_ATTESTATION_VERSION = "2026-07-12.1";

export const UFMS_DIRECT_KYC_ITEMS = [
  {
    id: "company-registration",
    label: "Company registration documents",
    detail: "The complete registration documents for the entity that will contract for the UFMS solution.",
  },
  {
    id: "director-fica",
    label: "Director FICA documents",
    detail: "A copy of each director's identity document and proof of residence.",
  },
  {
    id: "audited-financials",
    label: "Latest audited financial statements",
    detail: "The latest audited financial statements for the contracting entity.",
  },
  {
    id: "management-accounts",
    label: "Latest management accounts",
    detail: "The latest available management accounts for the contracting entity.",
  },
  {
    id: "bank-statements",
    label: "Last six months of bank statements",
    detail: "Six consecutive months for the contracting entity's business bank account.",
  },
  {
    id: "tax-clearance",
    label: "Valid tax clearance",
    detail: "A valid SARS tax-clearance certificate or tax-compliance status PIN letter.",
  },
] as const;

export function ufmsDirectKycMailto(input: {
  companyName: string;
  caseReference: string;
}) {
  const subject = `UFMS compliance documents - ${input.companyName} - ${input.caseReference}`;
  const body = [
    "Good day UFMS team,",
    "",
    `Please find attached the compliance documents for ${input.companyName}.`,
    `Foundation-1 case reference: ${input.caseReference}.`,
    "",
    "The attachments include:",
    "1. Company registration documents",
    "2. Director FICA documents (ID and proof of residence)",
    "3. Latest audited financial statements",
    "4. Latest management accounts",
    "5. Last six months of bank statements",
    "6. Valid tax clearance",
    "",
    "Please confirm receipt directly with the sender.",
  ].join("\n");

  return `mailto:${UFMS_KYC_RECIPIENT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

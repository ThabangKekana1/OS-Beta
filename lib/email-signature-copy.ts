export type SystemSignatureRole = "admin" | "sales" | "partner";

export const FOUNDATION_CONFIDENTIALITY_NOTICE =
  "CONFIDENTIAL: This email and any files transmitted with it are confidential and intended solely for the use of the individual or entity to whom they are addressed. If you have received this email in error please notify the system manager. This message contains confidential information and is intended only for the individual named. If you are not the named addressee you should not disseminate, distribute or copy this email. Please notify the sender immediately by email if you have received this email by mistake and delete this email from your system. If you are not the intended recipient you are notified that disclosing, copying, distributing or taking any action in reliance on the contents of this information is strictly prohibited.";

export const FOUNDATION_BUSINESS_ADDRESS_TEXT = [
  "No 17 Muswell Road, Wedgefield Office Park",
  "Regus Building Bryanston, Sandton",
  "Gauteng. 2191",
].join("\n");

export const KARMAN_LINKEDIN_URL = "https://www.linkedin.com/in/karman-kekana-26011674/";
export const KARMAN_LINKEDIN_LABEL = "LinkedIn";

export const KARMAN_EMAIL_SIGNATURE_TEXT = [
  "Regards,",
  "Karman Kekana",
  "Founder & Platform Engineer",
  "Foundation-1",
  "karman@foundation-1.co.za",
  "www.foundation-1.co.za",
  KARMAN_LINKEDIN_LABEL,
  "",
  FOUNDATION_BUSINESS_ADDRESS_TEXT,
  "",
  FOUNDATION_CONFIDENTIALITY_NOTICE,
].join("\n");

export const MOEKETSI_EMAIL_SIGNATURE_TEXT = [
  "Regards,",
  "Moeketsi Moima",
  "Business Development",
  "Foundation-1",
  "moeketsi@foundation-1.co.za",
  "www.foundation-1.co.za",
  "",
  FOUNDATION_BUSINESS_ADDRESS_TEXT,
  "",
  FOUNDATION_CONFIDENTIALITY_NOTICE,
].join("\n");

export const TIISETSO_EMAIL_SIGNATURE_TEXT = [
  "Regards,",
  "Tiisetso Mogotlane",
  "Business Development",
  "Foundation-1",
  "tiisetso@foundation-1.co.za",
  "www.foundation-1.co.za",
  "",
  FOUNDATION_BUSINESS_ADDRESS_TEXT,
  "",
  FOUNDATION_CONFIDENTIALITY_NOTICE,
].join("\n");

const FOUNDATION_STAFF_DISPLAY_NAMES = new Map<string, string>([
  ["karman@foundation-1.co.za", "Karman Kekana"],
  ["moeketsi@foundation-1.co.za", "Moeketsi Moima"],
  ["tiisetso@foundation-1.co.za", "Tiisetso Mogotlane"],
]);

const SYSTEM_SIGNATURES_BY_EMAIL = new Map<string, string>([
  ["karman@foundation-1.co.za", KARMAN_EMAIL_SIGNATURE_TEXT],
  ["moeketsi@foundation-1.co.za", MOEKETSI_EMAIL_SIGNATURE_TEXT],
  ["tiisetso@foundation-1.co.za", TIISETSO_EMAIL_SIGNATURE_TEXT],
]);

export const SYSTEM_SIGNATURE_EMAILS = Array.from(SYSTEM_SIGNATURES_BY_EMAIL.keys());

export const SYSTEM_SIGNATURE_TEXTS = [
  KARMAN_EMAIL_SIGNATURE_TEXT,
  MOEKETSI_EMAIL_SIGNATURE_TEXT,
  TIISETSO_EMAIL_SIGNATURE_TEXT,
];

export function foundationDisplayNameForEmail(
  email: string | null | undefined,
  fallbackName?: string | null,
) {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  return (
    FOUNDATION_STAFF_DISPLAY_NAMES.get(normalizedEmail) ??
    fallbackName?.trim() ??
    normalizedEmail.split("@")[0] ??
    ""
  );
}

function buildFallbackSignature(input: {
  ownerEmail?: string | null;
  ownerName?: string | null;
}) {
  const email = input.ownerEmail?.trim().toLowerCase() ?? "";
  const displayName = foundationDisplayNameForEmail(email, input.ownerName);
  const lines = [
    "Regards,",
    displayName,
    "Foundation-1",
    email || null,
    "www.foundation-1.co.za",
    "",
    FOUNDATION_BUSINESS_ADDRESS_TEXT,
    "",
    FOUNDATION_CONFIDENTIALITY_NOTICE,
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}

export function systemSignatureTextForSender(input: {
  ownerEmail?: string | null;
  ownerName?: string | null;
  ownerRole?: SystemSignatureRole | null;
}): string | null {
  const email = input.ownerEmail?.trim().toLowerCase() ?? "";
  const explicitSignature = SYSTEM_SIGNATURES_BY_EMAIL.get(email);
  if (explicitSignature) return explicitSignature;
  if (input.ownerRole === "admin") return KARMAN_EMAIL_SIGNATURE_TEXT;
  if ((input.ownerRole === "sales" || input.ownerRole === "partner") && email) {
    return buildFallbackSignature(input);
  }
  return null;
}

export function splitSignatureForBanner(signatureText: string): {
  beforeBanner: string;
  afterBanner: string | null;
} {
  const index = signatureText.indexOf(FOUNDATION_CONFIDENTIALITY_NOTICE);
  if (index === -1) {
    return { beforeBanner: signatureText.trim(), afterBanner: null };
  }

  return {
    beforeBanner: signatureText.slice(0, index).trimEnd(),
    afterBanner: signatureText.slice(index).trim(),
  };
}

/**
 * Single source of truth for the client document taxonomy.
 *
 * Used by: app/api/upload/[token]/route.ts, app/upload/[token]/page.tsx,
 * components/migration/MigrationDashboard.tsx,
 * app/api/migration/profiles/status/route.ts.
 *
 * Counting rule: uploaded titles are always `${meta.title}` or
 * `${meta.title} - <free text>` — so we match by TITLE PREFIX first (immune to
 * client filenames like "municipal-utility-bill.pdf" inside a FICA title), and
 * fall back to keyword scanning only for admin-authored/legacy titles.
 */

export const DOCUMENT_TYPES = [
  "expression_of_interest",
  "signed_eoi",
  "utility_bills",
  "signed_proposal",
  "signed_mandate",
  "company_registration",
  "fica_director_id",
  "fica_proof_of_residence",
  "audited_financials",
  "management_accounts",
  "bank_statements",
  "tax_clearance",
] as const;

export type ClientDocumentType = (typeof DOCUMENT_TYPES)[number];

export const KYC_DOCUMENT_TYPES: readonly ClientDocumentType[] = [
  "company_registration",
  "fica_director_id",
  "fica_proof_of_residence",
  "audited_financials",
  "management_accounts",
  "bank_statements",
  "tax_clearance",
];

/**
 * The only document types Foundation-1 may receive. Bank KYC files are
 * deliberately excluded: after the signed formal UFMS proposal, the client
 * sends those directly to info@ufms.net under the bank's POPIA instruction.
 */
export const CLIENT_UPLOAD_DOCUMENT_TYPES: readonly ClientDocumentType[] = [
  "expression_of_interest",
  "signed_eoi",
  "utility_bills",
  "signed_proposal",
  "signed_mandate",
];

export type DocumentTypeMeta = {
  /** Canonical title prefix used when storing uploads. */
  title: string;
  category: "Onboarding" | "Qualification" | "Commercial" | "KYC";
  /** Fallback keywords for admin-authored/legacy titles. Lowercase. */
  keywords: string[];
};

export const DOCUMENT_TYPE_META: Record<ClientDocumentType, DocumentTypeMeta> = {
  expression_of_interest: {
    title: "Expression of Interest",
    category: "Onboarding",
    keywords: ["expression of interest"],
  },
  signed_eoi: {
    title: "Signed Expression of Interest",
    category: "Onboarding",
    keywords: ["signed expression of interest", "signed eoi"],
  },
  utility_bills: {
    title: "Utility Bill",
    category: "Qualification",
    keywords: ["utility bill", "electricity bill", "eskom bill", "municipal bill"],
  },
  signed_proposal: {
    title: "Signed Proposal",
    category: "Commercial",
    keywords: ["signed proposal"],
  },
  signed_mandate: {
    title: "Signed Foundation-1 Mandate",
    category: "Commercial",
    keywords: ["foundation-1 mandate", "signed mandate"],
  },
  company_registration: {
    title: "Company Registration Documents",
    category: "KYC",
    keywords: ["company registration", "cipc", "cor14", "cor15"],
  },
  fica_director_id: {
    title: "FICA - Director ID",
    category: "KYC",
    keywords: ["fica - director id", "director id"],
  },
  fica_proof_of_residence: {
    title: "FICA - Proof of Residence",
    category: "KYC",
    keywords: ["proof of residence", "proof of address"],
  },
  audited_financials: {
    title: "Audited Financial Statements",
    category: "KYC",
    keywords: ["audited financial statements", "audited financials"],
  },
  management_accounts: {
    title: "Management Accounts",
    category: "KYC",
    keywords: ["management accounts", "management account"],
  },
  bank_statements: {
    title: "Bank Statements (6 months)",
    category: "KYC",
    keywords: ["bank statements", "bank statement"],
  },
  tax_clearance: {
    title: "Tax Clearance Certificate",
    category: "KYC",
    keywords: ["tax clearance", "sars pin"],
  },
};

export function isClientDocumentType(value: unknown): value is ClientDocumentType {
  return typeof value === "string" && (DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function isClientUploadDocumentType(value: unknown): value is ClientDocumentType {
  return typeof value === "string" && CLIENT_UPLOAD_DOCUMENT_TYPES.includes(value as ClientDocumentType);
}

/**
 * Classify a stored document title into a taxonomy type.
 * Prefix match on the canonical title wins; keyword scan is the fallback.
 * Returns null when nothing matches (document counts nowhere).
 */
export function classifyDocumentTitle(title: string): ClientDocumentType | null {
  const value = title.trim().toLowerCase();
  // Longest canonical prefix first so "Signed Expression of Interest" does not
  // classify as "Expression of Interest".
  const byPrefixLength = [...DOCUMENT_TYPES].sort(
    (a, b) => DOCUMENT_TYPE_META[b].title.length - DOCUMENT_TYPE_META[a].title.length,
  );
  for (const type of byPrefixLength) {
    if (value.startsWith(DOCUMENT_TYPE_META[type].title.toLowerCase())) return type;
  }
  for (const type of byPrefixLength) {
    if (DOCUMENT_TYPE_META[type].keywords.some((keyword) => value.includes(keyword))) {
      // Guard the signed/unsigned EOI split for legacy keyword matches.
      if (type === "expression_of_interest" && value.includes("signed")) continue;
      return type;
    }
  }
  return null;
}

/** Count documents per type from stored titles. */
export function countDocumentsByType(
  documents: ReadonlyArray<{ title: string }>,
): Record<ClientDocumentType, number> {
  const counts = Object.fromEntries(DOCUMENT_TYPES.map((type) => [type, 0])) as Record<
    ClientDocumentType,
    number
  >;
  for (const document of documents) {
    const type = classifyDocumentTitle(document.title);
    if (type) counts[type] += 1;
  }
  return counts;
}

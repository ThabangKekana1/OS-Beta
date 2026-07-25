import { createPdfParser } from "@/lib/pdf-parse-runtime";

/**
 * Foundation-1 KYC custody (Model B).
 *
 * The six-item bank pack is collected INTO the migration case, verified by an
 * operator before any external handoff, and mined into structured fields for
 * the case record. Extraction is heuristic and never a substitute for the
 * operator's verification pass. SA identity numbers are masked before any
 * text is persisted.
 */

export const KYC_ATTESTATION_VERSION = "2026-07-21.1";
export const KYC_EXTRACTION_VERSION = "2026-07-21.1";
export const KYC_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

export type KycDocumentType =
  | "company_registration"
  | "director_fica"
  | "audited_financials"
  | "management_accounts"
  | "bank_statements"
  | "tax_clearance";

export type KycDocumentDefinition = {
  id: KycDocumentType;
  label: string;
  detail: string;
};

export const KYC_DOCUMENT_TYPES: readonly KycDocumentDefinition[] = [
  {
    id: "company_registration",
    label: "Company registration documents",
    detail: "The complete registration documents for the entity that will contract for the solution.",
  },
  {
    id: "director_fica",
    label: "Director FICA documents",
    detail: "A copy of each director's identity document and proof of residence.",
  },
  {
    id: "audited_financials",
    label: "Latest audited financial statements",
    detail: "The latest audited financial statements for the contracting entity.",
  },
  {
    id: "management_accounts",
    label: "Latest management accounts",
    detail: "The latest available management accounts for the contracting entity.",
  },
  {
    id: "bank_statements",
    label: "Last six months of bank statements",
    detail: "Six consecutive months for the contracting entity's business bank account.",
  },
  {
    id: "tax_clearance",
    label: "Valid tax clearance",
    detail: "A valid SARS tax-clearance certificate or tax-compliance status PIN letter.",
  },
] as const;

const KYC_DOCUMENT_TYPE_IDS = new Set<string>(KYC_DOCUMENT_TYPES.map((item) => item.id));

export function isKycDocumentType(value: unknown): value is KycDocumentType {
  return typeof value === "string" && KYC_DOCUMENT_TYPE_IDS.has(value);
}

export function kycDocumentLabel(type: KycDocumentType) {
  return KYC_DOCUMENT_TYPES.find((item) => item.id === type)?.label ?? type;
}

// ---------------------------------------------------------------------------
// Readiness attestation (S7 gate)
// ---------------------------------------------------------------------------

export type KycReadinessItem = {
  id: KycDocumentType;
  held: boolean;
  note: string | null;
};

export type KycFixItItem = {
  id: KycDocumentType;
  action: string;
  expectedBy: string | null;
};

export type KycReadinessEvaluation = {
  ok: boolean;
  error: string | null;
  complete: boolean;
  items: KycReadinessItem[];
  missing: KycDocumentType[];
};

/** The standing guidance shown for a missing item in the Fix-It plan. */
export const KYC_FIX_IT_GUIDANCE: Record<KycDocumentType, string> = {
  company_registration: "Request the CIPC registration documents (CoR 14.3 / CM1) from your accountant or download them from CIPC e-Services.",
  director_fica: "Collect a certified ID copy and a proof of residence not older than three months for every director.",
  audited_financials: "Request the latest signed audited financial statements from your auditor; reviewed statements may be discussed with Foundation-1 if an audit is not required.",
  management_accounts: "Ask your bookkeeper or accountant for year-to-date management accounts (income statement and balance sheet).",
  bank_statements: "Download the last six months of business account statements from internet banking as PDFs.",
  tax_clearance: "Request a Tax Compliance Status PIN letter on SARS eFiling (Tax Status → Tax Compliance Status).",
};

function cleanNote(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 300) : "";
}

/**
 * Validates a client readiness attestation. Every one of the six items must be
 * answered; the attestation is complete only when every item is held.
 */
export function evaluateKycReadiness(rawItems: unknown): KycReadinessEvaluation {
  if (!Array.isArray(rawItems)) {
    return { ok: false, error: "Answer every document item.", complete: false, items: [], missing: [] };
  }
  const byId = new Map<string, { held: boolean; note: string }>();
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as { id?: unknown; held?: unknown; note?: unknown };
    if (!isKycDocumentType(candidate.id)) continue;
    if (typeof candidate.held !== "boolean") continue;
    byId.set(candidate.id, { held: candidate.held, note: cleanNote(candidate.note) });
  }
  const items: KycReadinessItem[] = [];
  const missing: KycDocumentType[] = [];
  for (const definition of KYC_DOCUMENT_TYPES) {
    const answer = byId.get(definition.id);
    if (!answer) {
      return {
        ok: false,
        error: `Answer whether you hold: ${definition.label}.`,
        complete: false,
        items: [],
        missing: [],
      };
    }
    items.push({ id: definition.id, held: answer.held, note: answer.note || null });
    if (!answer.held) missing.push(definition.id);
  }
  return { ok: true, error: null, complete: missing.length === 0, items, missing };
}

/** Normalises a client-submitted Fix-It plan against the missing items. */
export function normaliseKycFixItPlan(rawPlan: unknown, missing: KycDocumentType[]): KycFixItItem[] {
  const provided = new Map<string, { action: string; expectedBy: string | null }>();
  if (Array.isArray(rawPlan)) {
    for (const raw of rawPlan) {
      if (!raw || typeof raw !== "object") continue;
      const candidate = raw as { id?: unknown; action?: unknown; expectedBy?: unknown };
      if (!isKycDocumentType(candidate.id)) continue;
      const action = cleanNote(candidate.action);
      const expectedBy = typeof candidate.expectedBy === "string" && /^\d{4}-\d{2}-\d{2}$/.test(candidate.expectedBy)
        ? candidate.expectedBy
        : null;
      if (action || expectedBy) provided.set(candidate.id, { action: action || KYC_FIX_IT_GUIDANCE[candidate.id], expectedBy });
    }
  }
  return missing.map((id) => {
    const entry = provided.get(id);
    return {
      id,
      action: entry?.action ?? KYC_FIX_IT_GUIDANCE[id],
      expectedBy: entry?.expectedBy ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Soft self-check at case creation (S3)
// ---------------------------------------------------------------------------

export type KycSelfCheckAnswer = "yes" | "no" | "unsure";
export type KycSelfCheck = Partial<Record<KycDocumentType, KycSelfCheckAnswer>>;

const SELF_CHECK_ANSWERS = new Set(["yes", "no", "unsure"]);

/** Sanitises the optional 30-second self-check captured with the case. */
export function sanitiseKycSelfCheck(raw: unknown): KycSelfCheck | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const result: KycSelfCheck = {};
  let any = false;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isKycDocumentType(key)) continue;
    if (typeof value !== "string" || !SELF_CHECK_ANSWERS.has(value)) continue;
    result[key] = value as KycSelfCheckAnswer;
    any = true;
  }
  return any ? result : null;
}

// ---------------------------------------------------------------------------
// Data extraction (the data asset)
// ---------------------------------------------------------------------------

export type KycExtractedFields = {
  companyRegistrationNumber: string | null;
  vatNumber: string | null;
  taxReferenceNumber: string | null;
  taxCompliancePin: string | null;
  financialYearEnd: string | null;
  statementMonths: string[];
  detectedAmounts: number | null;
  maskedIdCount: number;
};

export type KycDocumentExtraction = {
  version: string;
  extractedAt: string;
  documentType: KycDocumentType;
  pageCount: number | null;
  textLength: number;
  readable: boolean;
  fields: KycExtractedFields;
  textExcerpt: string | null;
};

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * Masks SA identity numbers (13 digits with a plausible date prefix) so raw
 * identifiers are never persisted in extraction output.
 */
export function maskSaIdNumbers(text: string): { text: string; maskedCount: number } {
  let maskedCount = 0;
  const masked = text.replace(/\b(\d{2})(\d{9})(\d{2})\b/g, (match, head: string, _middle: string, tail: string) => {
    const month = Number(match.slice(2, 4));
    const day = Number(match.slice(4, 6));
    if (month < 1 || month > 12 || day < 1 || day > 31) return match;
    maskedCount += 1;
    return `${head}*********${tail}`;
  });
  return { text: masked, maskedCount };
}

/** Pure heuristic field extraction over already-masked text. */
export function analyseKycText(rawText: string, documentType: KycDocumentType): {
  fields: KycExtractedFields;
  textExcerpt: string | null;
  textLength: number;
  readable: boolean;
} {
  const { text, maskedCount } = maskSaIdNumbers(rawText.replace(/\u0000/g, " "));
  const compact = text.replace(/\s+/g, " ").trim();

  const registrationMatch = compact.match(/\b((?:19|20)\d{2})\s*\/\s*(\d{6})\s*\/\s*(\d{2})\b/);
  const vatMatch = compact.match(/\bVAT(?:\s*(?:no\.?|number|registration(?:\s*no\.?)?))?\s*[:#]?\s*(4\d{9})\b/i);
  const taxRefMatch = compact.match(/\btax\s*(?:ref(?:erence)?(?:\s*(?:no\.?|number))?)\s*[:#]?\s*(\d{10})\b/i);
  const pinMatch = compact.match(/\b(?:tax\s*compliance\s*status\s*)?PIN\s*[:#]?\s*([A-Z0-9]{8,12})\b/);
  const yearEndMatch = compact.match(/\byear\s*end(?:ed|ing)?\s*(?:at\s*|on\s*)?(\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/i);

  const monthsFound = new Set<string>();
  const monthPattern = new RegExp(`\\b(${MONTH_NAMES.join("|")})[a-z]*\\.?\\s+(20\\d{2})\\b`, "gi");
  for (const match of compact.matchAll(monthPattern)) {
    const monthIndex = MONTH_NAMES.findIndex((name) => match[1].toLowerCase().startsWith(name.slice(0, 3)));
    const canonical = MONTH_NAMES.find((name) => match[1].toLowerCase() === name);
    const index = canonical ? MONTH_NAMES.indexOf(canonical) : monthIndex;
    if (index >= 0) monthsFound.add(`${match[2]}-${String(index + 1).padStart(2, "0")}`);
  }

  const amountMatches = compact.match(/R\s?[\d][\d\s,']*(?:\.\d{2})?/g) ?? [];

  const fields: KycExtractedFields = {
    companyRegistrationNumber: registrationMatch
      ? `${registrationMatch[1]}/${registrationMatch[2]}/${registrationMatch[3]}`
      : null,
    vatNumber: vatMatch ? vatMatch[1] : null,
    taxReferenceNumber: taxRefMatch ? taxRefMatch[1] : null,
    taxCompliancePin: documentType === "tax_clearance" && pinMatch ? pinMatch[1] : null,
    financialYearEnd: yearEndMatch ? yearEndMatch[1] : null,
    statementMonths: [...monthsFound].sort(),
    detectedAmounts: amountMatches.length || null,
    maskedIdCount: maskedCount,
  };

  const readable = compact.length >= 40;
  return {
    fields,
    textExcerpt: readable ? compact.slice(0, 4_000) : null,
    textLength: compact.length,
    readable,
  };
}

export type KycFileLike = {
  name: string;
  type?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
};

/** Extracts text (PDF/TXT) and heuristic fields from an uploaded KYC file. */
export async function extractKycDocumentData(
  file: KycFileLike,
  documentType: KycDocumentType,
  options: { extractedAt?: string } = {},
): Promise<KycDocumentExtraction> {
  const extractedAt = options.extractedAt ?? new Date().toISOString();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = file.type?.toLowerCase() ?? "";
  const empty = (pageCount: number | null): KycDocumentExtraction => ({
    version: KYC_EXTRACTION_VERSION,
    extractedAt,
    documentType,
    pageCount,
    textLength: 0,
    readable: false,
    fields: analyseKycText("", documentType).fields,
    textExcerpt: null,
  });

  try {
    if (extension === "txt" || contentType.startsWith("text/plain")) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      const analysed = analyseKycText(text, documentType);
      return { version: KYC_EXTRACTION_VERSION, extractedAt, documentType, pageCount: null, ...analysed };
    }
    if (extension !== "pdf" && contentType !== "application/pdf") {
      // Images (director FICA scans etc.) are stored for verification;
      // text mining requires OCR which is intentionally out of scope here.
      return empty(null);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parser = await createPdfParser(bytes);
    try {
      const result = await parser.getText();
      const analysed = analyseKycText(result.text ?? "", documentType);
      return {
        version: KYC_EXTRACTION_VERSION,
        extractedAt,
        documentType,
        pageCount: result.total ?? null,
        ...analysed,
      };
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } catch {
    return empty(null);
  }
}

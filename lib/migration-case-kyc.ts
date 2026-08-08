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
  company_registration: "Your accountant holds these, or download the CIPC disclosure certificate (CoR 14.3 / CM1) yourself from CIPC e-Services — it takes minutes.",
  director_fica: "Each director needs a certified ID copy (any SAPS station or bank branch certifies free of charge) plus a proof of residence under three months old — a municipal bill or bank statement works.",
  audited_financials: "Your auditor issues these — ask for the latest signed set. If your entity is not audited, ask your accountant for the independently reviewed or compiled statements and tell us.",
  management_accounts: "Your accountant or bookkeeper can produce year-to-date management accounts (income statement and balance sheet) from your books — usually within a day or two of asking.",
  bank_statements: "Log in to business internet banking and download the last six months as bank-stamped PDFs — every major SA bank has a statements tab; no branch visit needed.",
  tax_clearance: "On SARS eFiling: log in → Tax Status → Tax Compliance Status → request a PIN letter. Issued immediately if you are compliant; your accountant or tax practitioner can also pull it.",
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
// Document gate (S7/S8) — three states per item, partial saves always accepted
// ---------------------------------------------------------------------------
//
// Founder rule (2026-08): clients upload whatever they have; PARTIAL UPLOADS
// ARE FINE and the client's journey is never blocked. For anything missing
// the client can record "I will provide it by [date]" or "I don't have this",
// each with a practical Fix-It hint. Foundation-1 only forwards a pack to the
// bank once it is complete — the system WARNS the operator, it never decides.

export const KYC_PLAN_VERSION = "2026-08-16.1";

export type KycItemPlanStatus = "promised" | "dont_have";

/** A client-declared plan entry for one not-yet-uploaded document. */
export type KycItemPlanEntry = {
  id: KycDocumentType;
  status: KycItemPlanStatus;
  /** YYYY-MM-DD; meaningful for "promised" items, optional otherwise. */
  expectedBy: string | null;
  note: string | null;
};

const PLAN_STATUSES = new Set<string>(["promised", "dont_have"]);

function cleanDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Sanitises a client-submitted item plan. ANY subset of the six items is
 * accepted — partial saves are the normal case, never an error. Unknown
 * document types and malformed entries are dropped silently.
 */
export function sanitiseKycItemPlan(raw: unknown): KycItemPlanEntry[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<KycDocumentType, KycItemPlanEntry>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as { id?: unknown; status?: unknown; expectedBy?: unknown; note?: unknown };
    if (!isKycDocumentType(candidate.id)) continue;
    if (typeof candidate.status !== "string" || !PLAN_STATUSES.has(candidate.status)) continue;
    byId.set(candidate.id, {
      id: candidate.id,
      status: candidate.status as KycItemPlanStatus,
      expectedBy: cleanDate(candidate.expectedBy),
      note: cleanNote(candidate.note) || null,
    });
  }
  return [...byId.values()];
}

/** Later declarations for the same item replace earlier ones; the rest keep. */
export function mergeKycItemPlan(
  existing: KycItemPlanEntry[],
  updates: KycItemPlanEntry[],
): KycItemPlanEntry[] {
  const byId = new Map<KycDocumentType, KycItemPlanEntry>();
  for (const entry of existing) byId.set(entry.id, entry);
  for (const entry of updates) byId.set(entry.id, entry);
  return KYC_DOCUMENT_TYPES
    .map((definition) => byId.get(definition.id))
    .filter((entry): entry is KycItemPlanEntry => Boolean(entry));
}

/**
 * Reads a plan out of a stored readiness row, tolerating both shapes:
 * the three-state plan entries written by the document gate and the legacy
 * attestation items ({ id, held, note }) paired with their Fix-It plan.
 */
export function kycPlanFromStoredItems(items: unknown, fixItPlan?: unknown): KycItemPlanEntry[] {
  const direct = sanitiseKycItemPlan(items);
  if (direct.length) return direct;
  if (!Array.isArray(items)) return [];
  const expectedById = new Map<string, string | null>();
  if (Array.isArray(fixItPlan)) {
    for (const entry of fixItPlan) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as { id?: unknown; expectedBy?: unknown };
      if (!isKycDocumentType(candidate.id)) continue;
      expectedById.set(candidate.id, cleanDate(candidate.expectedBy));
    }
  }
  const plan: KycItemPlanEntry[] = [];
  for (const entry of items) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as { id?: unknown; held?: unknown; note?: unknown };
    if (!isKycDocumentType(candidate.id) || candidate.held !== false) continue;
    const expectedBy = expectedById.get(candidate.id) ?? null;
    plan.push({
      id: candidate.id,
      status: expectedBy ? "promised" : "dont_have",
      expectedBy,
      note: cleanNote(candidate.note) || null,
    });
  }
  return plan;
}

/** The minimum shape of a custody document row the gate needs to read. */
export type KycGateDocumentLike = {
  document_type: string;
  status: string;
  original_name?: string | null;
  created_at: string;
  review_note?: string | null;
};

export type KycGateItemState = "uploaded" | "promised" | "dont_have" | "outstanding";

export type KycGateItem = {
  id: KycDocumentType;
  label: string;
  detail: string;
  /** The three client states plus "outstanding" (no upload, no declaration). */
  state: KycGateItemState;
  documentStatus: "received" | "verified" | "rejected" | null;
  fileName: string | null;
  uploadedAt: string | null;
  reviewNote: string | null;
  expectedBy: string | null;
  note: string | null;
  /** Practical SA-specific hint; null once the document is in custody. */
  fixIt: string | null;
};

export type KycGateStatus = {
  items: KycGateItem[];
  requiredCount: number;
  receivedCount: number;
  verifiedCount: number;
  promisedCount: number;
  dontHaveCount: number;
  outstandingCount: number;
  /** All six documents in custody (received or verified, none rejected). */
  complete: boolean;
  /** All six documents verified by the operator — the only bank-ready state. */
  bankReady: boolean;
  missing: KycDocumentType[];
  /** Earliest promised date among not-yet-uploaded items. */
  nextExpectedBy: string | null;
};

/**
 * The single source of truth for KYC pack state. An upload always wins over a
 * declaration; a rejected upload reopens the slot (the plan entry, if any,
 * resurfaces so the chase rails keep working).
 */
export function evaluateKycGate(
  documents: readonly KycGateDocumentLike[] | null | undefined,
  plan: readonly KycItemPlanEntry[] = [],
): KycGateStatus {
  const latest = new Map<string, KycGateDocumentLike>();
  for (const document of documents ?? []) {
    if (!isKycDocumentType(document.document_type)) continue;
    const existing = latest.get(document.document_type);
    if (!existing || document.created_at > existing.created_at) {
      latest.set(document.document_type, document);
    }
  }
  const planById = new Map(plan.map((entry) => [entry.id, entry]));

  const items: KycGateItem[] = [];
  const missing: KycDocumentType[] = [];
  let received = 0;
  let verified = 0;
  let promised = 0;
  let dontHave = 0;
  let outstanding = 0;
  let nextExpectedBy: string | null = null;

  for (const definition of KYC_DOCUMENT_TYPES) {
    const document = latest.get(definition.id) ?? null;
    const declared = planById.get(definition.id) ?? null;
    const inCustody = Boolean(document && document.status !== "rejected");
    let state: KycGateItemState;
    if (document && inCustody) {
      state = "uploaded";
      received += 1;
      if (document.status === "verified") verified += 1;
    } else if (declared) {
      state = declared.status;
      if (declared.status === "promised") promised += 1;
      else dontHave += 1;
      missing.push(definition.id);
      if (declared.status === "promised" && declared.expectedBy) {
        if (!nextExpectedBy || declared.expectedBy < nextExpectedBy) nextExpectedBy = declared.expectedBy;
      }
    } else {
      state = "outstanding";
      outstanding += 1;
      missing.push(definition.id);
    }
    items.push({
      id: definition.id,
      label: definition.label,
      detail: definition.detail,
      state,
      documentStatus: document ? (document.status as "received" | "verified" | "rejected") : null,
      fileName: document?.original_name ?? null,
      uploadedAt: document?.created_at ?? null,
      reviewNote: document?.status === "rejected" ? document.review_note ?? null : null,
      expectedBy: !inCustody ? declared?.expectedBy ?? null : null,
      note: !inCustody ? declared?.note ?? null : null,
      fixIt: inCustody ? null : KYC_FIX_IT_GUIDANCE[definition.id],
    });
  }

  return {
    items,
    requiredCount: KYC_DOCUMENT_TYPES.length,
    receivedCount: received,
    verifiedCount: verified,
    promisedCount: promised,
    dontHaveCount: dontHave,
    outstandingCount: outstanding,
    complete: received === KYC_DOCUMENT_TYPES.length,
    bankReady: verified === KYC_DOCUMENT_TYPES.length,
    missing,
    nextExpectedBy,
  };
}

/**
 * Promised items whose date has arrived without an upload — the chase rail.
 * `today` is a YYYY-MM-DD date string (SA business date).
 */
export function dueKycPromises(gate: KycGateStatus, today: string) {
  return gate.items.filter(
    (item) => item.state === "promised" && item.expectedBy !== null && item.expectedBy <= today,
  );
}

export type SubmissionKycAssessment = {
  complete: boolean;
  bankReady: boolean;
  /** The founder's rule in code: an incomplete pack WARNS, it never blocks. */
  blocks: false;
  warnings: string[];
};

/**
 * What the operator must see before an external submission. Missing items
 * produce explicit warnings (with promised dates where the client gave them);
 * nothing here ever prevents the submission — Karman decides, the system
 * informs.
 */
export function assessSubmissionKyc(gate: KycGateStatus): SubmissionKycAssessment {
  const warnings: string[] = [];
  if (!gate.complete) {
    const detail = gate.items
      .filter((item) => item.state !== "uploaded")
      .map((item) => {
        if (item.state === "promised") {
          return `${item.label} (promised${item.expectedBy ? ` by ${item.expectedBy}` : ""})`;
        }
        if (item.state === "dont_have") return `${item.label} (client does not have this)`;
        return `${item.label} (no upload, no plan)`;
      });
    warnings.push(
      `KYC pack INCOMPLETE: ${gate.receivedCount}/${gate.requiredCount} documents in custody. Outstanding: ${detail.join("; ")}.`,
    );
    warnings.push(
      "Submitting now hands the client to the bank/Green Share before Foundation-1 holds the full pack. You may proceed — this is a warning, not a block.",
    );
  } else if (!gate.bankReady) {
    warnings.push(
      `KYC pack complete but only ${gate.verifiedCount}/${gate.requiredCount} verified. Verify all six before the pack is bank-ready.`,
    );
  }
  return { complete: gate.complete, bankReady: gate.bankReady, blocks: false, warnings };
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

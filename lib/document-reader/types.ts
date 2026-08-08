/**
 * FOUNDATION-1 DOCUMENT READER — shared types.
 *
 * The machine-reading layer for uploaded documents. Models and OCR engines
 * READ and PROPOSE; the existing deterministic verifiers DISPOSE. No machine
 * extraction is ever marked "verified" unless it passes the reconciliation
 * already implemented in `lib/utility-bill-analysis.ts` (line-item sum vs
 * statement total, ±0.2%) or, for funder proposals, the deterministic
 * cross-checks derived from the cracked funder pricing model.
 *
 * INTERNAL: the proposal cross-check constants encode the funder pricing
 * crack. Never expose reader internals in client- or partner-facing output.
 */
import type { UtilityBillDocumentAnalysis } from "@/lib/utility-bill-analysis";

export const DOCUMENT_READER_VERSION = "2026-08-08.1";

/** Positive intake classification (audit §d3): route before extraction. */
export type DocumentType =
  | "utility_bill"
  | "funder_proposal"
  | "bank_statement"
  | "eoi"
  | "kyc_vat_certificate"
  | "kyc_company_registration"
  | "kyc_id_document"
  | "kyc_other"
  | "unknown";

/** How the machine actually read the document. */
export type ReadMethod =
  | "text-layer" // born-digital PDF text via pdf-parse (existing path)
  | "vlm" // hosted vision model adapter (env-keyed; dormant until funded)
  | "local-ocr" // local tesseract fallback (validation only, never prod)
  | "none"; // nothing could read it — operator desk

export type VerificationStatus =
  /** Passed the deterministic verifier. Safe for downstream automation. */
  | "verified"
  /** Machine produced an extraction but the verifier rejected or could not
   * fully confirm it. A human reviews WITH the machine output + diff. */
  | "needs_review"
  /** No machine reading was possible. Operator desk, current behaviour —
   * now explicit instead of implicit. */
  | "needs_human";

export type VerificationResult = {
  status: VerificationStatus;
  verifier: "utility-bill-reconciliation" | "proposal-crosschecks" | "none";
  /** For bills: the ±0.2% line-item↔statement-total reconciliation outcome. */
  reconciled?: boolean;
  /** Absolute rand difference the reconciler measured, when available. */
  reconciliationDifference?: number | null;
  notes: string[];
};

export type ReadConfidence = "high" | "medium" | "low";

export type ClassificationResult = {
  docType: DocumentType;
  confidence: number; // 0..1
  signals: string[];
  /** True when the text layer is empty/near-empty — a scan or photo. */
  needsOcr: boolean;
};

/** One machine-read field with its own provenance and confidence. */
export type FieldReading<T> = {
  value: T | null;
  confidence: ReadConfidence;
  /** Where the value came from: a text-layer regex, a vision read, a derivation. */
  source: "text-layer" | "vlm" | "derived";
  /** Raw matched text, for the operator's audit trail. */
  evidence?: string;
};

export type ProposalCrosscheck = {
  name:
    | "capex-recovery" // capex ≈ monthlyCharge / 0.015969, vs anchor curve
    | "sizing-yield" // implied kWp = monthly generation / 173.375 vs stated kWp
    | "term" // 10-year / 120 months
    | "escalation"; // 6% p.a. fixed
  pass: boolean | null; // null = not checkable (field missing)
  expected: string;
  actual: string;
  deviationPct: number | null;
  note: string;
};

/**
 * Extraction schema for a returned Nedbank/Eqstra UFMS P4L deck
 * (audit §c field table). Money tables in these decks are images, so
 * capex is DERIVED from the text-layer monthly charge via the cracked
 * rate factor rather than read from the page.
 */
export type FunderProposalExtraction = {
  version: string;
  dialect: "ufms-p4l" | "wheeling" | "unknown";
  clientName: FieldReading<string>;
  pvKwp: FieldReading<number>;
  bessKwh: FieldReading<number>;
  currentBlendedTariff: FieldReading<number>; // R/kWh
  solutionTariff: FieldReading<number>; // R/kWh
  monthlyChargeExVat: FieldReading<number>; // R
  currentAnnualCost: FieldReading<number>; // R p.a. ("Existing Scenario")
  claimedUtilityEscalationPct: FieldReading<number>; // the 12% marketing claim
  tenYearUtilityForecast: FieldReading<number>; // R
  tenYearSavingClaim: FieldReading<number>; // R
  generationKwhPerDay: FieldReading<number>;
  generationKwhPerMonth: FieldReading<number>;
  contractEscalationPct: FieldReading<number>; // 6% fixed
  termYears: FieldReading<number>; // 10
  abortFee: FieldReading<number>; // R75,000
  /** Derived: monthlyChargeExVat / 0.015969 — recovers the image-only capex. */
  derivedCapex: FieldReading<number>;
  crosschecks: ProposalCrosscheck[];
  /** Forensic flags (e.g. the 12%-claim vs ×15.0057-forecast escalation trick). */
  flags: string[];
  warnings: string[];
};

/** Non-bill, non-proposal documents: classified + routed, no field extraction. */
export type GenericDocumentExtraction = {
  version: string;
  docType: DocumentType;
  note: string;
};

export type DocumentExtraction =
  | UtilityBillDocumentAnalysis
  | FunderProposalExtraction
  | GenericDocumentExtraction;

export type DocumentReadResult = {
  version: string;
  sourceFileName: string;
  sourceHash: string | null;
  analysedAt: string;
  pageCount: number | null;
  textLength: number;
  docType: DocumentType;
  classification: ClassificationResult;
  method: ReadMethod;
  confidence: ReadConfidence;
  extraction: DocumentExtraction | null;
  verification: VerificationResult;
  warnings: string[];
};

export type ReadDocumentOptions = {
  /** Caller context, e.g. the bill-pack intake knows uploads should be bills. */
  expectedType?: DocumentType;
  sourceHash?: string;
  analysedAt?: string;
};

/** Result of one OCR/vision adapter attempt in the fallback chain. */
export type AdapterAttempt =
  | { ok: true; method: ReadMethod; text: string; structuredJson?: string }
  | { ok: false; method: ReadMethod; skipped: boolean; reason: string };

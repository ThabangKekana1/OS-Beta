/**
 * FOUNDATION-1 DOCUMENT READER — entry point.
 *
 * `readDocument(buffer, filename)` → { docType, extraction, confidence,
 * method, verification }. Machine reads; the existing deterministic
 * verifiers dispose; humans handle exceptions only.
 *
 *   classify (text-layer heuristics)
 *     ├─ utility_bill    → bill head (pdf-parse → analyseUtilityBillText;
 *     │                    scans → VLM → local OCR → operator desk), verdict
 *     │                    ALWAYS the existing ±0.2% reconciliation.
 *     ├─ funder_proposal → proposal head (text fields + cracked-engine
 *     │                    cross-checks; capex recovered from the monthly
 *     │                    charge because the money tables are images).
 *     ├─ bank_statement / eoi / kyc_* → classified + routed, no extraction.
 *     └─ unknown (zero text) → OCR chain if bytes given, else needs_human.
 *
 * Activation: `DOCUMENT_READER_MODE=1` gates the bill-pack intake wiring
 * (see lib/migration-case-bill-pack.ts); default behaviour is unchanged.
 * Hosted vision reading additionally needs DOCUMENT_READER_VLM_API_KEY +
 * DOCUMENT_READER_VLM_MODEL (see ./vlm-adapter.ts) — dormant until funded.
 */
import { createHash } from "node:crypto";

import { createPdfParser } from "@/lib/pdf-parse-runtime";
import { type UtilityBillDocumentAnalysis } from "@/lib/utility-bill-analysis";
import { classifyDocumentText, normaliseDocumentText } from "./classify";
import { readBill, type BillReadOutcome } from "./bill-head";
import { parseFunderProposalText, verifyProposalExtraction } from "./proposal-head";
import {
  DOCUMENT_READER_VERSION,
  type ClassificationResult,
  type DocumentReadResult,
  type GenericDocumentExtraction,
  type ReadDocumentOptions,
} from "./types";

export * from "./types";
export { classifyDocumentText, normaliseDocumentText } from "./classify";
export { readBill, verifyBillAnalysis } from "./bill-head";
export { parseFunderProposalText, verifyProposalExtraction } from "./proposal-head";
export { getVlmConfig, isVlmConfigured, readWithVlm } from "./vlm-adapter";
export { isLocalOcrEnabled, readWithLocalOcr } from "./local-ocr";

/** Feature gate for the bill-pack intake wiring. Off by default. */
export function isDocumentReaderEnabled(): boolean {
  return process.env.DOCUMENT_READER_MODE === "1";
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function genericExtraction(docType: DocumentReadResult["docType"], note: string): GenericDocumentExtraction {
  return { version: DOCUMENT_READER_VERSION, docType, note };
}

/**
 * Read a document whose text layer is already in hand (or empty, for scans).
 * Supply `bytes` to enable the OCR/vision chain on image-only documents.
 */
export async function readDocumentText(
  text: string,
  fileName: string,
  options: ReadDocumentOptions & { bytes?: Uint8Array; pageCount?: number | null } = {},
): Promise<DocumentReadResult> {
  const analysedAt = options.analysedAt ?? new Date().toISOString();
  const sourceHash =
    options.sourceHash ?? (options.bytes ? hashBytes(options.bytes) : null);
  const normalised = normaliseDocumentText(text ?? "");
  const classification: ClassificationResult = classifyDocumentText(text ?? "", fileName);

  const base = {
    version: DOCUMENT_READER_VERSION,
    sourceFileName: fileName,
    sourceHash,
    analysedAt,
    pageCount: options.pageCount ?? null,
    textLength: normalised.length,
    classification,
  };

  // Bills — and zero-text scans in a bill context — go to the bill head,
  // which owns the OCR chain and the deterministic reconciliation verdict.
  const treatAsBill =
    classification.docType === "utility_bill" ||
    (classification.docType === "unknown" && options.expectedType === "utility_bill") ||
    (classification.needsOcr && options.expectedType === undefined);
  if (treatAsBill) {
    const outcome: BillReadOutcome = await readBill(text ?? "", fileName, {
      bytes: options.bytes,
      sourceHash: sourceHash ?? undefined,
      analysedAt,
      pageCount: options.pageCount ?? null,
    });
    return {
      ...base,
      docType: classification.needsOcr && outcome.method === "none"
        ? "unknown"
        : "utility_bill",
      method: outcome.method,
      confidence: outcome.confidence,
      extraction: outcome.analysis,
      verification: outcome.verification,
      warnings: outcome.attempts.map((attempt) => `${attempt.method}: ${attempt.outcome}`),
    };
  }

  if (classification.docType === "funder_proposal") {
    const extraction = parseFunderProposalText(text ?? "");
    const verification = verifyProposalExtraction(extraction);
    const coreFields = [
      extraction.pvKwp,
      extraction.monthlyChargeExVat,
      extraction.currentBlendedTariff,
      extraction.solutionTariff,
    ];
    const readCount = coreFields.filter((field) => field.value !== null).length;
    return {
      ...base,
      docType: "funder_proposal",
      method: "text-layer",
      confidence: readCount === coreFields.length ? "high" : readCount >= 2 ? "medium" : "low",
      extraction,
      verification,
      warnings: extraction.warnings,
    };
  }

  // Classified non-bill, non-proposal documents: positively routed, no field
  // extraction here (KYC extraction remains with lib/migration-case-kyc.ts).
  if (classification.docType !== "unknown") {
    return {
      ...base,
      docType: classification.docType,
      method: "text-layer",
      confidence: classification.confidence >= 0.7 ? "high" : "medium",
      extraction: genericExtraction(
        classification.docType,
        `Classified as ${classification.docType}; routed without field extraction.`,
      ),
      verification: {
        status: "needs_review",
        verifier: "none",
        notes: [
          `Positively classified as ${classification.docType}; no deterministic verifier applies — route to its handling queue.`,
        ],
      },
      warnings: [],
    };
  }

  // Unknown with no OCR need: readable text that matched nothing.
  return {
    ...base,
    docType: "unknown",
    method: classification.needsOcr ? "none" : "text-layer",
    confidence: "low",
    extraction: null,
    verification: {
      status: "needs_human",
      verifier: "none",
      notes: [
        classification.needsOcr
          ? "Image-only document outside a bill context; no OCR adapter produced a reading."
          : "Text present but no document type matched; operator triage required.",
      ],
    },
    warnings: [],
  };
}

/**
 * Read an uploaded document from its raw bytes.
 * PDF → pdf-parse text layer; .txt → decoded as UTF-8; anything else is
 * treated as an image-only document (empty text layer, OCR chain).
 */
export async function readDocument(
  buffer: Uint8Array | ArrayBuffer,
  fileName: string,
  options: ReadDocumentOptions = {},
): Promise<DocumentReadResult> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "txt") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return readDocumentText(text, fileName, { ...options, bytes, pageCount: null });
  }

  if (extension !== "pdf") {
    // Photos (jpg/png/heic…) have no text layer at all: straight to the
    // classifier's needsOcr path with the bytes available for the chain.
    return readDocumentText("", fileName, { ...options, bytes, pageCount: null });
  }

  let text = "";
  let pageCount: number | null = null;
  try {
    // pdf.js transfers (detaches) the buffer it is given — parse a copy so
    // the original bytes survive for the OCR/vision chain.
    const parser = await createPdfParser(Uint8Array.from(bytes));
    try {
      const result = await parser.getText();
      text = result.text ?? "";
      pageCount = result.total ?? null;
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } catch {
    // Unreadable PDF container: proceed with an empty text layer; the OCR
    // chain (or the operator desk) takes it from here.
    text = "";
  }
  return readDocumentText(text, fileName, { ...options, bytes, pageCount });
}

/**
 * Bill-pack intake helper (wired in lib/migration-case-bill-pack.ts behind
 * DOCUMENT_READER_MODE=1): always returns a `UtilityBillDocumentAnalysis`
 * so the downstream pipeline (currentisation → aggregation → design basis)
 * is untouched. Non-bill uploads inside a bill pack surface as
 * manual-review analyses with the classification attached.
 */
export async function analyseBillPackFileWithReader(file: {
  name: string;
  bytes: Uint8Array;
  sourceHash?: string;
}): Promise<UtilityBillDocumentAnalysis> {
  const result = await readDocument(file.bytes, file.name, {
    expectedType: "utility_bill",
    sourceHash: file.sourceHash,
  });

  if (
    result.docType === "utility_bill" ||
    (result.extraction && "chargeLines" in (result.extraction as UtilityBillDocumentAnalysis))
  ) {
    return result.extraction as UtilityBillDocumentAnalysis;
  }

  // A non-bill document arrived in the bill pack (audit §b4: bank statements
  // do get uploaded as "utility bills"). Produce an explicit manual-review
  // analysis carrying the positive classification for the operator.
  const { analyseUtilityBillText } = await import("@/lib/utility-bill-analysis");
  const placeholder = analyseUtilityBillText("", {
    fileName: file.name,
    sourceHash: result.sourceHash ?? file.sourceHash,
  });
  return {
    ...placeholder,
    warnings: [
      `Document reader classified this upload as "${result.docType}" (confidence ${result.classification.confidence.toFixed(2)}), not a utility bill. Held for the operator desk.`,
      ...placeholder.warnings,
    ],
  };
}

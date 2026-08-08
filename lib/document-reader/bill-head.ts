/**
 * Bill head — reads a utility bill by machine, verified deterministically.
 *
 * Reading order (08 §4 P0-1):
 *   1. Born-digital text layer  → existing `analyseUtilityBillText` parser.
 *   2. Scan/photo               → hosted VLM adapter (dormant until keyed):
 *                                 model transcribes, SAME parser re-reads.
 *   3. Local tesseract fallback (dev validation only).
 *   4. Operator desk            → `needs_human` (current behaviour, explicit).
 *
 * The verdict is ALWAYS the existing deterministic verifier: a read is only
 * `verified` when `analyseUtilityBillText` returns status "analysed" AND its
 * ±0.2% line-item↔statement-total reconciliation passes. Anything else is
 * `needs_review` (machine output + diff attached) or `needs_human`.
 * This module never re-implements parsing — it routes readers INTO the
 * existing parser (do-not-rewrite rule).
 */
import {
  analyseUtilityBillText,
  type UtilityBillDocumentAnalysis,
} from "@/lib/utility-bill-analysis";
import { readWithLocalOcr } from "./local-ocr";
import { readWithVlm } from "./vlm-adapter";
import type {
  AdapterAttempt,
  ReadConfidence,
  ReadMethod,
  VerificationResult,
} from "./types";

export type BillReadOutcome = {
  analysis: UtilityBillDocumentAnalysis;
  method: ReadMethod;
  confidence: ReadConfidence;
  verification: VerificationResult;
  /** Raw structured JSON from the VLM, for the operator review screen only. */
  vlmStructuredJson?: string;
  /** Every adapter attempted, with skip/failure reasons — the audit trail. */
  attempts: Array<{ method: ReadMethod; outcome: string }>;
};

function mapConfidence(analysis: UtilityBillDocumentAnalysis): ReadConfidence {
  if (analysis.confidence === "high") return "high";
  if (analysis.confidence === "medium") return "medium";
  return "low";
}

/** The existing verifier's verdict, expressed as a reader status. */
export function verifyBillAnalysis(analysis: UtilityBillDocumentAnalysis): VerificationResult {
  if (analysis.status === "analysed" && analysis.reconciled) {
    return {
      status: "verified",
      verifier: "utility-bill-reconciliation",
      reconciled: true,
      reconciliationDifference: analysis.reconciliationDifference,
      notes: ["Charge lines reconcile to the statement total within ±0.2%."],
    };
  }
  if (analysis.status === "analysed") {
    const diff =
      analysis.reconciliationDifference === null
        ? "difference unavailable"
        : `difference R${analysis.reconciliationDifference.toFixed(2)}`;
    return {
      status: "needs_review",
      verifier: "utility-bill-reconciliation",
      reconciled: false,
      reconciliationDifference: analysis.reconciliationDifference,
      notes: [
        `Machine extraction produced fields but failed the ±0.2% reconciliation (${diff}). A human reviews WITH the machine output attached.`,
        ...analysis.warnings,
      ],
    };
  }
  return {
    status: "needs_human",
    verifier: "utility-bill-reconciliation",
    reconciled: false,
    reconciliationDifference: null,
    notes: [
      "No machine reading passed the deterministic parser. Routed to the operator desk.",
      ...analysis.warnings,
    ],
  };
}

export type ReadBillOptions = {
  /** Original PDF bytes; required for the OCR/vision chain on scans. */
  bytes?: Uint8Array;
  sourceHash?: string;
  analysedAt?: string;
  pageCount?: number | null;
};

/**
 * Read one bill document. `text` is the pdf-parse text layer (may be empty
 * for scans/photos).
 */
export async function readBill(
  text: string,
  fileName: string,
  options: ReadBillOptions = {},
): Promise<BillReadOutcome> {
  const attempts: BillReadOutcome["attempts"] = [];
  const parseOptions = {
    fileName,
    sourceHash: options.sourceHash,
    analysedAt: options.analysedAt,
    pageCount: options.pageCount ?? null,
  };

  // 1. Existing born-digital path.
  const textLayerAnalysis = analyseUtilityBillText(text ?? "", parseOptions);
  attempts.push({
    method: "text-layer",
    outcome: `status=${textLayerAnalysis.status} reconciled=${textLayerAnalysis.reconciled}`,
  });
  if (textLayerAnalysis.status === "analysed") {
    return {
      analysis: textLayerAnalysis,
      method: "text-layer",
      confidence: mapConfidence(textLayerAnalysis),
      verification: verifyBillAnalysis(textLayerAnalysis),
      attempts,
    };
  }

  // 2./3. OCR adapter chain for scans and photos.
  if (options.bytes && options.bytes.byteLength > 0) {
    const chain: Array<() => Promise<AdapterAttempt>> = [
      () => readWithVlm(options.bytes as Uint8Array),
      () => readWithLocalOcr(options.bytes as Uint8Array),
    ];
    for (const step of chain) {
      const attempt = await step();
      if (!attempt.ok) {
        attempts.push({
          method: attempt.method,
          outcome: `${attempt.skipped ? "skipped" : "failed"}: ${attempt.reason}`,
        });
        continue;
      }
      // The machine transcript goes through the SAME deterministic parser.
      const machineAnalysis = analyseUtilityBillText(attempt.text, parseOptions);
      attempts.push({
        method: attempt.method,
        outcome: `status=${machineAnalysis.status} reconciled=${machineAnalysis.reconciled}`,
      });
      if (machineAnalysis.status === "analysed") {
        const annotated: UtilityBillDocumentAnalysis = {
          ...machineAnalysis,
          warnings: [
            `Read by ${attempt.method === "vlm" ? "a hosted vision model" : "local OCR"}; accepted only because the deterministic reconciliation verdict below holds.`,
            ...machineAnalysis.warnings,
          ],
        };
        return {
          analysis: annotated,
          method: attempt.method,
          confidence: mapConfidence(annotated),
          verification: verifyBillAnalysis(annotated),
          vlmStructuredJson: attempt.structuredJson,
          attempts,
        };
      }
      // Machine read something but the parser rejected it: keep going down
      // the chain; a later adapter (or the operator) may do better.
    }
  } else {
    attempts.push({ method: "vlm", outcome: "skipped: no original bytes supplied (text-only read)." });
    attempts.push({ method: "local-ocr", outcome: "skipped: no original bytes supplied (text-only read)." });
  }

  // 4. Operator desk — the human is now the exception handler, explicitly.
  const fallback: UtilityBillDocumentAnalysis = {
    ...textLayerAnalysis,
    warnings: [
      "needs_human: no machine reader could produce a parseable statement (" +
        attempts.map((a) => `${a.method}: ${a.outcome}`).join(" | ") +
        "). Held for the operator desk.",
      ...textLayerAnalysis.warnings,
    ],
  };
  return {
    analysis: fallback,
    method: "none",
    confidence: "low",
    verification: verifyBillAnalysis(fallback),
    attempts,
  };
}

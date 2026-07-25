import { classifyDocumentTitle } from "@/lib/document-taxonomy";
import { downloadPrivateObject } from "@/lib/server-json-store";
import {
  BILL_ANALYSIS_VERSION,
  aggregateUtilityBills,
  canonicaliseUtilityBillAnalyses,
  isUtilityBillDocumentAnalysis,
  type BillPortfolio,
  type UtilityBillDocumentAnalysis,
} from "@/lib/utility-bill-analysis";
import { analyseUtilityBillFile } from "@/lib/utility-bill-pdf";
import { currentiseEskomBill } from "@/lib/eskom-tariff-currentisation";

const DOCUMENT_BUCKET = "oneos-client-documents";

export type StoredBillDocument = {
  id: string;
  title: string;
  fileType: string | null;
  storagePath: string | null;
  fileName: string | null;
  contentType: string | null;
  utilityBillAnalysis: unknown;
};

function analysisIsCurrent(value: unknown): value is UtilityBillDocumentAnalysis {
  return isUtilityBillDocumentAnalysis(value) && value.version === BILL_ANALYSIS_VERSION;
}

async function analyseStoredDocument(document: StoredBillDocument) {
  if (analysisIsCurrent(document.utilityBillAnalysis)) {
    return document.utilityBillAnalysis;
  }
  if (!document.storagePath) return null;

  const blob = await downloadPrivateObject(DOCUMENT_BUCKET, document.storagePath);
  if (!blob) return null;
  return analyseUtilityBillFile({
    name: document.fileName || `${document.id}.${document.fileType?.toLowerCase() || "pdf"}`,
    type: document.contentType || blob.type || "application/octet-stream",
    arrayBuffer: () => blob.arrayBuffer(),
  });
}

/**
 * Builds a portfolio from both newly analysed document payloads and legacy
 * stored files. Lazy extraction makes the feature work for existing clients
 * without requiring them to re-upload their bill pack.
 */
export async function buildStoredBillPortfolio(
  documents: ReadonlyArray<StoredBillDocument>,
): Promise<{ portfolio: BillPortfolio; analysesByDocumentId: Map<string, UtilityBillDocumentAnalysis> }> {
  const utilityBills = documents.filter((document) => classifyDocumentTitle(document.title) === "utility_bills");
  const results = await Promise.all(
    utilityBills.map(async (document) => ({
      document,
      analysis: await analyseStoredDocument(document).catch(() => null),
    })),
  );
  const analysesByDocumentId = new Map<string, UtilityBillDocumentAnalysis>();
  for (const result of results) {
    if (result.analysis) analysesByDocumentId.set(result.document.id, result.analysis);
  }
  const analyses = [...analysesByDocumentId.values()];
  const canonicalAnalyses = canonicaliseUtilityBillAnalyses(analyses);
  const currentisedBills = canonicalAnalyses.map((analysis) => ({
    sourceHash: analysis.sourceHash,
    ...currentiseEskomBill(analysis),
  }));
  return {
    portfolio: aggregateUtilityBills(analyses, undefined, { currentisedBills }),
    analysesByDocumentId,
  };
}

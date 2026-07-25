import {
  analyseUtilityBillText,
  type UtilityBillDocumentAnalysis,
} from "@/lib/utility-bill-analysis";
import { createPdfParser } from "@/lib/pdf-parse-runtime";

export type UtilityBillFileLike = {
  name: string;
  type?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export async function analyseUtilityBillFile(
  file: UtilityBillFileLike,
  options: { sourceHash?: string; analysedAt?: string } = {},
): Promise<UtilityBillDocumentAnalysis> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = file.type?.toLowerCase() ?? "";
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (extension === "txt" || contentType.startsWith("text/plain")) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return analyseUtilityBillText(text, {
      fileName: file.name,
      sourceHash: options.sourceHash,
      analysedAt: options.analysedAt,
      pageCount: null,
    });
  }

  if (extension !== "pdf" && contentType !== "application/pdf") {
    return analyseUtilityBillText("", {
      fileName: file.name,
      sourceHash: options.sourceHash,
      analysedAt: options.analysedAt,
      pageCount: null,
    });
  }

  const parser = await createPdfParser(bytes);
  try {
    const result = await parser.getText();
    return analyseUtilityBillText(result.text, {
      fileName: file.name,
      sourceHash: options.sourceHash,
      analysedAt: options.analysedAt,
      pageCount: result.total,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF extraction failed.";
    const analysis = analyseUtilityBillText("", {
      fileName: file.name,
      sourceHash: options.sourceHash,
      analysedAt: options.analysedAt,
      pageCount: null,
    });
    return {
      ...analysis,
      status: "failed",
      warnings: [
        `The PDF could not be read automatically (${message}). Foundation-1 must review it manually.`,
      ],
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

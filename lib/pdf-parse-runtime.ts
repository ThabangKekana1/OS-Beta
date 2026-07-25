import type { PDFParse as PDFParseInstance } from "pdf-parse";

/**
 * pdf.js expects browser geometry globals even in Node. Install the native
 * canvas equivalents before loading pdf-parse, and defer that heavy module
 * until a PDF extraction route actually needs it.
 */
export async function createPdfParser(data: Uint8Array): Promise<PDFParseInstance> {
  const canvas = await import("@napi-rs/canvas");
  const globals = globalThis as unknown as Record<string, unknown>;

  globals.DOMMatrix ??= canvas.DOMMatrix;
  globals.DOMPoint ??= canvas.DOMPoint;
  globals.Path2D ??= canvas.Path2D;
  globals.ImageData ??= canvas.ImageData;

  const { PDFParse } = await import("pdf-parse");
  return new PDFParse({ data });
}

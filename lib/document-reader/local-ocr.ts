/**
 * Local OCR fallback — VALIDATION ONLY, never a production dependency.
 *
 * Uses a locally installed `tesseract` CLI when present, so the OCR→
 * deterministic-verifier loop can be exercised end-to-end on dev machines
 * before a hosted VLM key is funded. Gated twice:
 *   1. DOCUMENT_READER_LOCAL_OCR=1 must be set (off by default), and
 *   2. a `tesseract` binary must exist on PATH.
 *
 * KNOWN GAP (documented per build brief): tesseract is NOT installed on the
 * current workstation and is not added as a dependency. When absent this
 * adapter reports `skipped` and the chain falls through to the operator
 * desk (`needs_human`) — exactly the current behaviour, now explicit.
 * Accuracy note: plain OCR on office-scanner bill packs is expected to be
 * materially worse than a hosted VLM; its output still faces the same
 * ±0.2% reconciliation, so a bad read is rejected, not trusted.
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { createPdfParser } from "@/lib/pdf-parse-runtime";
import type { AdapterAttempt } from "./types";

const execFileAsync = promisify(execFile);

const MAX_OCR_PAGES = 24;

export function isLocalOcrEnabled(): boolean {
  return process.env.DOCUMENT_READER_LOCAL_OCR === "1" && process.env.NODE_ENV !== "production";
}

async function tesseractAvailable(): Promise<boolean> {
  try {
    await execFileAsync("tesseract", ["--version"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

export async function readWithLocalOcr(bytes: Uint8Array): Promise<AdapterAttempt> {
  if (!isLocalOcrEnabled()) {
    return {
      ok: false,
      method: "local-ocr",
      skipped: true,
      reason: "Local OCR disabled (set DOCUMENT_READER_LOCAL_OCR=1 in dev to enable).",
    };
  }
  if (!(await tesseractAvailable())) {
    return {
      ok: false,
      method: "local-ocr",
      skipped: true,
      reason: "tesseract binary not found on PATH (known gap: not installed on this workstation).",
    };
  }

  let workDir: string | null = null;
  // pdf.js detaches the buffer it is given — always render from a copy.
  const parser = await createPdfParser(Uint8Array.from(bytes));
  try {
    const shot = await parser.getScreenshot({
      first: MAX_OCR_PAGES,
      scale: 2.5,
      imageBuffer: true,
      imageDataUrl: false,
    });
    if (shot.pages.length === 0) {
      return { ok: false, method: "local-ocr", skipped: false, reason: "No pages rendered." };
    }
    workDir = await mkdtemp(join(tmpdir(), "f1-document-reader-"));
    const pageTexts: string[] = [];
    for (const page of shot.pages) {
      const pngPath = join(workDir, `page-${page.pageNumber}.png`);
      await writeFile(pngPath, Buffer.from(page.data));
      const { stdout } = await execFileAsync(
        "tesseract",
        [pngPath, "stdout", "--psm", "6"],
        { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
      );
      pageTexts.push(stdout);
    }
    return { ok: true, method: "local-ocr", text: pageTexts.join("\n\n") };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OCR failure.";
    return { ok: false, method: "local-ocr", skipped: false, reason: message };
  } finally {
    await parser.destroy().catch(() => undefined);
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

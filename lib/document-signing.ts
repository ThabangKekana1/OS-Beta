import { createHash } from "node:crypto";
import { jsPDF } from "jspdf";
import { sanitizeFileSegment } from "@/lib/download-utils";
import { createPdfParser } from "@/lib/pdf-parse-runtime";

/**
 * In-platform signing of stored case PDFs (formal partner proposals, Green
 * Share term sheets, other funder documents issued to a client's case).
 *
 * The flow mirrors the EOI signing rails: a typed-adoption signature (the
 * client adopts their typed full name and initials as their mark, exactly as
 * the EOI and NDA certificates do), an immutable signed rendition stored
 * alongside the untouched original, SHA-256 hashes of both versions, and an
 * audit row extending the migration-case pipeline
 * (`migration_case_document_signatures`).
 *
 * The signed rendition is a certified page-image rendition: every source page
 * is rendered server-side (pdf-parse / pdf.js — the same rendering rail the
 * document reader uses), the client's initials are stamped bottom-right of
 * every page, the adopted signature is stamped onto the final page, and a
 * signature certificate page is appended carrying the full audit trail.
 */

export const DOCUMENT_SIGNING_VERSION = "doc-sign-2026-08-15.1";
export const DOCUMENT_SIGNATURES_TABLE = "migration_case_document_signatures";
export const MAX_SIGNABLE_PAGES = 80;

export const SIGNABLE_DOCUMENT_KINDS = ["partner_proposal", "term_sheet", "case_document"] as const;
export type SignableDocumentKind = (typeof SIGNABLE_DOCUMENT_KINDS)[number];

export type DocumentSignatureStatus = "awaiting_signature" | "signed" | "submitted_by_client";

/** One per-page initialling acknowledgement, timestamped when the client confirmed the page. */
export type PageInitialRecord = { page: number; initialedAt: string };

export type DocumentSignatureRow = {
  id: string;
  case_id: string;
  created_at: string;
  updated_at: string;
  document_kind: SignableDocumentKind;
  document_ref: string | null;
  document_title: string;
  source_storage_path: string;
  source_sha256: string;
  page_count: number | null;
  status: DocumentSignatureStatus;
  signer_name: string | null;
  signer_position: string | null;
  signer_initials: string | null;
  signer_ip: string | null;
  page_initials: PageInitialRecord[];
  signed_at: string | null;
  signed_storage_path: string | null;
  signed_sha256: string | null;
  signed_file_size_bytes: number | null;
  submitted_at: string | null;
  signing_version: string;
};

/* ------------------------------------------------------------------ */
/* Pure helpers (unit-testable without storage or rendering).          */
/* ------------------------------------------------------------------ */

export function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** "Karman Kekana" → "KK". Falls back to the first two letters of a single name. */
export function deriveInitials(name: string) {
  const parts = name
    .trim()
    .split(/[\s.\-]+/)
    .map((part) => part.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts
    .slice(0, 4)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function isValidInitials(value: string) {
  return /^[\p{L}]{1,4}$/u.test(value.trim());
}

/**
 * Every page 1..pageCount must be initialled exactly once with a plausible
 * timestamp. Returns the records sorted by page; throws a descriptive error
 * otherwise so routes can surface it directly.
 */
export function normalisePageInitials(pageCount: number, records: PageInitialRecord[]) {
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    throw new Error("The document has no pages to initial.");
  }
  const seen = new Map<number, PageInitialRecord>();
  for (const record of records) {
    const page = Number(record?.page);
    if (!Number.isInteger(page) || page < 1 || page > pageCount) {
      throw new Error(`Page initial refers to a page outside the document (page ${String(record?.page)}).`);
    }
    if (seen.has(page)) throw new Error(`Page ${page} is initialled more than once.`);
    const at = new Date(record.initialedAt ?? "");
    if (Number.isNaN(at.getTime())) throw new Error(`Page ${page} has an invalid initialling timestamp.`);
    seen.set(page, { page, initialedAt: at.toISOString() });
  }
  const missing: number[] = [];
  for (let page = 1; page <= pageCount; page += 1) {
    if (!seen.has(page)) missing.push(page);
  }
  if (missing.length) {
    throw new Error(`Every page must be initialled before signing. Missing: page ${missing.join(", page ")}.`);
  }
  return [...seen.values()].sort((a, b) => a.page - b.page);
}

/**
 * The only legal transition out of `signed`: the client's explicit PROCEED.
 * Pure so the state machine is testable without a database.
 */
export function proceedTransition(
  row: Pick<DocumentSignatureRow, "status" | "signed_at">,
  submittedAt = new Date().toISOString(),
) {
  if (row.status === "submitted_by_client") {
    throw new Error("This signed document has already been submitted.");
  }
  if (row.status !== "signed" || !row.signed_at) {
    throw new Error("Sign the document (initials on every page plus the signature block) before proceeding.");
  }
  return { status: "submitted_by_client" as const, submitted_at: submittedAt };
}

export function documentSignatureStatusLabel(status: DocumentSignatureStatus) {
  if (status === "submitted_by_client") return "Client submitted";
  if (status === "signed") return "Signed — awaiting client submission";
  return "Awaiting signature";
}

export function signedDocumentFilename(companyName: string, caseReference: string) {
  const company = sanitizeFileSegment(companyName) || "client";
  return `foundation-1-signed-${company}-${caseReference.toLowerCase()}.pdf`;
}

/* ------------------------------------------------------------------ */
/* Server-side page rendering (reuses the document-reader rail).       */
/* ------------------------------------------------------------------ */

export type RenderedPdfPage = {
  pageNumber: number;
  width: number;
  height: number;
  png: Uint8Array;
  dataUrl: string | null;
};

export async function renderPdfPages(
  bytes: Uint8Array,
  options: { scale?: number; withDataUrl?: boolean; maxPages?: number } = {},
): Promise<RenderedPdfPage[]> {
  const { scale = 2, withDataUrl = false, maxPages = MAX_SIGNABLE_PAGES } = options;
  // pdf.js detaches the buffer it is given — always render from a copy.
  const parser = await createPdfParser(Uint8Array.from(bytes));
  try {
    const shot = await parser.getScreenshot({
      first: maxPages,
      scale,
      imageBuffer: true,
      imageDataUrl: withDataUrl,
    });
    return shot.pages.map((page) => ({
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
      png: page.data,
      dataUrl: withDataUrl ? page.dataUrl ?? null : null,
    }));
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* Signed-rendition PDF assembly (jsPDF, as every other certificate).  */
/* ------------------------------------------------------------------ */

export type SignedDocumentInput = {
  pages: RenderedPdfPage[];
  caseReference: string;
  companyName: string;
  documentTitle: string;
  documentKind: SignableDocumentKind;
  sourceSha256: string;
  signatureId: string;
  signerName: string;
  signerPosition: string;
  signerInitials: string;
  signedAt: string;
  signerIp?: string | null;
  pageInitials: PageInitialRecord[];
};

const PAGE_W = 210;
const PAGE_H = 297;

function shortStamp(iso: string) {
  return new Date(iso).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Builds the immutable signed rendition: source pages as full-page images,
 * initials bottom-right of every page, the adopted signature on the final
 * source page, then an appended signature-certificate page.
 */
export function buildSignedDocumentPdf(input: SignedDocumentInput) {
  if (!input.pages.length) throw new Error("The document rendered no pages, so it cannot be signed.");
  const pageInitials = normalisePageInitials(input.pages.length, input.pageInitials);
  const initialsByPage = new Map(pageInitials.map((record) => [record.page, record]));

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  pdf.setProperties({
    title: `${input.documentTitle} — signed by ${input.companyName}`,
    subject: `In-platform signed rendition · ${input.caseReference}`,
    author: input.companyName,
    creator: "Foundation-1 1-MI Digital Signature",
  });

  input.pages.forEach((page, index) => {
    if (index > 0) pdf.addPage("a4", "portrait");
    const isLast = index === input.pages.length - 1;

    // Fit the rendered page image onto A4, preserving aspect, top-centred.
    const aspect = page.height > 0 ? page.width / page.height : PAGE_W / PAGE_H;
    let drawW = PAGE_W;
    let drawH = drawW / aspect;
    if (drawH > PAGE_H) {
      drawH = PAGE_H;
      drawW = drawH * aspect;
    }
    const offsetX = (PAGE_W - drawW) / 2;
    pdf.addImage(page.png, "PNG", offsetX, 0, drawW, drawH, undefined, "FAST");

    // Initials stamp — bottom-right of EVERY page.
    const initialRecord = initialsByPage.get(page.pageNumber ?? index + 1) ?? pageInitials[index];
    const stampW = 34;
    const stampH = 13;
    const stampX = PAGE_W - stampW - 6;
    const stampY = PAGE_H - stampH - 6;
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(180, 195, 186);
    pdf.roundedRect(stampX, stampY, stampW, stampH, 1.6, 1.6, "FD");
    pdf.setFont("times", "italic");
    pdf.setFontSize(11);
    pdf.setTextColor(24, 36, 30);
    pdf.text(input.signerInitials, stampX + 3, stampY + 6.4);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(4.6);
    pdf.setTextColor(96, 108, 101);
    pdf.text(`Initialled page ${index + 1} of ${input.pages.length}`, stampX + 3, stampY + 9.4);
    pdf.text(shortStamp(initialRecord.initialedAt), stampX + 3, stampY + 11.6);

    // Signature block — final source page only.
    if (isLast) {
      const sigW = 92;
      const sigH = 26;
      const sigX = 8;
      const sigY = PAGE_H - sigH - 6;
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(120, 132, 125);
      pdf.roundedRect(sigX, sigY, sigW, sigH, 1.6, 1.6, "FD");
      pdf.setFont("times", "italic");
      pdf.setFontSize(15);
      pdf.setTextColor(24, 36, 30);
      pdf.text(input.signerName, sigX + 4, sigY + 9.5);
      pdf.setDrawColor(150, 162, 155);
      pdf.line(sigX + 4, sigY + 12, sigX + sigW - 24, sigY + 12);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(5.4);
      pdf.setTextColor(84, 98, 90);
      pdf.text(
        [
          `Signed by ${input.signerName} · ${input.signerPosition}`,
          `${shortStamp(input.signedAt)} · signature ${input.signatureId.slice(0, 8)}`,
          "Signature adopted in the Foundation-1 client platform.",
        ],
        sigX + 4,
        sigY + 15.6,
        { lineHeightFactor: 1.45 },
      );
    }
  });

  // Signature certificate page: the immutable audit trail.
  pdf.addPage("a4", "portrait");
  pdf.setFillColor(4, 12, 8);
  pdf.rect(0, 0, PAGE_W, 42, "F");
  pdf.setTextColor(185, 255, 145);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("FOUNDATION-1 / DIGITAL AGREEMENTS", 18, 16);
  pdf.setTextColor(245, 248, 246);
  pdf.setFontSize(20);
  pdf.text("Signature Certificate", 18, 29);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(182, 195, 187);
  pdf.text(`${input.documentTitle} · Case ${input.caseReference}`, 18, 37);

  let y = 56;
  const row = (label: string, value: string) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(35, 120, 82);
    pdf.text(label.toUpperCase(), 18, y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.6);
    pdf.setTextColor(24, 36, 30);
    const lines = pdf.splitTextToSize(value, 128) as string[];
    pdf.text(lines, 62, y);
    y += Math.max(7, lines.length * 4.6 + 2.4);
  };

  row("Signer", `${input.signerName} (${input.signerPosition})`);
  row("Company", input.companyName);
  row("Adopted initials", input.signerInitials);
  row("Signed at", shortStamp(input.signedAt));
  row("Signature record", input.signatureId);
  row("Document kind", input.documentKind.replace(/_/g, " "));
  row("Source document SHA-256", input.sourceSha256);
  if (input.signerIp) row("Client IP", input.signerIp);
  row("Signing engine", DOCUMENT_SIGNING_VERSION);

  y += 4;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(35, 120, 82);
  pdf.text("PER-PAGE INITIALLING RECORD", 18, y);
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.6);
  for (const record of pageInitials) {
    if (y > 276) {
      pdf.addPage("a4", "portrait");
      y = 24;
    }
    pdf.setTextColor(24, 36, 30);
    pdf.text(`Page ${record.page}`, 18, y);
    pdf.setTextColor(84, 98, 90);
    pdf.text(`initialled ${input.signerInitials} · ${shortStamp(record.initialedAt)}`, 44, y);
    y += 5.2;
  }

  pdf.setDrawColor(215, 225, 219);
  pdf.line(18, 282, 192, 282);
  pdf.setFontSize(6.2);
  pdf.setTextColor(101, 115, 107);
  pdf.text(
    "Foundation-1 (Pty) Ltd · signed rendition of the issued document; the untouched original is retained alongside this file.",
    18,
    287,
  );
  pdf.text(input.caseReference, 192, 287, { align: "right" });

  return {
    bytes: new Uint8Array(pdf.output("arraybuffer")),
    filename: signedDocumentFilename(input.companyName, input.caseReference),
    pageCount: input.pages.length,
  };
}

export type SignDocumentPdfInput = Omit<SignedDocumentInput, "pages" | "sourceSha256"> & {
  sourceBytes: Uint8Array;
};

/**
 * Full pipeline: hash the source, render its pages, build the signed
 * rendition and hash that too. Storage and persistence stay in the routes so
 * this is testable end-to-end without Supabase.
 */
export async function signDocumentPdf(input: SignDocumentPdfInput) {
  const { sourceBytes, ...rest } = input;
  const sourceSha256 = sha256Hex(sourceBytes);
  const pages = await renderPdfPages(sourceBytes, { scale: 2 });
  const built = buildSignedDocumentPdf({ ...rest, pages, sourceSha256 });
  return {
    ...built,
    sourceSha256,
    signedSha256: sha256Hex(built.bytes),
  };
}

// In-platform document signing: initials on EVERY page, adopted signature on
// the final page, appended signature certificate, SHA-256 of source and
// signed renditions, and the signed → submitted_by_client transition.
// Run: cd 1OS && node --test tests/document-signing.test.mjs
import "./register-hooks.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { jsPDF } from "jspdf";
import {
  deriveInitials,
  DOCUMENT_SIGNING_VERSION,
  documentSignatureStatusLabel,
  isValidInitials,
  normalisePageInitials,
  proceedTransition,
  renderPdfPages,
  sha256Hex,
  signDocumentPdf,
  signedDocumentFilename,
} from "../lib/document-signing.ts";
import { createPdfParser } from "../lib/pdf-parse-runtime.ts";

/** A synthetic three-page "funder proposal" like the operator would issue. */
function buildSourcePdf(pageCount = 3) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  for (let page = 1; page <= pageCount; page += 1) {
    if (page > 1) pdf.addPage("a4", "portrait");
    pdf.setFontSize(18);
    pdf.text(`Formal UFMS Proposal — page ${page}`, 20, 30);
    pdf.setFontSize(10);
    pdf.text("Zero-capex solar and storage under the utility fee for managed services.", 20, 45);
    if (page === pageCount) pdf.text("Signature: ______________________", 20, 240);
  }
  return new Uint8Array(pdf.output("arraybuffer"));
}

function pageInitialsFor(pageCount, base = "2026-08-15T10:0") {
  return Array.from({ length: pageCount }, (_, index) => ({
    page: index + 1,
    initialedAt: `${base}${index}:00.000Z`,
  }));
}

const SIGNER = {
  caseReference: "F1-MC-TEST01",
  companyName: "Sams Liquor (Pty) Ltd",
  documentTitle: "Formal pathway proposal",
  documentKind: "partner_proposal",
  signatureId: "0f8fad5b-d9cb-469f-a165-70867728950e",
  signerName: "Karman Kekana",
  signerPosition: "Director",
  signerInitials: "KK",
  signedAt: "2026-08-15T10:05:00.000Z",
  signerIp: "196.25.1.1",
};

async function extractText(bytes) {
  const parser = await createPdfParser(Uint8Array.from(bytes));
  try {
    const result = await parser.getText();
    return { total: result.total, pages: result.pages.map((page) => page.text), text: result.text };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

test("signing a 3-page document stamps initials on every page, the signature on the last page and appends a certificate", { timeout: 120_000 }, async () => {
  const source = buildSourcePdf(3);
  const signed = await signDocumentPdf({
    ...SIGNER,
    sourceBytes: source,
    pageInitials: pageInitialsFor(3),
  });

  assert.equal(signed.pageCount, 3);
  assert.equal(signed.sourceSha256, sha256Hex(source));
  assert.equal(signed.signedSha256, sha256Hex(signed.bytes));
  assert.notEqual(signed.signedSha256, signed.sourceSha256);
  assert.match(signed.sourceSha256, /^[0-9a-f]{64}$/);
  assert.match(signed.signedSha256, /^[0-9a-f]{64}$/);
  assert.equal(signed.filename, signedDocumentFilename(SIGNER.companyName, SIGNER.caseReference));

  const extracted = await extractText(signed.bytes);
  // 3 source pages + 1 certificate page.
  assert.equal(extracted.total, 4);
  // One initials stamp per source page, none on the certificate page.
  const stamps = extracted.text.match(/Initialled page \d+ of 3/g) ?? [];
  assert.equal(stamps.length, 3);
  for (let page = 0; page < 3; page += 1) {
    assert.match(extracted.pages[page], new RegExp(`Initialled page ${page + 1} of 3`));
    assert.match(extracted.pages[page], /KK/);
  }
  // The adopted signature sits on the final source page only.
  assert.match(extracted.pages[2], /Signed by Karman Kekana · Director/);
  assert.doesNotMatch(extracted.pages[0], /Signed by Karman Kekana/);
  assert.doesNotMatch(extracted.pages[1], /Signed by Karman Kekana/);
  // The certificate page carries the audit trail: identity, source hash, IP,
  // engine version and the per-page initialling record.
  const certificate = extracted.pages[3];
  assert.match(certificate, /Signature Certificate/);
  assert.match(certificate, /Karman Kekana \(Director\)/);
  assert.match(certificate, new RegExp(signed.sourceSha256.slice(0, 32)));
  assert.match(certificate, /196\.25\.1\.1/);
  assert.match(certificate, new RegExp(DOCUMENT_SIGNING_VERSION.replace(/\./g, "\\.")));
  assert.match(certificate, /PER-PAGE INITIALLING RECORD/);
  assert.match(certificate, /Page 1/);
  assert.match(certificate, /Page 3/);
});

test("renderPdfPages renders one image per source page", { timeout: 120_000 }, async () => {
  const source = buildSourcePdf(2);
  const pages = await renderPdfPages(source, { scale: 1.2, withDataUrl: true });
  assert.equal(pages.length, 2);
  for (const page of pages) {
    assert.ok(page.png.byteLength > 500, "rendered page should be a real PNG");
    assert.match(page.dataUrl ?? "", /^data:image\/png;base64,/);
    assert.ok(page.width > 0 && page.height > 0);
  }
});

test("signing refuses incomplete, duplicated or out-of-range page initials", async () => {
  const source = buildSourcePdf(2);
  await assert.rejects(
    signDocumentPdf({ ...SIGNER, sourceBytes: source, pageInitials: pageInitialsFor(1) }),
    /Missing: page 2/,
  );
  assert.throws(
    () => normalisePageInitials(2, [
      { page: 1, initialedAt: "2026-08-15T10:00:00.000Z" },
      { page: 1, initialedAt: "2026-08-15T10:01:00.000Z" },
    ]),
    /initialled more than once/,
  );
  assert.throws(
    () => normalisePageInitials(2, pageInitialsFor(3)),
    /outside the document/,
  );
  assert.throws(
    () => normalisePageInitials(1, [{ page: 1, initialedAt: "not-a-date" }]),
    /invalid initialling timestamp/,
  );
  // Order does not matter; records come back sorted by page.
  const normalised = normalisePageInitials(3, [...pageInitialsFor(3)].reverse());
  assert.deepEqual(normalised.map((record) => record.page), [1, 2, 3]);
});

test("PROCEED transitions signed → submitted_by_client and nothing else", () => {
  const submitted = proceedTransition(
    { status: "signed", signed_at: "2026-08-15T10:05:00.000Z" },
    "2026-08-15T10:10:00.000Z",
  );
  assert.equal(submitted.status, "submitted_by_client");
  assert.equal(submitted.submitted_at, "2026-08-15T10:10:00.000Z");

  assert.throws(
    () => proceedTransition({ status: "awaiting_signature", signed_at: null }),
    /Sign the document/,
  );
  assert.throws(
    () => proceedTransition({ status: "submitted_by_client", signed_at: "2026-08-15T10:05:00.000Z" }),
    /already been submitted/,
  );

  assert.equal(documentSignatureStatusLabel("awaiting_signature"), "Awaiting signature");
  assert.equal(documentSignatureStatusLabel("signed"), "Signed — awaiting client submission");
  assert.equal(documentSignatureStatusLabel("submitted_by_client"), "Client submitted");
});

test("typed adoption helpers derive sane initials", () => {
  assert.equal(deriveInitials("Karman Kekana"), "KK");
  assert.equal(deriveInitials("jan-hendrik van der Merwe"), "JHVD");
  assert.equal(deriveInitials("Cher"), "CH");
  assert.equal(deriveInitials("  "), "");
  assert.ok(isValidInitials("KK"));
  assert.ok(isValidInitials("jvdm".toUpperCase()));
  assert.ok(!isValidInitials("K2"));
  assert.ok(!isValidInitials(""));
  assert.ok(!isValidInitials("ABCDE"));
});

test("the document-signing migration is additive and self-contained", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20260815120000_migration_case_document_signing.sql"),
    "utf8",
  );
  assert.match(sql, /create table if not exists public\.migration_case_document_signatures/);
  assert.match(sql, /'awaiting_signature', 'signed', 'submitted_by_client'/);
  assert.match(sql, /source_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(sql, /enable row level security/);
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /alter table public\.migration_cases\b[^;]*drop column/i);
});

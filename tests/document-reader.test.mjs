// Corpus test: the document reader over EVERY onboarding extract in
// `_extract/text/` (the real text layers of real client documents).
// Run: cd 1OS && node --test tests/document-reader.test.mjs
import "./register-hooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const { readDocumentText, readDocument, classifyDocumentText, isDocumentReaderEnabled } =
  await import("../lib/document-reader/index.ts");

const EXTRACT_DIR = join(process.cwd(), "..", "_extract", "text");

/** Load a fixture as the reader would see it at runtime: the raw text layer
 * plus the ORIGINAL upload filename (recovered from the extract header). */
function loadFixture(name) {
  const raw = readFileSync(join(EXTRACT_DIR, name), "utf8");
  const headerMatch = raw.match(/^\[PDF:\s*(.+?)\]\s*$/m);
  const fileName = headerMatch ? basename(headerMatch[1]) : name;
  const pagesMatch = raw.match(/^\[pages=(\d+)/m);
  const pageCount = pagesMatch ? Number(pagesMatch[1]) : null;
  return { text: raw, fileName, pageCount };
}

async function readFixture(name) {
  const { text, fileName, pageCount } = loadFixture(name);
  return readDocumentText(text, fileName, { pageCount, analysedAt: "2026-08-08T00:00:00.000Z" });
}

const ALL = readdirSync(EXTRACT_DIR).filter((f) => f.startsWith("1._Onboarding")).sort();

// ---------------------------------------------------------------------------
// Full-corpus sweep: every onboarding document gets a classification and a
// verification status; the table is the build report's evidence.
// ---------------------------------------------------------------------------
const corpus = new Map();
test("corpus sweep: every onboarding extract classifies and routes", async () => {
  for (const name of ALL) {
    const result = await readFixture(name);
    corpus.set(name, result);
    assert.ok(result.docType, `${name}: no docType`);
    assert.ok(result.verification.status, `${name}: no verification status`);
  }
  // Human-readable outcome table for the build report.
  for (const [name, r] of corpus) {
    console.log(
      [
        r.docType.padEnd(20),
        r.method.padEnd(11),
        r.verification.status.padEnd(13),
        r.confidence.padEnd(7),
        name.replace("1._Onboarding_", "").slice(0, 70),
      ].join(" | "),
    );
  }
});

// ---------------------------------------------------------------------------
// Born-digital Eskom bills → classified utility_bill, parsed, VERIFIED by the
// existing ±0.2% reconciliation.
// ---------------------------------------------------------------------------
const RATANG_INVOICES = ALL.filter((f) => /Ratang.*Eskom_.*_Invoice/.test(f));
const SAMS_BILLS = ALL.filter((f) => /Sams.*ESKOM_BILL/.test(f));
const SEOKAS_BILLS = ALL.filter((f) => /Seokas.*_511\d+\.pdf\.txt$/.test(f));
const PRIMO_BILLS = ALL.filter((f) => /Primo_Poultry_\d/.test(f));

test("Ratang Eskom invoices: 6 found, classified utility_bill, 5 verified + the November cumulative rebill held for review", async () => {
  assert.equal(RATANG_INVOICES.length, 6);
  let verified = 0;
  for (const name of RATANG_INVOICES) {
    const r = corpus.get(name);
    assert.equal(r.docType, "utility_bill", name);
    assert.equal(r.method, "text-layer", name);
    if (/November/.test(name)) {
      // Genuine Eskom cumulative rebill: the single-document verifier holds
      // it (reconciliation fails by design); pack-level canonicalisation
      // resolves it downstream. needs_review carries the diff.
      assert.equal(r.verification.status, "needs_review", name);
      assert.equal(r.verification.reconciled, false, name);
    } else {
      assert.equal(r.verification.status, "verified", name);
      assert.equal(r.verification.reconciled, true, name);
      verified += 1;
    }
  }
  assert.equal(verified, 5);
});

test("Sams Eskom bills: 6 found, 5 verified + the JAN consolidated statement held for review with the diff attached", async () => {
  assert.equal(SAMS_BILLS.length, 6);
  let verified = 0;
  for (const name of SAMS_BILLS) {
    const r = corpus.get(name);
    assert.equal(r.docType, "utility_bill", name);
    if (/JAN_2026/.test(name)) {
      assert.equal(r.verification.status, "needs_review", name);
      assert.equal(r.verification.reconciled, false, name);
    } else {
      assert.equal(r.verification.status, "verified", name);
      verified += 1;
    }
  }
  assert.equal(verified, 5);
});

test("Seokas 511* Eskom bills: all 6 classify and verify", async () => {
  assert.equal(SEOKAS_BILLS.length, 6);
  for (const name of SEOKAS_BILLS) {
    const r = corpus.get(name);
    assert.equal(r.docType, "utility_bill", name);
    assert.equal(r.verification.status, "verified", name);
    assert.equal(r.extraction.reconciled, true, name);
  }
});

test("Primo Ruraflex ToU bills parse; every verified one passed reconciliation", async () => {
  assert.equal(PRIMO_BILLS.length, 12);
  let verified = 0;
  for (const name of PRIMO_BILLS) {
    const r = corpus.get(name);
    assert.equal(r.docType, "utility_bill", name);
    if (r.verification.status === "verified") {
      assert.equal(r.extraction.reconciled, true, name);
      verified += 1;
    } else {
      assert.equal(r.verification.status, "needs_review", name);
    }
  }
  assert.ok(verified >= 11, `expected ≥11 verified Primo bills, got ${verified}`);
});

// ---------------------------------------------------------------------------
// The three zero-text scanned packs → needs_human via the OCR route (the VLM
// adapter reports itself dormant; local OCR is gated off).
// ---------------------------------------------------------------------------
const SCANNED_PACKS = [
  "1._Onboarding_4._MVM_Enterprise_Archie_Mahila_Eskom_Chicken_Houses.pdf.txt",
  "1._Onboarding_9._Team_Plating_Works_Utility_Bills_6_Months.pdf.txt",
  "1._Onboarding_3._Zikhona_Null_SKM_C364e26041509090.pdf.txt",
];

test("scanned bill packs route to needs_human with the OCR chain accounted for", async () => {
  for (const name of SCANNED_PACKS) {
    const r = corpus.get(name);
    assert.equal(r.classification.needsOcr, true, name);
    assert.equal(r.verification.status, "needs_human", name);
    assert.equal(r.method, "none", name);
  }
});

test("a scanned pack read from real PDF bytes walks the adapter chain and lands at the operator desk (VLM dormant)", async () => {
  const pdfPath = join(
    process.cwd(), "..", "1. Onboarding", "4. MVM Enterprise (Archie Mahila)", "Eskom Chicken Houses.pdf",
  );
  const bytes = new Uint8Array(readFileSync(pdfPath));
  const r = await readDocument(bytes, "Eskom Chicken Houses.pdf", { expectedType: "utility_bill" });
  assert.equal(r.verification.status, "needs_human");
  assert.equal(r.method, "none");
  const chain = r.warnings.join(" ");
  assert.match(chain, /vlm: skipped.*dormant until a key is funded/i);
  assert.match(chain, /local-ocr: skipped/i);
});

test("a born-digital bill read from real PDF bytes verifies end-to-end", async () => {
  const pdfPath = join(
    process.cwd(), "..", "1. Onboarding", "6. Ratang Liquor (Null)",
    "Retang Liquor Folder Documents", "Eskom October Invoice.pdf",
  );
  const bytes = new Uint8Array(readFileSync(pdfPath));
  const r = await readDocument(bytes, "Eskom October Invoice.pdf");
  assert.equal(r.docType, "utility_bill");
  assert.equal(r.method, "text-layer");
  assert.equal(r.verification.status, "verified");
  assert.equal(r.extraction.totalChargesExVat, 15_608.79);
  assert.equal(r.extraction.monthlyKwh, 4_504);
});

// ---------------------------------------------------------------------------
// The three returned Nedbank UFMS P4L decks → funder_proposal; text fields
// read; capex RECOVERED from the monthly charge (the money tables are
// images); cracked-engine cross-checks pass; escalation trick flagged.
// ---------------------------------------------------------------------------
const DECKS = [
  {
    fixture: "1._Onboarding_6._Ratang_Liquor_Null_UFMS_Proposal_Ratanga_Liquor.pdf.txt",
    kwp: 35, bess: 50, monthly: 15_253, currentTariff: 3.33, solutionTariff: 2.6,
    knownCapex: 955_159, annual: 219_459, forecast: 3_293_132, saving: 484_927,
  },
  {
    fixture: "1._Onboarding_1._Seokas_Bottle_Store_Null_UFMS_P4L_Proposal-Seokas_Bottle_Store.pdf.txt",
    kwp: 75, bess: 100, monthly: 33_301, currentTariff: 2.69, solutionTariff: 2.67,
    knownCapex: 2_085_299, annual: 403_436, forecast: 6_053_839, saving: 603_393,
  },
  {
    fixture: "1._Onboarding_4._MVM_Enterprise_Archie_Mahila_UFMS_P4L_Proposal-MVM_Enterprise.pdf.txt",
    kwp: 300, bess: 300, monthly: 98_471, currentTariff: 2.46, solutionTariff: 2.24,
    knownCapex: 6_166_288, annual: 1_536_433, forecast: 23_055_227, saving: 4_266_054,
  },
];

for (const deck of DECKS) {
  test(`UFMS deck ${deck.kwp} kWp: fields + capex recovery + cross-checks`, async () => {
    const r = corpus.get(deck.fixture);
    assert.equal(r.docType, "funder_proposal");
    const x = r.extraction;
    assert.equal(x.dialect, "ufms-p4l");
    assert.equal(x.pvKwp.value, deck.kwp);
    assert.equal(x.bessKwh.value, deck.bess);
    assert.equal(x.monthlyChargeExVat.value, deck.monthly);
    assert.equal(x.currentBlendedTariff.value, deck.currentTariff);
    assert.equal(x.solutionTariff.value, deck.solutionTariff);
    assert.equal(x.currentAnnualCost.value, deck.annual);
    assert.equal(x.tenYearUtilityForecast.value, deck.forecast);
    assert.equal(x.tenYearSavingClaim.value, deck.saving);
    assert.equal(x.contractEscalationPct.value, 6);
    assert.equal(x.termYears.value, 10);
    assert.equal(x.abortFee.value, 75_000);

    // Capex recovered from the image-only table via monthly ÷ 0.015969,
    // within 0.01% of the forensically known figure.
    const capexDeviation = Math.abs(x.derivedCapex.value / deck.knownCapex - 1);
    assert.ok(capexDeviation < 1e-4, `capex deviation ${capexDeviation}`);

    // All four deterministic cross-checks pass.
    for (const check of x.crosschecks) {
      assert.equal(check.pass, true, `${deck.fixture}: ${check.name} → ${check.actual}`);
    }
    assert.equal(r.verification.status, "verified");

    // The 12%-claim / ×15.006-forecast escalation trick is flagged on every deck.
    assert.ok(
      x.flags.some((f) => f.startsWith("escalation-claim-inconsistent")),
      "escalation trick not flagged",
    );
  });
}

test("the Green Share wheeling proposal is recognised as a second dialect and routed to a human", async () => {
  const r = corpus.get(
    "1._Onboarding_4._MVM_Enterprise_Archie_Mahila_Traditional-Wheeling-MVM_Enterprises.pdf.txt",
  );
  assert.equal(r.docType, "funder_proposal");
  assert.equal(r.extraction.dialect, "wheeling");
  assert.equal(r.verification.status, "needs_human");
});

// ---------------------------------------------------------------------------
// Non-bill documents inside client folders classify positively (audit §d3).
// ---------------------------------------------------------------------------
test("text-bearing EOIs classify as eoi", async () => {
  const eois = ALL.filter((f) => /expression_of_interest|EXPRESSION_OF_INTEREST|EOI/i.test(f));
  const textBearing = eois.filter((f) => corpus.get(f).textLength > 60);
  assert.ok(textBearing.length >= 4);
  for (const name of textBearing) {
    assert.equal(corpus.get(name).docType, "eoi", name);
  }
});

test("bank statements uploaded as bills are caught (Zikhona SBSA + Ratang FNB)", async () => {
  const statements = [
    "1._Onboarding_3._Zikhona_Null_SBSA_Statement_2026-04-15_6months.pdf.txt",
    "1._Onboarding_6._Ratang_Liquor_Null_February_Statement.pdf.txt",
    "1._Onboarding_6._Ratang_Liquor_Null_January_Statement.pdf.txt",
    "1._Onboarding_6._Ratang_Liquor_Null_March_Statement.pdf.txt",
  ];
  for (const name of statements) {
    assert.equal(corpus.get(name).docType, "bank_statement", name);
  }
});

test("SARS VAT registration notice classifies as kyc_vat_certificate", async () => {
  const r = corpus.get("1._Onboarding_6._Ratang_Liquor_Null_retang_vat_reg.pdf.txt");
  assert.equal(r.docType, "kyc_vat_certificate");
});

test("the Khaya Kwa HOA resold-supply statement classifies as a utility bill but is held for a human (no extractor yet)", async () => {
  const r = corpus.get("1._Onboarding_5._Khaya_Kwa_Null_Sune_Meyer_Utility.pdf.txt");
  assert.equal(r.docType, "utility_bill");
  assert.equal(r.verification.status, "needs_human");
});

// ---------------------------------------------------------------------------
// Wiring guards.
// ---------------------------------------------------------------------------
test("the intake gate is off unless DOCUMENT_READER_MODE=1", () => {
  const prior = process.env.DOCUMENT_READER_MODE;
  delete process.env.DOCUMENT_READER_MODE;
  assert.equal(isDocumentReaderEnabled(), false);
  process.env.DOCUMENT_READER_MODE = "1";
  assert.equal(isDocumentReaderEnabled(), true);
  if (prior === undefined) delete process.env.DOCUMENT_READER_MODE;
  else process.env.DOCUMENT_READER_MODE = prior;
});

test("classifier returns unknown + needsOcr for an empty text layer", () => {
  const c = classifyDocumentText("", "photo.jpg");
  assert.equal(c.docType, "unknown");
  assert.equal(c.needsOcr, true);
});

// FUNDER-REPORT PIPELINE test: the 3 real Nedbank deck text extracts (from
// `_extract/text/`, as the document-reader tests already do) + the Ratang /
// Seokas / Primo bill fixtures -> extraction -> cross-check -> ClientSavingsData
// -> PDF bytes, and the combined path never double-counts.
// Run: cd 1OS && node --test tests/funder-report.test.mjs
import "./register-hooks.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const { analyseUtilityBillText, aggregateUtilityBills } = await import("../lib/utility-bill-analysis.ts");
const {
  buildFunderReport,
  deriveBillFactsFromPortfolio,
  parseWheelingProposalText,
  FUNDER_REPORT_TOLERANCE_PCT,
} = await import("../lib/funder-report.ts");
const { buildFunderReportPdf } = await import("../lib/funder-report-pdf.ts");

const EXTRACT_DIR = join(process.cwd(), "..", "_extract", "text");
const AT = "2026-08-09T00:00:00.000Z";

function readExtract(name) {
  return readFileSync(join(EXTRACT_DIR, name), "utf8");
}

/** Bill fixture -> verified bill facts, exactly as production derives them:
 * analyseUtilityBillText per document -> aggregateUtilityBills -> facts. */
function billFacts(pattern) {
  const files = readdirSync(EXTRACT_DIR).filter((f) => pattern.test(f)).sort();
  assert.ok(files.length > 0, `no bill fixtures for ${pattern}`);
  const analyses = files.map((f) =>
    analyseUtilityBillText(readExtract(f), { fileName: f, sourceHash: f, analysedAt: AT }),
  );
  const portfolio = aggregateUtilityBills(analyses, AT);
  return deriveBillFactsFromPortfolio(portfolio);
}

const RATANG_BILLS = /Ratang.*Eskom_.*_Invoice/;
const SEOKAS_BILLS = /Seokas.*_511\d+\.pdf\.txt$/;
const PRIMO_BILLS = /Primo_Poultry_\d/;

const RATANG_DECK = "1._Onboarding_6._Ratang_Liquor_Null_UFMS_Proposal_Ratanga_Liquor.pdf.txt";
const SEOKAS_DECK = "1._Onboarding_1._Seokas_Bottle_Store_Null_UFMS_P4L_Proposal-Seokas_Bottle_Store.pdf.txt";
const MVM_DECK = "1._Onboarding_4._MVM_Enterprise_Archie_Mahila_UFMS_P4L_Proposal-MVM_Enterprise.pdf.txt";
const MVM_WHEELING = "1._Onboarding_4._MVM_Enterprise_Archie_Mahila_Traditional-Wheeling-MVM_Enterprises.pdf.txt";

// ---------------------------------------------------------------------------
// Bill facts: the deck-schema inputs come straight off the audited bills.
// ---------------------------------------------------------------------------
test("Primo bill facts: TOU rows, meter charges and connection charges from the bill waterfall", () => {
  const facts = billFacts(PRIMO_BILLS);
  assert.equal(facts.tariffStructure, "time-of-use");
  assert.ok(facts.monthlyKwh > 20_000 && facts.monthlyKwh < 30_000, `kwh ${facts.monthlyKwh}`);
  assert.ok(facts.monthlySpendExVat > 60_000 && facts.monthlySpendExVat < 90_000);
  // TOU rows populated with kwh, spend and an effective rate each.
  for (const bucket of ["peak", "standard", "offpeak"]) {
    assert.ok(facts.tou[bucket].kwh > 0, `${bucket} kwh`);
    assert.ok(facts.tou[bucket].spend > 0, `${bucket} spend`);
    assert.ok(facts.tou[bucket].rate > 0, `${bucket} rate`);
  }
  // Peak units cost more than off-peak units — the TOU story the deck tells.
  assert.ok(facts.tou.peak.rate > facts.tou.offpeak.rate);
  const meterLabels = facts.meterCharges.map((line) => line.label);
  assert.ok(meterLabels.includes("Network demand"), meterLabels.join());
  assert.ok(meterLabels.includes("Legacy"), meterLabels.join());
  const connectionLabels = facts.connectionCharges.map((line) => line.label);
  assert.ok(connectionLabels.includes("Network capacity"), connectionLabels.join());
  // Waterfall reconciles: energy + meter + connection ~ total bill.
  const total = facts.tou.peak.spend + facts.tou.standard.spend + facts.tou.offpeak.spend
    + facts.meterCharges.reduce((t, l) => t + l.amount, 0)
    + facts.connectionCharges.reduce((t, l) => t + l.amount, 0);
  assert.ok(Math.abs(total / facts.monthlySpendExVat - 1) < 0.02, `waterfall ${total} vs ${facts.monthlySpendExVat}`);
});

test("Ratang bill facts: flat-rate site folds energy into the standard row", () => {
  const facts = billFacts(RATANG_BILLS);
  assert.equal(facts.tariffStructure, "flat");
  assert.equal(facts.tou.peak.kwh, 0);
  assert.ok(facts.tou.standard.kwh > 4_000);
  assert.ok(facts.energyMonthlySpend > 0);
});

// ---------------------------------------------------------------------------
// Wheeling dialect reader (the proposal head routes wheeling to a human by
// design; the report needs its four commercial fields).
// ---------------------------------------------------------------------------
test("Green Share wheeling deck: rate, floor, escalation cap and term read from the paper", () => {
  const fields = parseWheelingProposalText(readExtract(MVM_WHEELING));
  assert.equal(fields.firmRatePerKwh, 1.85);
  assert.equal(fields.floorRatePerKwh, 0.98);
  assert.equal(fields.escalationCapPct, 6);
  assert.equal(fields.termYears, 10);
  assert.equal(fields.supplier, "Green Share");
});

// ---------------------------------------------------------------------------
// Matched deck + bills -> verified extraction, cross-checks pass, READY.
// ---------------------------------------------------------------------------
function ratangReport(overrides = {}) {
  return buildFunderReport({
    caseReference: "F1-TEST-RATANG",
    businessName: "Ratang Liquor (Pty) Ltd",
    siteLocation: "Katlehong, Gauteng",
    billFacts: billFacts(RATANG_BILLS),
    ufms: { text: readExtract(RATANG_DECK), fileName: "UFMS Proposal Ratanga Liquor.pdf" },
    wheeling: { text: readExtract(MVM_WHEELING), fileName: "Traditional-Wheeling.pdf" },
    generatedAt: AT,
    ...overrides,
  });
}

test("Ratang: their deck vs their bills -> extraction verified, cross-checks pass, report READY", () => {
  const report = ratangReport();
  assert.equal(report.ufmsVerification.status, "verified");
  assert.equal(report.status, "ready", report.holdReasons.join(" | "));
  assert.deepEqual(report.holdReasons, []);
  const chargeCheck = report.crosschecks.find((row) => row.field === "monthlyCharge");
  assert.ok(chargeCheck.pass, JSON.stringify(chargeCheck));
  assert.ok(chargeCheck.deviationPct <= FUNDER_REPORT_TOLERANCE_PCT);
  // Founder rule: the client-facing number is THEIR paper's number.
  assert.equal(report.clientSavingsData.ufms.monthlyCharge, 15_253);
  assert.equal(report.clientSavingsData.ufms.escalationPct, 6);
  assert.equal(report.clientSavingsData.ufms.termYears, 10);
  assert.equal(report.clientSavingsData.wheeling.ratePerKwh, 1.85);
  assert.equal(report.clientSavingsData.system.solarKwp, 35);
  assert.equal(report.clientSavingsData.system.batteryKwh, 50);
});

test("Seokas: deck + bills -> READY with their quoted charge on the client-facing output", () => {
  const report = buildFunderReport({
    caseReference: "F1-TEST-SEOKAS",
    businessName: "Seokas Bottle Store",
    billFacts: billFacts(SEOKAS_BILLS),
    ufms: { text: readExtract(SEOKAS_DECK), fileName: "UFMS P4L Proposal-Seokas Bottle Store.pdf" },
    generatedAt: AT,
  });
  assert.equal(report.ufmsVerification.status, "verified");
  assert.equal(report.status, "ready", report.holdReasons.join(" | "));
  assert.equal(report.clientSavingsData.ufms.monthlyCharge, 33_301);
  assert.equal(report.clientSavingsData.system.solarKwp, 75);
  // UFMS-only report: wheeling option absent, combined absent.
  assert.equal(report.options.wheeling.present, false);
  assert.equal(report.options.combined.present, false);
  assert.ok(report.options.ufms.monthlyCost > 0);
});

// ---------------------------------------------------------------------------
// Mismatched deck + bills -> cross-check fails >2% -> HOLD for operator.
// ---------------------------------------------------------------------------
test("MVM deck against Primo bills: cross-check fails, report HELD for operator confirmation", () => {
  const report = buildFunderReport({
    caseReference: "F1-TEST-MISMATCH",
    businessName: "Primo Poultry 121 (Pty) Ltd",
    billFacts: billFacts(PRIMO_BILLS),
    ufms: { text: readExtract(MVM_DECK), fileName: "UFMS P4L Proposal-MVM Enterprise.pdf" },
    generatedAt: AT,
  });
  // The deck itself is internally consistent (extraction verified) but the
  // paper does not belong to this load: the engine cross-check catches it.
  assert.equal(report.ufmsVerification.status, "verified");
  assert.equal(report.status, "hold_for_operator");
  assert.ok(report.holdReasons.length > 0);
  const chargeCheck = report.crosschecks.find((row) => row.field === "monthlyCharge");
  assert.equal(chargeCheck.pass, false);
  assert.ok(chargeCheck.deviationPct > FUNDER_REPORT_TOLERANCE_PCT);
  const sizeCheck = report.crosschecks.find((row) => row.field === "pvKwp");
  assert.equal(sizeCheck.pass, false);
});

test("operator confirm with corrections publishes the corrected figures", () => {
  const facts = billFacts(PRIMO_BILLS);
  const report = buildFunderReport({
    caseReference: "F1-TEST-CONFIRM",
    businessName: "Primo Poultry 121 (Pty) Ltd",
    billFacts: facts,
    ufms: { text: readExtract(MVM_DECK), fileName: "UFMS P4L Proposal-MVM Enterprise.pdf" },
    corrections: { ufmsMonthlyCharge: 66_809, pvKwp: 150, bessKwh: 250, monthlyGenerationKwh: 26_000 },
    operatorConfirmed: true,
    generatedAt: AT,
  });
  assert.equal(report.status, "ready");
  assert.equal(report.operatorConfirmed, true);
  // The corrected (true Primo) figures replace the mismatched deck's fields.
  assert.equal(report.clientSavingsData.ufms.monthlyCharge, 66_809);
  assert.equal(report.clientSavingsData.system.solarKwp, 150);
  const chargeCheck = report.crosschecks.find((row) => row.field === "monthlyCharge");
  assert.ok(chargeCheck.pass, JSON.stringify(chargeCheck));
});

// ---------------------------------------------------------------------------
// ClientSavingsData -> ten-year series -> combined never double-counts.
// ---------------------------------------------------------------------------
test("ten-year series: 10 cumulative increasing years per path, anchored to their quoted numbers", () => {
  const report = ratangReport();
  const ten = report.clientSavingsData.tenYear;
  for (const key of ["eskom", "ufms", "wheeling", "combined"]) {
    assert.equal(ten[key].length, 10, key);
    for (let i = 1; i < 10; i += 1) assert.ok(ten[key][i] > ten[key][i - 1], `${key} cumulative`);
  }
  assert.ok(ten.chartMaxRands >= ten.eskom[9]);
  // Anchor: year-one UFMS cumulative starts from THEIR charge stream, not a
  // silent engine re-quote (charge*12 must be inside the year-one figure).
  assert.ok(ten.ufms[0] >= 15_253 * 12);
});

test("combined never double-counts: combined saving strictly below ufms + wheeling savings", () => {
  const report = ratangReport();
  const { eskomMonthly, ufms, wheeling, combined } = report.options;
  assert.ok(ufms.present && wheeling.present && combined.present);
  // Monthly: strict inequality — the same kWh is never claimed twice.
  assert.ok(
    combined.monthlySaving < ufms.monthlySaving + wheeling.monthlySaving,
    `combined ${combined.monthlySaving} vs ${ufms.monthlySaving} + ${wheeling.monthlySaving}`,
  );
  // Ten-year: the same must hold on the cumulative series, every year.
  const ten = report.clientSavingsData.tenYear;
  for (let i = 0; i < 10; i += 1) {
    const ufmsSaving = ten.eskom[i] - ten.ufms[i];
    const wheelingSaving = ten.eskom[i] - ten.wheeling[i];
    const combinedSaving = ten.eskom[i] - ten.combined[i];
    assert.ok(
      combinedSaving < ufmsSaving + wheelingSaving,
      `year ${i + 1}: ${combinedSaving} !< ${ufmsSaving} + ${wheelingSaving}`,
    );
  }
  assert.ok(eskomMonthly > 0);
});

// ---------------------------------------------------------------------------
// Confidentiality: client-facing artifacts carry no engine internals.
// ---------------------------------------------------------------------------
test("ClientSavingsData contains only bill-derived and funder-stated figures", () => {
  const report = ratangReport();
  const json = JSON.stringify(report.clientSavingsData);
  for (const secret of ["0.015969", "1.5969", "173.375", "27290", "27804", "20554", "anchor", "crosscheck", "predicted", "capex"]) {
    assert.ok(!json.toLowerCase().includes(secret.toLowerCase()), `leak: ${secret}`);
  }
});

// ---------------------------------------------------------------------------
// PDF artifact: server-rendered bytes, all six sections, no engine leakage.
// ---------------------------------------------------------------------------
test("funder report renders to PDF bytes (jsPDF, production path — no presentations worker)", () => {
  const report = ratangReport();
  const pdf = buildFunderReportPdf(report);
  assert.ok(pdf.bytes instanceof Uint8Array);
  assert.ok(pdf.bytes.byteLength > 15_000, `pdf bytes ${pdf.bytes.byteLength}`);
  const header = Buffer.from(pdf.bytes.slice(0, 5)).toString("latin1");
  assert.equal(header, "%PDF-");
  assert.equal(pdf.pageCount, 7); // cover + 6 sections
  assert.match(pdf.filename, /^foundation-1-funder-report-/);
});

test("UFMS-only report still renders (wheeling/combined pages explain what's missing)", () => {
  const report = buildFunderReport({
    caseReference: "F1-TEST-SEOKAS",
    businessName: "Seokas Bottle Store",
    billFacts: billFacts(SEOKAS_BILLS),
    ufms: { text: readExtract(SEOKAS_DECK), fileName: "UFMS P4L Proposal-Seokas Bottle Store.pdf" },
    generatedAt: AT,
  });
  const pdf = buildFunderReportPdf(report);
  assert.ok(pdf.bytes.byteLength > 10_000);
  assert.equal(Buffer.from(pdf.bytes.slice(0, 5)).toString("latin1"), "%PDF-");
});

test("report requires at least one funder proposal", () => {
  assert.throws(
    () => buildFunderReport({
      caseReference: "F1-TEST-EMPTY",
      businessName: "Nobody",
      billFacts: billFacts(RATANG_BILLS),
      generatedAt: AT,
    }),
    /at least one uploaded funder proposal/,
  );
});

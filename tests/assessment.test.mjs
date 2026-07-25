// Tests for the assessment layer (engine-backed) and the shared document
// taxonomy. Run: node --test tests/assessment.test.mjs  (Node >= 22.6)
import test from "node:test";
import assert from "node:assert/strict";

const { calculateMigrationAssessment } = await import("../lib/calculateMigrationAssessment.ts");
const { runPricingEngine } = await import("../lib/pricing-engine.ts");
const { classifyDocumentTitle, countDocumentsByType } = await import("../lib/document-taxonomy.ts");

// --- Assessment scenarios ----------------------------------------------------

test("bill path emits ordered P10/P50/P90 scenarios", () => {
  const r = calculateMigrationAssessment({ monthlyElectricitySpend: 128_036, monthlyKwh: 52_146 });
  assert.equal(r.ufmsSolar.scenarios.length, 3);
  const [lo, base, hi] = r.ufmsSolar.scenarios;
  assert.ok(lo.savingPercentage <= base.savingPercentage);
  assert.ok(base.savingPercentage <= hi.savingPercentage);
  assert.deepEqual([lo.confidence, base.confidence, hi.confidence], ["P10", "P50", "P90"]);
  assert.match(base.label, /central/i);
});

test("assumed-tariff path uses honest engine bands, none above 30%", () => {
  const r = calculateMigrationAssessment({ monthlyElectricitySpend: 50_000 });
  assert.equal(r.ufmsSolar.scenarios.length, 3);
  for (const scenario of r.ufmsSolar.scenarios) {
    assert.ok(scenario.savingPercentage <= 30, `${scenario.label}: ${scenario.savingPercentage}%`);
  }
});

test("combined scenario applies wheeling to residual imports rather than a hardcoded 60%", () => {
  const r = calculateMigrationAssessment({ monthlyElectricitySpend: 100_000, monthlyKwh: 40_000 });
  assert.equal(r.combinedScenarios.length, 1);
  const combined = r.combinedScenarios[0];
  assert.match(combined.label, /combined onsite/i);
  assert.notEqual(combined.combinedSavingPercentage, 60);
  assert.equal(combined.combinedMonthlySaving, r.proposal.lumenCombined.monthlySaving);
  assert.equal(combined.combinedMonthlyCost, r.proposal.lumenCombined.monthlyCost);
  assert.ok(r.proposal.lumenCombined.wheeledResidualKwh < r.proposal.input.monthlyKwh);
});

test("below commercial threshold still returns a non-overlapping planning waterfall", () => {
  const r = calculateMigrationAssessment({ monthlyElectricitySpend: 30_000, monthlyKwh: 11_000 });
  const combined = r.combinedScenarios[0];
  assert.match(combined.label, /planning view/i);
  assert.equal(r.proposal.lumenCombined.eligible, false);
  assert.equal(
    r.proposal.lumenCombined.wheeledResidualKwh,
    r.proposal.ufms.dispatch.residualGridKwh,
  );
});

test("qualification status strings cover all bands", () => {
  assert.equal(
    calculateMigrationAssessment({ monthlyElectricitySpend: 5_000 }).qualificationStatus,
    "Below programme minimum",
  );
  // Seokas-like: R2.69 blended small site → unlikely/marginal messaging
  const seokas = calculateMigrationAssessment({ monthlyElectricitySpend: 30_374, monthlyKwh: 11_292 });
  assert.match(seokas.qualificationStatus, /model completed|bill-audited/i);
  const ratanga = calculateMigrationAssessment({ monthlyElectricitySpend: 16_295, monthlyKwh: 4_900 });
  assert.match(ratanga.qualificationStatus, /model completed|bill-audited/i);
});

test("proposal field carries the full engine result", () => {
  const input = { monthlyElectricitySpend: 73_558, monthlyKwh: 25_107 };
  const r = calculateMigrationAssessment(input);
  const engine = runPricingEngine({ monthlySpend: input.monthlyElectricitySpend, monthlyKwh: input.monthlyKwh });
  assert.equal(r.proposal.ufms.ufmsMonthly, engine.ufms.ufmsMonthly);
  assert.equal(r.proposal.lumenCombined.eligible, engine.lumenCombined.eligible);
  assert.ok(r.proposal.explainer.length >= 8);
});

test("wheeling savings respect the energy-share cap", () => {
  const r = calculateMigrationAssessment({ monthlyElectricitySpend: 100_000, monthlyKwh: 40_000 });
  const cap = 100_000 * 0.6;
  assert.ok(r.wheeling.conservative.monthlySaving <= cap);
  assert.ok(r.wheeling.photovoltaicOnlyReference.monthlySaving <= cap);
  assert.ok(
    r.wheeling.photovoltaicOnlyReference.monthlySaving >= r.wheeling.conservative.monthlySaving,
  );
});

test("assessment passes charge lines and interval evidence into the canonical engine", () => {
  const intervalProfile = Array.from({ length: 48 }, () => ({ loadKwh: 10, durationHours: 0.5 }));
  const r = calculateMigrationAssessment({
    monthlyElectricitySpend: 60_000,
    monthlyKwh: 20_000,
    intervalProfile,
    allowIntervalDemandSavings: true,
    billBreakdown: { energy: 30_000, networkVolumetric: 10_000, fixed: 12_000, demand: 5_000, reactive: 2_000, other: 1_000, source: "bill-lines" },
  });
  assert.equal(r.proposal.input.evidenceLevel, "interval-validated");
  assert.equal(r.proposal.ufms.dispatch.source, "actual-interval-profile");
  assert.equal(r.proposal.ufms.chargeWaterfall.baseline.fixed, 12_000);
});

test("invalid input throws; legacy monthlySpend alias works", () => {
  assert.throws(() => calculateMigrationAssessment({ monthlyElectricitySpend: 0 }));
  assert.throws(() => calculateMigrationAssessment({ monthlyElectricitySpend: Number.NaN }));
  const legacy = calculateMigrationAssessment({ monthlySpend: 60_000 });
  assert.equal(legacy.input.monthlyElectricitySpend, 60_000);
});

// --- Document taxonomy --------------------------------------------------------

test("canonical upload titles classify by prefix, immune to hostile filenames", () => {
  assert.equal(
    classifyDocumentTitle("FICA - Proof of Residence - municipal utility bill jan"),
    "fica_proof_of_residence",
  );
  assert.equal(
    classifyDocumentTitle("Bank Statements (6 months) - debit-order-mandate"),
    "bank_statements",
  );
  assert.equal(classifyDocumentTitle("Signed Expression of Interest - scan1"), "signed_eoi");
  assert.equal(classifyDocumentTitle("Expression of Interest - draft"), "expression_of_interest");
  assert.equal(classifyDocumentTitle("Utility Bill - Month 3"), "utility_bills");
  assert.equal(classifyDocumentTitle("FICA - Director ID - k mabaso"), "fica_director_id");
});

test("legacy keyword fallback still counts admin-authored titles, unsigned EOI excluded from signed", () => {
  assert.equal(classifyDocumentTitle("January eskom bill"), "utility_bills");
  assert.equal(classifyDocumentTitle("CIPC pack for lead"), "company_registration");
  // unsigned EOI with 'signed' in text must not classify as expression_of_interest
  assert.equal(classifyDocumentTitle("eoi to be signed"), null);
  assert.equal(classifyDocumentTitle("random attachment"), null);
});

test("countDocumentsByType aggregates counts", () => {
  const counts = countDocumentsByType([
    { title: "Utility Bill - Jan" },
    { title: "Utility Bill - Feb" },
    { title: "Signed Foundation-1 Mandate - final" },
    { title: "Tax Clearance Certificate" },
    { title: "unrelated" },
  ]);
  assert.equal(counts.utility_bills, 2);
  assert.equal(counts.signed_mandate, 1);
  assert.equal(counts.tax_clearance, 1);
  assert.equal(counts.signed_proposal, 0);
});

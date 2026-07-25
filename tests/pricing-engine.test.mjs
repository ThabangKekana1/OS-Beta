import test from "node:test";
import assert from "node:assert/strict";

const engine = await import("../lib/pricing-engine.ts");
const {
  runPricingEngine,
  sizeSystem,
  buildCapex,
  pmtDue,
  ENGINE_CONSTANTS,
} = engine;

function within(actual, expected, tolerancePct) {
  const difference = Math.abs(actual - expected) / expected;
  assert.ok(
    difference <= tolerancePct,
    `expected ${actual} within ${(tolerancePct * 100).toFixed(1)}% of ${expected} (off ${(difference * 100).toFixed(2)}%)`,
  );
}

test("observed funded charge factor remains exact across partner proposals", () => {
  for (const [capex, monthly] of [
    [955_159, 15_253],
    [2_085_299, 33_301],
    [6_166_288, 98_471],
    [4_183_577, 66_809],
  ]) {
    within(capex * ENGINE_CONSTANTS.ufmsMonthlyRateFactor, monthly, 0.001);
  }
});

test("asset finance uses the observed 14.75% annuity-due formula", () => {
  for (const [capex, monthly] of [
    [955_159, 15_079],
    [2_085_299, 32_920],
    [6_166_288, 97_345],
    [4_183_577, 66_045],
  ]) {
    within(pmtDue(0.1475, 120, capex), monthly, 0.001);
  }
});

test("MVM package calibration remains exact while unsupported residual savings are removed", () => {
  const result = runPricingEngine({ monthlySpend: 128_036, monthlyKwh: 52_146 });
  assert.equal(result.ufms.sizing.pvKwp, 300);
  assert.equal(result.ufms.sizing.bessKwh, 300);
  within(result.ufms.capex.total, 6_166_288, 0.005);
  within(result.ufms.ufmsMonthly, 98_471, 0.005);
  assert.ok(result.ufms.residualGridMonthly > 128_036 * 0.14);
  assert.equal(result.ufms.dispatch.creditedDemandReductionPct, 0);
  assert.equal(result.qualification.band, "unlikely");
});

test("site resource drives yield and package sizing without changing the funding formula", () => {
  const result = runPricingEngine({
    monthlySpend: 75_383,
    monthlyKwh: 24_372,
    annualSolarYieldKwhPerKwp: 1_802.77,
    solarYieldSource: "site-pvgis",
    tariffStructure: "time-of-use",
  });
  assert.equal(result.ufms.sizing.pvKwp, 150);
  assert.equal(result.ufms.sizing.bessKwh, 250);
  assert.equal(result.ufms.sizing.panelCount, 242);
  within(result.ufms.sizing.estimatedMonthlyGenerationKwh, 22_534.63, 0.001);
  within(result.ufms.capex.total, 4_183_577, 0.001);
  within(result.ufms.ufmsMonthly, 66_809, 0.001);
  assert.equal(result.ufms.capex.incrementalStorageCost, 375_500);
});

test("PV and storage are sized independently for time-of-use businesses", () => {
  const flat = runPricingEngine({
    monthlySpend: 75_383,
    monthlyKwh: 24_372,
    annualSolarYieldKwhPerKwp: 1_802.77,
    tariffStructure: "flat",
  });
  const tou = runPricingEngine({
    monthlySpend: 75_383,
    monthlyKwh: 24_372,
    annualSolarYieldKwhPerKwp: 1_802.77,
    tariffStructure: "time-of-use",
  });
  assert.equal(flat.ufms.sizing.pvKwp, tou.ufms.sizing.pvKwp);
  assert.equal(flat.ufms.sizing.bessKwh, 150);
  assert.equal(tou.ufms.sizing.bessKwh, 250);
});

test("synthetic profiles never credit demand-charge elimination", () => {
  const result = runPricingEngine({
    monthlySpend: 80_000,
    monthlyKwh: 25_000,
    tariffStructure: "time-of-use",
    allowIntervalDemandSavings: true,
    billBreakdown: {
      energy: 45_000,
      networkVolumetric: 15_000,
      fixed: 12_000,
      demand: 5_000,
      reactive: 1_000,
      other: 2_000,
      source: "bill-lines",
    },
  });
  assert.equal(result.ufms.dispatch.source, "synthetic-business-profile");
  assert.equal(result.ufms.dispatch.creditedDemandReductionPct, 0);
  assert.equal(result.ufms.chargeWaterfall.retainedAfterUfms.demand, 5_000);
});

test("interval evidence can credit only the modelled peak reduction", () => {
  const intervalProfile = Array.from({ length: 48 }, (_, index) => ({
    loadKwh: index >= 14 && index < 20 ? 40 : 10,
    durationHours: 0.5,
    energyRateMultiplier: index >= 14 && index < 20 ? 1.7 : 1,
  }));
  const result = runPricingEngine({
    monthlySpend: 80_000,
    monthlyKwh: 25_000,
    tariffStructure: "time-of-use",
    intervalProfile,
    allowIntervalDemandSavings: true,
    billBreakdown: { energy: 50_000, networkVolumetric: 10_000, fixed: 10_000, demand: 8_000, reactive: 1_000, other: 1_000, source: "bill-lines" },
  });
  assert.equal(result.ufms.dispatch.source, "actual-interval-profile");
  assert.ok(result.ufms.dispatch.creditedDemandReductionPct >= 0);
  assert.ok(result.ufms.chargeWaterfall.retainedAfterUfms.demand <= 8_000);
});

test("standalone wheeling reprices all eligible energy kWh, not 60% of kWh", () => {
  const result = runPricingEngine({
    monthlySpend: 75_383,
    monthlyKwh: 24_372,
    billBreakdown: {
      energy: 42_971.81,
      networkVolumetric: 18_000,
      fixed: 13_000,
      demand: 0,
      reactive: 1_000,
      other: 411.19,
      source: "bill-lines",
    },
  });
  assert.equal(result.wheeling.wheeledMonthlyKwh, 24_372);
  assert.equal(result.wheeling.wheeledEnergyCost, 45_088.2);
  assert.ok(result.wheeling.monthlySaving < 0);
  assert.equal(result.wheeling.available, false);
});

test("combined migration wheels residual imports only and cannot double count onsite kWh", () => {
  const result = runPricingEngine({
    monthlySpend: 100_000,
    monthlyKwh: 40_000,
    annualSolarYieldKwhPerKwp: 1_750,
    tariffStructure: "time-of-use",
  });
  const combined = result.lumenCombined;
  assert.equal(combined.eligible, true);
  assert.equal(combined.wheeledResidualKwh, result.ufms.dispatch.residualGridKwh);
  assert.ok(combined.wheeledResidualKwh < result.input.monthlyKwh);
  assert.equal(combined.eskomResidualKwh, 0);
  assert.equal(
    combined.monthlyCost,
    engine.round2(combined.ufmsMonthlyCharge + combined.wheelingMonthlyCharge + combined.retainedGridMonthly),
  );
  assert.notEqual(combined.combinedSavingPct, 0.6);
  assert.match(combined.note, /onsite solar serves load first/i);
});

test("charge waterfall preserves fixed, reactive and unsupported demand lines", () => {
  const result = runPricingEngine({
    monthlySpend: 60_000,
    monthlyKwh: 20_000,
    billBreakdown: { energy: 30_000, networkVolumetric: 10_000, fixed: 12_000, demand: 5_000, reactive: 2_000, other: 1_000, source: "bill-lines" },
  });
  const retained = result.ufms.chargeWaterfall.retainedAfterUfms;
  assert.equal(retained.fixed, 12_000);
  assert.equal(retained.demand, 5_000);
  assert.equal(retained.reactive, 2_000);
  assert.equal(retained.other, 1_000);
  assert.ok(retained.energy < 30_000);
  assert.ok(retained.networkVolumetric < 10_000);
});

test("P10/P50/P90 bands are ordered and use one equipment package", () => {
  const result = runPricingEngine({ monthlySpend: 50_000, monthlyKwh: 16_000 });
  assert.deepEqual(result.bands.map((band) => band.confidence), ["P10", "P50", "P90"]);
  assert.ok(result.bands[0].monthlySaving <= result.bands[1].monthlySaving);
  assert.ok(result.bands[1].monthlySaving <= result.bands[2].monthlySaving);
  assert.equal(new Set(result.bands.map((band) => band.pvKwp)).size, 1);
});

test("spend-only estimates disclose assumed consumption and charge splits", () => {
  const result = runPricingEngine({ monthlySpend: 50_000 });
  assert.equal(result.input.tariffSource, "assumed");
  assert.equal(result.input.evidenceLevel, "spend-only");
  assert.equal(result.input.billBreakdown.source, "assumed");
  assert.ok(result.qualification.reasons.some((reason) => /charge-line split is assumed/i.test(reason)));
});

test("below-minimum spend is gated", () => {
  const result = runPricingEngine({ monthlySpend: 5_000 });
  assert.equal(result.qualification.band, "below-minimum");
  assert.equal(result.qualification.qualifies, false);
});

test("commercial package gaps remain visible without suppressing the calculation", () => {
  const small = runPricingEngine({
    monthlySpend: 13_069,
    monthlyKwh: 4_743.58,
    minimumPvKwp: ENGINE_CONSTANTS.verifiedCommercialMinimumPvKwp,
  });
  assert.equal(small.commercialFit.status, "below-commercial-minimum");
  assert.equal(small.commercialFit.selectedPvKwp, 35);
  assert.ok(Number.isFinite(small.ufms.ufmsMonthly));

  const large = runPricingEngine({
    monthlySpend: 400_000,
    monthlyKwh: 100_000,
    minimumPvKwp: ENGINE_CONSTANTS.verifiedCommercialMinimumPvKwp,
  });
  assert.equal(large.commercialFit.status, "above-standard-maximum");
  assert.match(large.commercialFit.message, /multi-system design/i);
});

test("legacy partner-template sizing anchors remain reproducible", () => {
  assert.equal(sizeSystem(52_013).pvKwp, 300);
  assert.equal(sizeSystem(12_483).pvKwp, 75);
  assert.equal(sizeSystem(6_068).pvKwp, 35);
  within(buildCapex(sizeSystem(12_483)).total, 2_085_299, 0.01);
});

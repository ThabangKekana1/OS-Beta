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

/* ------------------------------------------------------------------ */
/* ENGINE V3: funder-quote prediction pins                              */
/* ------------------------------------------------------------------ */

const {
  predictFunderQuote,
  predictWheelingQuote,
  predictCombined,
  tenYearSeries,
  FUNDER_CONSTANTS,
} = engine;

test("predictFunderQuote reproduces all four extracted funder decks to <=0.1%", () => {
  const decks = [
    { name: "MVM", monthlyKwh: 52_013, tariffStructure: "flat", pvKwp: 300, bessKwh: 300, capex: 6_166_288, ufms: 98_471 },
    { name: "Seokas", monthlyKwh: 11_948, tariffStructure: "flat", pvKwp: 75, bessKwh: 100, capex: 2_085_299, ufms: 33_301 },
    { name: "Ratanga", monthlyKwh: 5_367, tariffStructure: "flat", pvKwp: 35, bessKwh: 50, capex: 955_159, ufms: 15_253 },
    { name: "Primo", monthlyKwh: 24_372, tariffStructure: "time-of-use", pvKwp: 150, bessKwh: 250, capex: 4_183_577, ufms: 66_809 },
  ];
  for (const deck of decks) {
    const quote = predictFunderQuote({ monthlyKwh: deck.monthlyKwh, tariffStructure: deck.tariffStructure });
    assert.equal(quote.pvKwp, deck.pvKwp, `${deck.name} pvKwp`);
    assert.equal(quote.bessKwh, deck.bessKwh, `${deck.name} bessKwh`);
    within(quote.capex, deck.capex, 0.001);
    within(quote.ufmsMonthly, deck.ufms, 0.001);
    assert.ok(quote.capexBand[0] < deck.capex && deck.capex < quote.capexBand[1], `${deck.name} capex band`);
  }
});

test("predictFunderQuote sizing snaps up, sizes storage blocks and flags oversize loads", () => {
  assert.equal(predictFunderQuote({ monthlyKwh: 8_000 }).pvKwp, 50);
  assert.equal(predictFunderQuote({ monthlyKwh: 8_000 }).bessKwh, 50);
  assert.equal(predictFunderQuote({ monthlyKwh: 13_500 }).pvKwp, 100);
  assert.equal(predictFunderQuote({ monthlyKwh: 13_500 }).bessKwh, 100);
  const oversized = predictFunderQuote({ monthlyKwh: 90_000 });
  assert.equal(oversized.pvKwp, 300);
  assert.equal(oversized.outOfStandardRange, true);
  const tou = predictFunderQuote({ monthlyKwh: 8_000, tariffStructure: "time-of-use" });
  assert.equal(tou.bessKwh, 150);
  assert.equal(tou.pcsKw, 50);
});

test("MVM wheeling eligible share derives from the bill's energy lines", () => {
  // MVM Feb-2025 bill: energy lines R67,892 of a R113,472 total (59.8%).
  const prediction = predictWheelingQuote({
    monthlySpend: 113_472,
    energyMonthlySpend: 67_892,
    monthlyKwh: 52_013,
    distributor: "eskom-direct",
  });
  assert.ok(
    Math.abs(prediction.energyShareOfBill - 0.598) <= 0.01,
    `energy share ${prediction.energyShareOfBill} outside 0.598 +/- 0.01`,
  );
  assert.equal(prediction.eligible, true);
  assert.equal(prediction.firmRate, 1.85);
  assert.deepEqual(prediction.rateBand, [0.98, 1.85]);
});

test("wheeling eligibility is gated by the distributor's use-of-system status", () => {
  for (const distributor of ["eskom-direct", "city-power", "matjhabeng-lm"]) {
    assert.equal(predictWheelingQuote({ monthlySpend: 100_000, monthlyKwh: 35_000, distributor }).eligible, true);
  }
  const blocked = predictWheelingQuote({ monthlySpend: 100_000, monthlyKwh: 35_000, distributor: "other-municipal" });
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.wheeledMonthlyKwh, 0);
  assert.equal(blocked.monthlySaving, 0);
});

test("predictCombined never double-counts kWh between UFMS and wheeling", () => {
  const combined = predictCombined({
    monthlySpend: 75_383,
    monthlyKwh: 24_372,
    tariffStructure: "time-of-use",
    distributor: "eskom-direct",
    residualBillShare: 0.1,
  });
  within(combined.onsiteServedKwh + combined.residualGridKwh, 24_372, 1e-6);
  assert.equal(combined.eskomResidualKwh, 0);
  assert.ok(combined.wheeledResidualKwh < 24_372);
  assert.ok(combined.wheeledResidualKwh <= combined.residualGridKwh + 1e-9);
  assert.equal(
    combined.monthlyCost,
    engine.round2(
      combined.funderQuote.ufmsMonthly +
        combined.wheeledResidualCost +
        combined.eskomResidualCost +
        combined.retainedNonEnergyMonthly,
    ),
  );
  const municipal = predictCombined({
    monthlySpend: 75_383,
    monthlyKwh: 24_372,
    distributor: "other-municipal",
  });
  assert.equal(municipal.wheeledResidualKwh, 0);
  assert.ok(municipal.eskomResidualKwh > 0);
});

test("Primo ten-year series tracks the funder deck arrays (informational pin)", () => {
  // Deck arrays from presentations/src/decks/clients/primo-poultry-121.ts.
  const deck = {
    eskom: [904_593, 1_888_247, 2_957_872, 4_120_983, 5_385_749, 6_761_056, 8_256_565, 9_882_781, 11_651_129, 13_574_030],
    wheeling: [932_918, 1_915_940, 2_949_927, 4_035_398, 5_172_447, 6_360_650, 7_598_954, 8_885_545, 10_217_705, 11_591_634],
    ufms: [828_795, 1_708_060, 2_640_888, 3_630_563, 4_680_573, 5_794_621, 6_976_641, 8_230_809, 9_561_561, 10_973_610],
    combined: [857_120, 1_735_753, 2_632_943, 3_544_978, 4_467_271, 5_394_215, 6_319_030, 7_233_573, 8_128_137, 8_991_214],
  };
  const series = tenYearSeries({
    monthlySpend: 75_383,
    monthlyKwh: 24_372,
    tariffStructure: "time-of-use",
    distributor: "eskom-direct",
    billEnergyShare: 0.6,
    residualBillShare: 0.03, // the funder's own Primo residual assumption
  });
  const maxDeviation = (generated, reference) =>
    Math.max(...generated.map((value, index) => Math.abs(value / reference[index] - 1)));
  // Eskom baseline and UFMS path reproduce the deck almost exactly.
  assert.ok(maxDeviation(series.eskom, deck.eskom) <= 0.001, `eskom off ${maxDeviation(series.eskom, deck.eskom)}`);
  assert.ok(maxDeviation(series.ufms, deck.ufms) <= 0.001, `ufms off ${maxDeviation(series.ufms, deck.ufms)}`);
  // Wheeling: deck used a 1.86 rate and internally inconsistent escalation
  // (stated 7%, cumulative arithmetic implies ~4.75%); the 6% mid-case
  // generator stays within +/-10% every year.
  assert.ok(
    maxDeviation(series.wheeling, deck.wheeling) <= 0.1,
    `wheeling off ${maxDeviation(series.wheeling, deck.wheeling)}`,
  );
  // Combined: the deck's combined series is literally ufms + wheeling - eskom
  // (an additive, double-counting construction) — verified below. A
  // non-double-counting waterfall cannot reproduce it beyond ~+/-22%; the pin
  // records the achieved deviation.
  for (let index = 0; index < 10; index += 1) {
    const additive = deck.ufms[index] + deck.wheeling[index] - deck.eskom[index];
    assert.ok(
      Math.abs(additive - deck.combined[index]) <= 2,
      `deck combined identity broken at year ${index + 1}`,
    );
  }
  assert.ok(
    maxDeviation(series.combined, deck.combined) <= 0.22,
    `combined off ${maxDeviation(series.combined, deck.combined)}`,
  );
});

test("ten-year series defaults use the verified funder decomposition", () => {
  const series = tenYearSeries({ monthlySpend: 100_000, monthlyKwh: 35_000 });
  assert.equal(series.assumptions.eskomEscalation, 0.0874);
  assert.equal(series.assumptions.ufmsEscalation, 0.06);
  // Funder decks escalate the utility baseline by a 10-year factor of x15.0057.
  within(series.eskom[9] / series.eskom[0], 15.0057, 0.001);
  assert.equal(series.eskom.length, 10);
  for (const key of ["eskom", "ufms", "wheeling", "combined"]) {
    for (let index = 1; index < 10; index += 1) {
      assert.ok(series[key][index] > series[key][index - 1], `${key} cumulative must increase`);
    }
  }
});

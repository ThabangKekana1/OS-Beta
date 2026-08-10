import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const { analyseUtilityBillText } = await import("../lib/utility-bill-analysis.ts");
const {
  CHARGE_TREATMENT_RULES,
  buildChargeTreatmentMatrix,
  wheelingViability,
} = await import("../lib/charge-treatment.ts");

const extractDir = join(process.cwd(), "..", "_extract", "text");

// The real Primo Poultry Site 2 pack: twelve Eskom Ruraflex invoices. The EOI
// in the same folder is not a bill and is excluded.
const primoFiles = readdirSync(extractDir)
  .filter((name) => name.includes("1._Onboarding_8._Primo_Poultry"))
  .filter((name) => !/EOI/i.test(name))
  .sort();

const primoBills = primoFiles.map((name) =>
  analyseUtilityBillText(readFileSync(join(extractDir, name), "utf8"), { fileName: name }),
);
const primoLines = primoBills.flatMap((bill) => bill.chargeLines);
const primoMatrix = buildChargeTreatmentMatrix(primoLines, { periodCount: primoBills.length });

const pct = (share) => share * 100;
const withinPct = (actual, expected, tolerancePct) =>
  Math.abs(actual - expected) <= Math.abs(expected) * (tolerancePct / 100);

test("the Primo pack under test is the real twelve-invoice Ruraflex history", () => {
  assert.equal(primoFiles.length, 12);
  assert.ok(primoBills.every((bill) => bill.status === "analysed"));
  assert.ok(primoBills.every((bill) => bill.tariffFamily === "Ruraflex"));
  assert.ok(primoLines.length > 100);
});

test("per-kWh rider is every non-energy volumetric charge divided by kWh imported", () => {
  const { rider, riderComponents } = primoMatrix.perKwh;
  assert.ok(withinPct(rider, 0.6957, 0.5), `rider ${rider} is not within 0.5% of R0.6957/kWh`);
  assert.ok(riderComponents.networkVolumetric > 0);
  assert.ok(riderComponents.levyVolumetric > 0);
  assert.ok(riderComponents.ancillaryVolumetric > 0);
  const recomposed =
    (riderComponents.networkVolumetric + riderComponents.levyVolumetric + riderComponents.ancillaryVolumetric)
    / primoMatrix.perKwh.totalKwh;
  assert.ok(withinPct(recomposed, rider, 0.5));
});

test("avoided cost per kWh is quoted by time-of-use bucket, not blended", () => {
  const { buckets, blendedEnergyRate } = primoMatrix.perKwh;
  assert.ok(withinPct(buckets.peak.onsiteAvoidedRate, 4.486, 0.5));
  assert.ok(withinPct(buckets.standard.onsiteAvoidedRate, 2.312, 0.5));
  assert.ok(withinPct(buckets["off-peak"].onsiteAvoidedRate, 1.819, 0.5));
  assert.ok(withinPct(blendedEnergyRate, 1.7321, 0.5));
  // Every bucket rate is its own energy rate plus the shared rider.
  for (const bucket of ["peak", "standard", "off-peak"]) {
    assert.ok(withinPct(
      buckets[bucket].onsiteAvoidedRate,
      buckets[bucket].energyRate + primoMatrix.perKwh.rider,
      0.01,
    ));
  }
  assert.ok(buckets.peak.energyRate > buckets.standard.energyRate);
  assert.ok(buckets.standard.energyRate > buckets["off-peak"].energyRate);
});

test("on-site reaches every per-kWh charge: 81.4% of the Primo bill", () => {
  const share = pct(primoMatrix.totals.onsiteReachableShare);
  assert.ok(Math.abs(share - 81.4) <= 0.5, `on-site reachable ${share.toFixed(2)}% is not 81.4% ±0.5pp`);
  assert.ok(primoMatrix.totals.onsiteReachable > 0);
  assert.ok(primoMatrix.totals.onsiteReachable < primoMatrix.totals.billMonthly);
});

test("wheeling reaches the energy commodity only: 58.1% of the Primo bill", () => {
  const share = pct(primoMatrix.totals.wheelingReachableShare);
  assert.ok(Math.abs(share - 58.1) <= 0.5, `wheeling reachable ${share.toFixed(2)}% is not 58.1% ±0.5pp`);
  assert.ok(primoMatrix.totals.wheelingReachable < primoMatrix.totals.onsiteReachable);
});

test("18.6% of the Primo bill is reachable by neither product automatically", () => {
  const share = pct(primoMatrix.totals.neverReachableShare);
  assert.ok(Math.abs(share - 18.6) <= 0.5, `never reachable ${share.toFixed(2)}% is not 18.6% ±0.5pp`);
  assert.ok(withinPct(
    primoMatrix.totals.onsiteReachable + primoMatrix.totals.neverReachable,
    primoMatrix.totals.billMonthly,
    0.01,
  ));
});

test("capacity charges are surfaced as a conditional upside with the action named", () => {
  assert.ok(primoMatrix.totals.conditionalNmd > 0);
  const capacity = primoMatrix.lines.filter((line) => line.category === "fixed-capacity");
  assert.ok(capacity.length > 0);
  for (const line of capacity) {
    assert.equal(line.onsite.treatment, "conditional");
    assert.equal(line.wheeling.treatment, "retained");
    assert.equal(line.wheeling.reachableAmount, 0);
    assert.match(line.onsite.reason, /notified maximum demand/i);
  }
  assert.ok(primoMatrix.warnings.some((warning) => /notified-maximum-demand/i.test(warning)));
  // Conditional capacity is never counted inside the reachable totals.
  const reachableSum = primoMatrix.lines
    .filter((line) => line.onsite.treatment === "removed-pro-rata")
    .reduce((sum, line) => sum + line.onsite.reachableAmount, 0);
  assert.ok(withinPct(reachableSum, primoMatrix.totals.onsiteReachable, 0.01));
});

test("reactive energy is conditional on inverter capability, never promised", () => {
  assert.ok(primoMatrix.totals.conditionalReactive > 0);
  const reactive = primoMatrix.lines.find((line) => line.category === "reactive");
  assert.equal(reactive.onsite.treatment, "conditional");
  assert.match(reactive.onsite.reason, /inverter/i);
  assert.ok(primoMatrix.warnings.some((warning) => /reactive/i.test(warning)));
});

test("service and network charges answer the two questions a client asks", () => {
  const service = primoMatrix.lines.find((line) => line.category === "fixed-service");
  assert.equal(service.onsite.treatment, "retained");
  assert.equal(service.wheeling.treatment, "retained");
  assert.equal(service.onsite.reachableAmount, 0);

  const network = primoMatrix.lines.find((line) => line.category === "network-volumetric");
  assert.equal(network.onsite.treatment, "removed-pro-rata");
  assert.equal(network.wheeling.treatment, "retained");
  assert.equal(network.wheeling.reachableAmount, 0);
  assert.ok(network.onsite.reachableAmount > 0);

  const energy = primoMatrix.lines.filter((line) => line.category === "energy");
  assert.ok(energy.length >= 3);
  for (const line of energy) {
    assert.equal(line.onsite.treatment, "removed-pro-rata");
    assert.equal(line.wheeling.treatment, "replaced");
  }
});

test("firm wheeling at R1.85 is negative against the Primo blended energy rate", () => {
  const verdict = wheelingViability(1.7321, 1.85);
  assert.equal(verdict.viable, false);
  assert.ok(verdict.marginPerKwh < 0, `expected a negative margin, got ${verdict.marginPerKwh}`);
  assert.ok(withinPct(verdict.marginPerKwh, -0.1179, 0.5));
  assert.match(verdict.note, /network/i);
});

test("the same wheeled rate is strongly positive against Primo peak energy", () => {
  const peakEnergyRate = primoMatrix.perKwh.buckets.peak.energyRate;
  const verdict = wheelingViability(peakEnergyRate, 1.85, "peak-period");
  assert.equal(verdict.viable, true);
  assert.ok(withinPct(verdict.marginPerKwh, 1.94, 0.5), `peak margin ${verdict.marginPerKwh} is not ~R1.94/kWh`);
});

test("every bill charge category has a stated treatment on both products", () => {
  const categories = [
    "energy", "network-volumetric", "ancillary-volumetric", "levy-volumetric",
    "fixed-service", "fixed-capacity", "demand", "reactive", "adjustment", "other",
  ];
  for (const category of categories) {
    const rule = CHARGE_TREATMENT_RULES[category];
    assert.ok(rule, `missing rule for ${category}`);
    assert.ok(["removed-pro-rata", "conditional", "retained"].includes(rule.onsite));
    assert.ok(["replaced", "retained", "conditional"].includes(rule.wheeling));
    for (const sentence of [rule.reason, rule.onsiteReason, rule.wheelingReason]) {
      assert.ok(sentence.length > 30, `${category} reason is too thin to read to a client`);
      assert.ok(sentence.trim().endsWith("."));
      // Client-readable: no internal engine or pricing-model language.
      assert.doesNotMatch(sentence, /ufms|eden|green ?share|capex|escalation|engine|nedbank|eqstra|margin/i);
    }
  }
});

test("an empty or kWh-less bill degrades to warnings rather than false numbers", () => {
  const empty = buildChargeTreatmentMatrix([]);
  assert.equal(empty.lines.length, 0);
  assert.equal(empty.totals.billMonthly, 0);
  assert.equal(empty.perKwh.rider, 0);
  assert.ok(empty.warnings.length > 0);

  const noQuantity = buildChargeTreatmentMatrix([
    { description: "Energy Charge", amountExVat: 1000, category: "energy", treatment: "addressable", quantity: null, unit: null, rate: null, rateUnit: null, touBucket: null },
    { description: "Service Charge", amountExVat: 250, category: "fixed-service", treatment: "residual", quantity: null, unit: null, rate: null, rateUnit: null, touBucket: null },
  ]);
  assert.equal(noQuantity.totals.billMonthly, 1250);
  assert.equal(noQuantity.perKwh.rider, 0);
  assert.ok(noQuantity.warnings.some((warning) => /per-kWh avoided cost/i.test(warning)));
});

test("periodCount normalises a multi-invoice pack to a monthly view without moving ratios", () => {
  const pooled = buildChargeTreatmentMatrix(primoLines);
  assert.equal(pooled.totals.onsiteReachableShare, primoMatrix.totals.onsiteReachableShare);
  assert.equal(pooled.perKwh.rider, primoMatrix.perKwh.rider);
  assert.ok(withinPct(pooled.totals.billMonthly / 12, primoMatrix.totals.billMonthly, 0.01));
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPreEngineeringSolarYield,
  PROVINCE_SOLAR_YIELD_ASSUMPTIONS,
  provinceSolarYieldAssumption,
} from "../lib/solar-yield-assumptions.ts";

test("province solar catalogue covers all nine South African provinces", () => {
  assert.equal(PROVINCE_SOLAR_YIELD_ASSUMPTIONS.length, 9);
  assert.equal(new Set(PROVINCE_SOLAR_YIELD_ASSUMPTIONS.map((item) => item.province)).size, 9);
  for (const item of PROVINCE_SOLAR_YIELD_ASSUMPTIONS) {
    assert.ok(item.annualKwhPerKwp > 1_400);
    assert.ok(item.annualKwhPerKwp < 1_900);
    assert.equal(item.azimuthDegrees, 180);
  }
});

test("province matching tolerates spacing and punctuation", () => {
  assert.equal(provinceSolarYieldAssumption(" KwaZulu Natal ")?.referenceSite, "Pietermaritzburg");
  assert.equal(provinceSolarYieldAssumption("north-west")?.referenceSite, "Mahikeng");
  assert.equal(provinceSolarYieldAssumption("unknown"), null);
});

test("pre-engineering yield scales the sourced provincial reference by proposed kWp", () => {
  const yieldAssumption = buildPreEngineeringSolarYield({
    province: "Free State",
    siteCity: "Vredefort",
    pvKwp: 300,
  });

  assert.ok(yieldAssumption);
  assert.equal(yieldAssumption.status, "pre-engineering");
  assert.equal(yieldAssumption.siteCity, "Vredefort");
  assert.equal(yieldAssumption.annualKwhPerKwp, 1802.77);
  assert.equal(yieldAssumption.annualGenerationKwh, 540_831);
  assert.equal(yieldAssumption.averageMonthlyGenerationKwh, 45_069.25);
  assert.equal(yieldAssumption.systemLossInputPercentage, 14);
  assert.match(yieldAssumption.limitation, /actual site coordinates/i);
});

test("solar yield stays absent when province evidence is missing", () => {
  assert.equal(buildPreEngineeringSolarYield({ province: null, pvKwp: 75 }), null);
  assert.equal(buildPreEngineeringSolarYield({ province: "Gauteng", pvKwp: 0 }), null);
});

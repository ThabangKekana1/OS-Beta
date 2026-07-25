import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildF1Proposal,
  buildTenYearCostSchedule,
  FORMAL_UTILITY_ESCALATION_SCHEDULE,
} from "../lib/f1-proposal.ts";
import { buildMigrationProposalPdf } from "../lib/migration-proposal-pdf.ts";
import {
  buildEnvironmentalImpactRows,
  UTILITY_TARIFF_HISTORY,
} from "../lib/proposal-impact-model.ts";
import { currentiseEskomBill } from "../lib/eskom-tariff-currentisation.ts";
import {
  aggregateUtilityBills,
  analyseUtilityBillText,
  canonicaliseUtilityBillAnalyses,
} from "../lib/utility-bill-analysis.ts";

const workspace = new URL("../../", import.meta.url);
const RATANG_MONTHS = ["October", "November", "December", "January", "February", "March"];

function actualRatangPortfolio() {
  const analyses = RATANG_MONTHS.map((month) => {
    const fileName = `1._Onboarding_6._Ratang_Liquor_Null_Retang_Liquor_Folder_Documents_Eskom_${month}_Invoice.pdf.txt`;
    const text = readFileSync(new URL(`_extract/text/${fileName}`, workspace), "utf8");
    return analyseUtilityBillText(text, { fileName, analysedAt: "2026-07-09T00:00:00.000Z" });
  });
  const canonical = canonicaliseUtilityBillAnalyses(analyses);
  const currentisedBills = canonical.map((analysis) => ({
    sourceHash: analysis.sourceHash,
    ...currentiseEskomBill(analysis),
  }));
  return aggregateUtilityBills(analyses, "2026-07-09T00:00:00.000Z", { currentisedBills });
}

function withinRands(actual, expected, tolerance) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected R${actual} within R${tolerance} of R${expected}`,
  );
}

test("actual Ratang bill pack sizes from representative load and stress-tests the selected high month", () => {
  const portfolio = actualRatangPortfolio();
  assert.equal(portfolio.formalProposalReady, true);

  const proposal = buildF1Proposal({
    businessName: "Ratang Liquor",
    clientProfileId: "F1-RATANG",
    siteCity: "Masemola",
    province: "Limpopo",
    utilityProvider: "Eskom",
    monthlySpend: portfolio.averageMonthlySpendExVat,
    monthlyKwh: portfolio.averageMonthlyKwh,
    billPortfolio: portfolio,
    generatedAt: "2026-07-09T00:00:00.000Z",
  });

  assert.equal(proposal.calculationBasis.periodStart, "2026-01-06");
  assert.equal(proposal.calculationBasis.periodEnd, "2026-02-02");
  assert.equal(proposal.profile.monthlySpend, 24_085.13);
  assert.equal(proposal.profile.estimatedMonthlyKwh, 6_794.19);
  assert.equal(proposal.billAudit.averageMonthlySpendExVat, 16_016.42);
  assert.equal(proposal.billAudit.averageMonthlyKwh, 4_632.43);
  assert.deepEqual(proposal.ufmsOption.sizing, { pvKwp: 35, pcsKw: 50, bessKwh: 50 });
  withinRands(proposal.ufmsOption.monthlyCharge, 15_253, 1);
  assert.equal(proposal.billAwareEconomics.yearOne.currentUtilityCost, 24_085.13);
  assert.equal(proposal.billAwareEconomics.yearOne.residualGridCost, 9_954.94);
  assert.equal(proposal.ufmsOption.dispatch.residualGridKwh, 2_259.31);
  assert.equal(proposal.ufmsOption.dispatch.creditedDemandReductionPct, 0);
  assert.equal(proposal.solarYield.averageMonthlyGenerationKwh, 4_987.5);
  assert.equal(proposal.commercial.structures.find((option) => option.label === "Asset Finance").monthlyCharge, 15_078.66);
  assert.equal(proposal.tariffComparison.projectionRows.length, 10);
  assert.equal(proposal.tariffComparison.projectionRows[0].utilityEffectiveTariff, 3.54);
  assert.equal(proposal.tariffComparison.historicalContext.length, 27);
  assert.equal(proposal.energyAndEsg.impactRows.find((row) => row.key === "co2e").factor, 940);
  assert.equal(proposal.energyAndEsg.annualPlanningEnergyReductionGwh, 0.05441856);
  assert.ok(proposal.explainer.some((line) => /highest eligible/i.test(line)));
  assert.ok(proposal.explainer.some((line) => /PVGIS.*4[\s,]988 kWh\/month/i.test(line)));
  assert.ok(proposal.explainer.every((line) => !/6,069 kWh per month/i.test(line)));
  assert.ok(proposal.explainer.some((line) => /engineering-final/i.test(line)));
  assert.ok(proposal.billAwareEconomics.limitations.some((line) => /8\.76%.*not compounded twice/i.test(line)));
});

test("legacy tariff context and disclosed environmental factors reproduce the source-table mechanics", () => {
  assert.deepEqual(UTILITY_TARIFF_HISTORY[0], {
    year: 2007,
    utilityTariffRandPerKwh: 0.34,
    cumulativeIncreasePct: 0,
    evidence: "historical-template",
  });
  assert.deepEqual(UTILITY_TARIFF_HISTORY.at(-1), {
    year: 2033,
    utilityTariffRandPerKwh: 8.06,
    cumulativeIncreasePct: 2270,
    evidence: "legacy-template-projection",
  });
  const impact = buildEnvironmentalImpactRows(0.624);
  assert.equal(Math.round(impact.find((row) => row.key === "nox").annualReduction), 3);
  assert.equal(Math.round(impact.find((row) => row.key === "so2").annualReduction), 5);
  assert.equal(Math.round(impact.find((row) => row.key === "coal").annualReduction), 331);
  assert.equal(Math.round(impact.find((row) => row.key === "ash").annualReduction), 97);
});

test("downloadable Migration Proposal is a multi-page vector PDF", () => {
  const portfolio = actualRatangPortfolio();
  const proposal = buildF1Proposal({
    businessName: "Ratang Liquor",
    clientProfileId: "F1-RATANG",
    siteCity: "Masemola",
    province: "Limpopo",
    utilityProvider: "Eskom",
    monthlySpend: portfolio.averageMonthlySpendExVat,
    monthlyKwh: portfolio.averageMonthlyKwh,
    billPortfolio: portfolio,
    generatedAt: "2026-07-09T00:00:00.000Z",
  });
  const pdf = buildMigrationProposalPdf(proposal);
  assert.ok(pdf.pageCount >= 8);
  assert.equal(Buffer.from(pdf.bytes).subarray(0, 5).toString(), "%PDF-");
  assert.match(pdf.filename, /foundation-1-migration-proposal-ratang-liquor/);
});

test("generic forecast maths reproduces Ratang's published Nedbank table within deck rounding", () => {
  const reproduction = buildTenYearCostSchedule({
    monthlyUtilityCost: 219_459 / 12,
    monthlyUfmsCharge: 183_039 / 12,
    monthlyResidualGridCost: 26_364 / 12,
    utilityEscalationSchedule: Array(10).fill(0.0874),
    ufmsEscalation: 0.06,
  });

  assert.deepEqual(reproduction.rows[0], {
    year: 1,
    utilityCost: 219_459,
    ufmsCharge: 183_039,
    residualGridCost: 26_364,
    solutionCost: 209_403,
    annualSaving: 10_056,
    cumulativeSaving: 10_056,
  });
  withinRands(reproduction.currentUtilityCost, 3_293_132, 2);
  withinRands(reproduction.solutionCost, 2_808_205, 4);
  withinRands(reproduction.saving, 484_927, 3);
});

test("formal forecast pins every row and applies the approved 2027/28 increase in year two", () => {
  assert.deepEqual(FORMAL_UTILITY_ESCALATION_SCHEDULE, [
    0.0876,
    0.0883,
    0.06,
    0.06,
    0.06,
    0.06,
    0.06,
    0.06,
    0.06,
    0.06,
  ]);

  const forecast = buildTenYearCostSchedule({
    monthlyUtilityCost: 100,
    monthlyUfmsCharge: 50,
    monthlyResidualGridCost: 10,
    utilityEscalationSchedule: FORMAL_UTILITY_ESCALATION_SCHEDULE,
  });

  assert.deepEqual(forecast.rows, [
    { year: 1, utilityCost: 1_200, ufmsCharge: 600, residualGridCost: 120, solutionCost: 720, annualSaving: 480, cumulativeSaving: 480 },
    { year: 2, utilityCost: 1_306, ufmsCharge: 636, residualGridCost: 131, solutionCost: 767, annualSaving: 539, cumulativeSaving: 1_019 },
    { year: 3, utilityCost: 1_384, ufmsCharge: 674, residualGridCost: 138, solutionCost: 813, annualSaving: 572, cumulativeSaving: 1_591 },
    { year: 4, utilityCost: 1_467, ufmsCharge: 715, residualGridCost: 147, solutionCost: 861, annualSaving: 606, cumulativeSaving: 2_197 },
    { year: 5, utilityCost: 1_555, ufmsCharge: 757, residualGridCost: 156, solutionCost: 913, annualSaving: 642, cumulativeSaving: 2_840 },
    { year: 6, utilityCost: 1_649, ufmsCharge: 803, residualGridCost: 165, solutionCost: 968, annualSaving: 681, cumulativeSaving: 3_520 },
    { year: 7, utilityCost: 1_748, ufmsCharge: 851, residualGridCost: 175, solutionCost: 1_026, annualSaving: 722, cumulativeSaving: 4_242 },
    { year: 8, utilityCost: 1_853, ufmsCharge: 902, residualGridCost: 185, solutionCost: 1_087, annualSaving: 765, cumulativeSaving: 5_007 },
    { year: 9, utilityCost: 1_964, ufmsCharge: 956, residualGridCost: 196, solutionCost: 1_153, annualSaving: 811, cumulativeSaving: 5_818 },
    { year: 10, utilityCost: 2_082, ufmsCharge: 1_014, residualGridCost: 208, solutionCost: 1_222, annualSaving: 860, cumulativeSaving: 6_678 },
  ]);
  assert.equal(forecast.rows[1].utilityCost, Math.round(1_200 * 1.0883));
});

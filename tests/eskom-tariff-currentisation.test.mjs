import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  currentiseEskomBill,
  matchEskomTariff,
} from "../lib/eskom-tariff-currentisation.ts";
import {
  aggregateUtilityBills,
  analyseUtilityBillText,
  canonicaliseUtilityBillAnalyses,
} from "../lib/utility-bill-analysis.ts";
import catalogue from "../lib/tariffs/eskom-2026-27.json" with { type: "json" };

const workspace = new URL("../../", import.meta.url);
const seokasText = readFileSync(new URL("_extract/text/1._Onboarding_1._Seokas_Bottle_Store_Null_5114984798_511451138556.pdf.txt", workspace), "utf8");
const ratangText = readFileSync(new URL("_extract/text/1._Onboarding_6._Ratang_Liquor_Null_Retang_Liquor_Folder_Documents_Eskom_January_Invoice.pdf.txt", workspace), "utf8");
const primoText = readFileSync(new URL("_extract/text/1._Onboarding_8._Primo_Poultry_20_08_2025_Site_2_Eskom_.pdf.txt", workspace), "utf8");

test("catalogue preserves exact approved current and prior Eskom rates", () => {
  const currentBusinessrate = catalogue.flatTariffs.find((variant) => variant.billCode === "B101N");
  const priorBusinessrate = catalogue.historicalReference.flatTariffs.find((variant) => variant.billCode === "B101N");
  const currentRuraflex = catalogue.ruraflex.variants.find((variant) => variant.billCode === "Ru01N");
  const priorRuraflex = catalogue.historicalReference.ruraflex.variants.find((variant) => variant.billCode === "Ru01N");

  assert.equal(currentBusinessrate.ratesExVat.energyCentsPerKwh, 242.9);
  assert.equal(currentBusinessrate.ratesExVat.networkCapacityRandPerPodDay, 22.12);
  assert.equal(currentBusinessrate.ratesExVat.generationCapacityRandPerPodDay, 3);
  assert.equal(priorBusinessrate.ratesExVat.networkCapacityRandPerPodDay, 20.34);
  assert.equal(currentRuraflex.ratesExVat.highSeasonCentsPerKwh.peak, 746.19);
  assert.equal(priorRuraflex.ratesExVat.highSeasonCentsPerKwh.peak, 690.99);
});

test("historical Businessrate bill rates identify B101N and reprice every standard line", () => {
  const analysis = analyseUtilityBillText(seokasText, { analysedAt: "2026-03-01T00:00:00.000Z" });
  const match = matchEskomTariff(analysis);
  const currentised = currentiseEskomBill(analysis);

  assert.equal(match.status, "matched");
  assert.equal(match.variant.billCode, "B101N");
  assert.equal(currentised.status, "currentised");
  assert.equal(currentised.unpricedHistoricalExVat, 0);
  assert.equal(currentised.currentisedKnownTotalExVat, 38_123.22);
  assert.equal(currentised.currentisedAddressableExVat, 36_931.03);
  assert.equal(currentised.currentisedResidualExVat, 1_192.19);
  assert.equal(analysis.totalChargesExVat, 35_252.9);
});

test("historical Landrate bill rates identify L101N and keep fixed rural charges visible", () => {
  const analysis = analyseUtilityBillText(ratangText, { analysedAt: "2026-03-01T00:00:00.000Z" });
  const match = matchEskomTariff(analysis);
  const currentised = currentiseEskomBill(analysis);

  assert.equal(match.status, "matched");
  assert.equal(match.variant.billCode, "L101N");
  assert.equal(currentised.status, "currentised");
  assert.equal(currentised.unpricedHistoricalExVat, 0);
  assert.ok(currentised.currentisedResidualExVat > 3_000);
  assert.ok(currentised.currentisedKnownTotalExVat > analysis.totalChargesExVat);
});

test("Ruraflex history identifies the exact zone/voltage variant but refuses a rebilled bill as complete", () => {
  const analysis = analyseUtilityBillText(primoText, { analysedAt: "2026-03-01T00:00:00.000Z" });
  const match = matchEskomTariff(analysis);
  const currentised = currentiseEskomBill(analysis);

  assert.equal(match.status, "matched");
  assert.equal(match.variant.billCode, "Ru01N");
  assert.equal(currentised.status, "partial");
  assert.ok(currentised.currentisedKnownTotalExVat > 0);
  assert.ok(currentised.unpricedHistoricalExVat > 0);
  assert.ok(currentised.warnings.some((warning) => warning.includes("not included")));
});

test("an exact context can resolve a variant even when bill rates are absent", () => {
  const analysis = analyseUtilityBillText(seokasText);
  analysis.chargeLines = [];
  const ambiguous = matchEskomTariff(analysis);
  const exact = matchEskomTariff(analysis, { billCode: "B101N" });

  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(exact.status, "matched");
  assert.equal(exact.variant.billCode, "B101N");
});

test("portfolio keeps historical bills separate and aggregates only complete current tariff matches", () => {
  const analyses = ["October", "November", "December", "January", "February", "March"].map((month) => {
    const fileName = `1._Onboarding_6._Ratang_Liquor_Null_Retang_Liquor_Folder_Documents_Eskom_${month}_Invoice.pdf.txt`;
    return analyseUtilityBillText(readFileSync(new URL(`_extract/text/${fileName}`, workspace), "utf8"), { fileName });
  });
  const canonicalAnalyses = canonicaliseUtilityBillAnalyses(analyses);
  const currentisedBills = canonicalAnalyses.map((analysis) => ({
    sourceHash: analysis.sourceHash,
    ...currentiseEskomBill(analysis),
  }));
  const portfolio = aggregateUtilityBills(analyses, "2026-07-09T00:00:00.000Z", { currentisedBills });

  assert.equal(portfolio.currentTariff.status, "currentised");
  assert.equal(portfolio.currentTariff.matchedPeriodCount, 6);
  assert.equal(portfolio.currentTariff.unpricedHistoricalMonthlyExVat, 0);
  assert.equal(portfolio.currentTariff.averageMonthlySpendExVat, 17_374.81);
  assert.notEqual(portfolio.currentTariff.averageMonthlySpendExVat, portfolio.averageMonthlySpendExVat);
  assert.equal(portfolio.designBasis.periodStart, "2026-01-06");
  assert.equal(portfolio.designBasis.approvedCurrent.status, "currentised");
  assert.equal(portfolio.designBasis.approvedCurrent.monthlyEquivalentSpendExVat, 24_085.13);
  assert.equal(portfolio.designBasis.approvedCurrent.monthlyEquivalentAddressableExVat, 21_089.83);
  assert.equal(portfolio.designBasis.approvedCurrent.monthlyEquivalentResidualExVat, 2_995.29);
  assert.match(portfolio.currentTariff.sourceUrl, /eskom/i);
});

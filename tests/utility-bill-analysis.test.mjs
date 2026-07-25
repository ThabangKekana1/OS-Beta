import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const {
  analyseUtilityBillText,
  aggregateUtilityBills,
  proposalReadiness,
} = await import("../lib/utility-bill-analysis.ts");

const workspaceRoot = join(process.cwd(), "..");
const extraction = (name) =>
  readFileSync(join(workspaceRoot, "_extract", "text", name), "utf8");

const SEOKAS = "1._Onboarding_1._Seokas_Bottle_Store_Null_5114984798_511451138556.pdf.txt";
const RATANG = "1._Onboarding_6._Ratang_Liquor_Null_Retang_Liquor_Folder_Documents_Eskom_January_Invoice.pdf.txt";
const RATANG_MONTHS = ["October", "November", "December", "January", "February", "March"];

function ratangFile(month) {
  return `1._Onboarding_6._Ratang_Liquor_Null_Retang_Liquor_Folder_Documents_Eskom_${month}_Invoice.pdf.txt`;
}

test("parses an Eskom Businessrate invoice without treating amount due as electricity cost", () => {
  const bill = analyseUtilityBillText(extraction(SEOKAS), {
    fileName: "seokas-february.pdf",
    analysedAt: "2026-07-09T00:00:00.000Z",
  });

  assert.equal(bill.status, "analysed");
  assert.equal(bill.provider, "Eskom");
  assert.equal(bill.accountNumber, "5114984798");
  assert.equal(bill.taxInvoiceNumber, "511451138556");
  assert.equal(bill.periodStart, "2026-01-26");
  assert.equal(bill.periodEnd, "2026-02-24");
  assert.equal(bill.billingDays, 29);
  assert.equal(bill.readType, "estimate");
  assert.equal(bill.tariffFamily, "Businessrate");
  assert.equal(bill.monthlyKwh, 13_961);
  assert.equal(bill.totalChargesExVat, 35_252.9);
  assert.equal(bill.vatAmount, 5_287.64);
  assert.equal(bill.totalChargesInclVat, 40_540.54);
  assert.equal(bill.totalAmountDue, 29_893.08);
  assert.notEqual(bill.totalChargesInclVat, bill.totalAmountDue);
  assert.equal(bill.chargeSummary.residualExVat, 1_073.58);
  assert.equal(bill.chargeSummary.addressableExVat, 34_179.32);
  assert.equal(bill.reconciled, true);
  assert.equal(bill.confidence, "high");
});

test("parses Landrate and preserves its much higher site-specific residual floor", () => {
  const bill = analyseUtilityBillText(extraction(RATANG), {
    fileName: "ratang-january.pdf",
  });

  assert.equal(bill.tariffFamily, "Landrate");
  assert.equal(bill.monthlyKwh, 4_674);
  assert.equal(bill.totalChargesExVat, 16_454.32);
  assert.equal(bill.chargeSummary.residualExVat, 3_039.94);
  assert.equal(bill.chargeSummary.addressableExVat, 13_414.38);
  assert.equal(bill.reconciled, true);
});

test("parses Ruraflex TOU buckets, fixed capacity, and conditional reactive energy", () => {
  const text = extraction("1._Onboarding_8._Primo_Poultry_20_08_2025_Site_2_Eskom_.pdf.txt");
  const bill = analyseUtilityBillText(text, { fileName: "primo-july.pdf" });

  assert.equal(bill.tariffFamily, "Ruraflex");
  assert.equal(bill.season, "high");
  assert.equal(bill.monthlyKwh, 18_471.81);
  assert.equal(bill.touKwh.peak, 3_061.17);
  assert.equal(bill.touKwh.standard, 7_445.06);
  assert.equal(bill.touKwh["off-peak"], 7_965.58);
  assert.equal(bill.demandKwKva, 74.29);
  assert.equal(bill.hasRebillOrCorrection, true);
  assert.equal(bill.reconciled, false);
  assert.ok(bill.chargeSummary.conditionalExVat > 0);
  assert.ok(bill.warnings.some((warning) => /rebill|correction|cancellation/i.test(warning)));
});

test("six periods aggregate by covered days and resolve an exact prior-invoice cancellation", () => {
  const bills = RATANG_MONTHS.map((month) =>
    analyseUtilityBillText(extraction(ratangFile(month)), { fileName: `${month}.pdf` }),
  );
  const portfolio = aggregateUtilityBills(bills, "2026-07-09T00:00:00.000Z");

  assert.equal(portfolio.sourceDocumentCount, 6);
  assert.equal(portfolio.uniquePeriodCount, 6);
  assert.equal(portfolio.accountNumbers.length, 1);
  assert.equal(portfolio.tariffFamilies.length, 1);
  assert.equal(portfolio.tariffFamilies[0], "Landrate");
  assert.equal(portfolio.averageMonthlyKwh, 4_632.43);
  assert.equal(portfolio.averageMonthlySpendExVat, 16_016.42);
  assert.ok(portfolio.blendedTariffExVat > 2);
  assert.equal(portfolio.formalProposalReady, false);
  assert.ok(!portfolio.blockers.some((blocker) => /rebill|correction|cancellation|overlap/i.test(blocker)));
  assert.equal(portfolio.periods[1].periodStart, "2025-10-03");
  assert.equal(portfolio.periods[1].billingDays, 31);
  assert.equal(portfolio.periods[1].monthlyKwh, 3_482);
  assert.equal(portfolio.periods[1].canonicalisation.method, "matched-prior-invoice-cancellation");
  assert.equal(portfolio.designBasis.periodStart, "2026-01-06");
  assert.equal(portfolio.designBasis.periodEnd, "2026-02-02");
  assert.equal(portfolio.designBasis.billingDays, 27);
  assert.equal(portfolio.designBasis.historical.billedSpendExVat, 19_711.56);
  assert.equal(portfolio.designBasis.historical.billedKwh, 6_027);
  assert.equal(portfolio.designBasis.historical.monthlyEquivalentSpendExVat, 22_220.68);
  assert.equal(portfolio.designBasis.historical.monthlyEquivalentKwh, 6_794.19);
  assert.ok(portfolio.esg.annualScope2EmissionsTonnes > 0);
  assert.match(portfolio.esg.scoreScope, /not a corporate ESG rating/i);
});

test("a non-exact rebill remains blocked for manual reconciliation", () => {
  const bills = RATANG_MONTHS.map((month) =>
    analyseUtilityBillText(extraction(ratangFile(month)), { fileName: `${month}.pdf` }),
  );
  const rebill = bills.find((bill) => bill.sourceFileName === "November.pdf");
  assert.ok(rebill?.hasRebillOrCorrection);
  rebill.reconciliationDifference += 5;

  const portfolio = aggregateUtilityBills(bills, "2026-07-09T00:00:00.000Z");
  const unresolved = portfolio.periods.find((period) => period.sourceHash === rebill.sourceHash);

  assert.equal(unresolved?.hasRebillOrCorrection, true);
  assert.equal(unresolved?.canonicalisation, undefined);
  assert.equal(portfolio.formalProposalReady, false);
  assert.ok(portfolio.blockers.some((blocker) => /rebill|correction|cancellation/i.test(blocker)));
});

test("highest-bill selection ignores amount due and keeps spend and kWh from one period", () => {
  const bills = RATANG_MONTHS.map((month) =>
    analyseUtilityBillText(extraction(ratangFile(month)), { fileName: `${month}.pdf` }),
  );
  bills[0] = { ...bills[0], totalAmountDue: 9_999_999 };
  const portfolio = aggregateUtilityBills(bills);

  assert.match(portfolio.designBasis.sourceFileName, /February/i);
  assert.equal(portfolio.designBasis.historical.billedSpendExVat, 19_711.56);
  assert.equal(portfolio.designBasis.historical.billedKwh, 6_027);
  assert.notEqual(portfolio.designBasis.historical.billedSpendExVat, bills[0].totalAmountDue);
});

test("highest-bill selection compares standard-month equivalents, not raw long-period totals", () => {
  const source = analyseUtilityBillText(extraction(RATANG), { fileName: "source.pdf" });
  const longPeriod = {
    ...source,
    sourceHash: "long-period",
    sourceFileName: "long-period.pdf",
    periodStart: "2025-01-01",
    periodEnd: "2025-03-02",
    billingDays: 60,
    monthlyKwh: 10_000,
    totalChargesExVat: 30_000,
    totalAmountDue: 30_000,
    reconciled: true,
    reconciliationDifference: 0,
    hasRebillOrCorrection: false,
  };
  const trueMonthlyPeak = {
    ...source,
    sourceHash: "true-monthly-peak",
    sourceFileName: "true-monthly-peak.pdf",
    periodStart: "2025-03-02",
    periodEnd: "2025-04-01",
    billingDays: 30,
    monthlyKwh: 6_000,
    totalChargesExVat: 20_000,
    totalAmountDue: 20_000,
    reconciled: true,
    reconciliationDifference: 0,
    hasRebillOrCorrection: false,
  };
  const portfolio = aggregateUtilityBills([longPeriod, trueMonthlyPeak]);

  assert.equal(portfolio.designBasis.sourceFileName, "true-monthly-peak.pdf");
  assert.equal(portfolio.designBasis.historical.billedKwh, 6_000);
  assert.equal(portfolio.designBasis.historical.monthlyEquivalentSpendExVat, 20_291.25);
  assert.ok(portfolio.designBasis.historical.monthlyEquivalentSpendExVat > 15_000);
});

test("deduplicates repeated invoice uploads and requires signed EOI independently", () => {
  const bill = analyseUtilityBillText(extraction(SEOKAS), { fileName: "original.pdf" });
  const duplicate = { ...bill, sourceFileName: "duplicate.pdf" };
  const portfolio = aggregateUtilityBills([bill, duplicate]);

  assert.equal(portfolio.recognisedDocumentCount, 2);
  assert.equal(portfolio.uniquePeriodCount, 1);
  assert.equal(portfolio.duplicateDocumentCount, 1);
  assert.equal(proposalReadiness(portfolio, false).ready, false);
  assert.match(proposalReadiness(portfolio, false).blockers[0], /signed post-assessment Foundation-1 Expression of Interest/i);
});

test("image-only or irrelevant documents are routed to manual review", () => {
  const bill = analyseUtilityBillText("scanned image with no extractable text", {
    fileName: "phone-photo.jpg",
  });

  assert.equal(bill.status, "manual-review");
  assert.equal(bill.confidence, "manual-review");
  assert.ok(bill.warnings.some((warning) => /OCR|manual review/i.test(warning)));
});

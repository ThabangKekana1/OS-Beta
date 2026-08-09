// Generate a REAL migration report from the real Primo (Metasapien) bill pack.
// analyse each bill -> aggregate portfolio -> buildF1Proposal -> house PDF.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const { analyseUtilityBillText, aggregateUtilityBills } = await import("../lib/utility-bill-analysis.ts");
const { buildF1Proposal } = await import("../lib/f1-proposal.ts");
const { buildMigrationProposalPdf, migrationProposalPdfFilename } = await import("../lib/migration-proposal-pdf.ts");

const extractDir = new URL("../../_extract/text/", import.meta.url);
const AT = new Date().toISOString();
const files = readdirSync(extractDir).filter((f) => f.startsWith("1._Onboarding_8._Primo_Poultry") && f.includes("Eskom") || f.startsWith("1._Onboarding_8._Primo_Poultry") && f.includes("Site"));
const billFiles = files.filter((f) => !f.includes("EOI"));
console.log("bills found:", billFiles.length);

const analyses = billFiles.map((f) =>
  analyseUtilityBillText(readFileSync(new URL(f, extractDir), "utf8"), { fileName: f, sourceHash: f, analysedAt: AT }),
);
const portfolio = aggregateUtilityBills(analyses, AT);
console.log("periods recognised:", portfolio.recognisedPeriodCount ?? portfolio.periods?.length, "| covered days:", portfolio.coveredDays);
console.log("avg monthly kWh:", Math.round(portfolio.averageMonthlyKwh ?? 0), "| avg monthly spend:", Math.round(portfolio.averageMonthlySpendExVat ?? portfolio.averageMonthlySpend ?? 0));

const proposal = buildF1Proposal({
  businessName: "Metasapien (Pty) Ltd",
  contactName: "Karman Kekana",
  // The bills ARE the site: this pack is the Vredefort (Free State) Eskom
  // account, so the design uses the bills' true location — founder confirmed.
  province: "Free State",
  siteCity: "Vredefort",
  monthlySpend: portfolio.averageMonthlySpendExVat ?? undefined,
  monthlyKwh: portfolio.averageMonthlyKwh ?? undefined,
  billPortfolio: portfolio,
  businessLoadProfile: "continuous",
});
// ---- FUNDER PREDICTION (engine v3): the numbers Nedbank / Green Share would
// actually issue for this case. Founder directive: the client-facing pathway
// figures must be exactly these, not the internal design-basis economics.
const { predictFunderQuote, predictWheelingQuote, predictCombined, tenYearSeries } = await import("../lib/pricing-engine.ts");
const fpMonthlyKwh = portfolio.averageMonthlyKwh;
const fpMonthlySpend = portfolio.averageMonthlySpendExVat ?? portfolio.averageMonthlySpend;
const fpInput = {
  monthlySpend: fpMonthlySpend,
  monthlyKwh: fpMonthlyKwh,
  tariffStructure: "time-of-use", // Ruraflex is a time-of-use tariff
  distributor: "eskom-direct",
};
const fpQuote = predictFunderQuote({ monthlyKwh: fpMonthlyKwh, tariffStructure: fpInput.tariffStructure });
const fpWheeling = predictWheelingQuote(fpInput);
const fpCombined = predictCombined(fpInput);
const fpSeries = tenYearSeries(fpInput);

// Founder-directive comparison series (cumulative annual rand, 10 years):
// Eskom baseline at 13%/yr increases, and Nightshade (asset finance) as the
// flat funder AF payment plus retained grid charges escalating at 13%.
const ESKOM_13 = 0.13;
const cumul13 = (yearOneAnnual) => {
  const out = [];
  let total = 0;
  for (let year = 0; year < 10; year += 1) {
    total += yearOneAnnual * (1 + ESKOM_13) ** year;
    out.push(Math.round(total));
  }
  return out;
};
const fpEskom13 = cumul13(fpMonthlySpend * 12);
const fpRetainedMonthly = fpMonthlySpend * fpSeries.assumptions.residualBillShare;
const fpRetained13 = cumul13(fpRetainedMonthly * 12);
const fpNightshade = fpRetained13.map((retained, index) =>
  Math.round(fpQuote.assetFinanceMonthly * 12 * (index + 1) + retained));

// The exact display figures the report headlines ("as the funding partners
// would issue it"), so downstream mappers project rather than recompute.
const round2 = (value) => Math.round(value * 100) / 100;
const ufmsAllIn = fpQuote.ufmsMonthly + fpRetainedMonthly;
const afAllIn = fpQuote.assetFinanceMonthly + fpRetainedMonthly;
proposal.funderPrediction = {
  quote: fpQuote,
  wheeling: fpWheeling,
  combined: fpCombined,
  tenYearSeries: fpSeries,
  eskom13: fpEskom13,
  nightshade: fpNightshade,
  eskom13Escalation: ESKOM_13,
  issued: {
    sizing: { pvKwp: fpQuote.pvKwp, pcsKw: fpQuote.pcsKw, bessKwh: fpQuote.bessKwh },
    ufmsMonthly: fpQuote.ufmsMonthly,
    ufmsMonthlyBand: fpQuote.ufmsMonthlyBand,
    ufmsEscalation: fpQuote.ufmsEscalation,
    termMonths: fpQuote.termMonths,
    retainedGridMonthly: round2(fpRetainedMonthly),
    ufmsAllInMonthly: round2(ufmsAllIn),
    ufmsMonthlySaving: round2(fpMonthlySpend - ufmsAllIn),
    ufmsSavingPct: round2((fpMonthlySpend - ufmsAllIn) / fpMonthlySpend),
    ufmsTenYearMovement: fpEskom13[9] - fpSeries.ufms[9],
    wheelingTenYearMovement: fpEskom13[9] - fpSeries.wheeling[9],
    combinedTenYearMovement: fpEskom13[9] - fpSeries.combined[9],
    assetFinanceMonthly: fpQuote.assetFinanceMonthly,
    assetFinanceAllInMonthly: round2(afAllIn),
    assetFinanceMonthlySaving: round2(fpMonthlySpend - afAllIn),
    assetFinanceSavingPct: round2((fpMonthlySpend - afAllIn) / fpMonthlySpend),
    nightshadeTenYearMovement: fpEskom13[9] - fpNightshade[9],
  },
};
console.log("funder prediction:", JSON.stringify({
  sizing: proposal.funderPrediction.issued.sizing,
  ufmsMonthly: fpQuote.ufmsMonthly,
  assetFinanceMonthly: fpQuote.assetFinanceMonthly,
  wheelingMonthly: fpWheeling.monthlyCost,
  combinedMonthly: fpCombined.monthlyCost,
  tenYearTotals: {
    eskom13: fpEskom13[9], ufms: fpSeries.ufms[9], wheeling: fpSeries.wheeling[9],
    nightshade: fpNightshade[9], combined: fpSeries.combined[9],
  },
}));

const summary = {
  currentMonthlyCostExVat: proposal.summary?.currentMonthlyCostExVat,
  solutionMonthlyCostExVat: proposal.summary?.solutionMonthlyCostExVat,
  yearOneMonthlyDifference: proposal.summary?.yearOneMonthlyDifference,
  tenYearDifference: proposal.summary?.tenYearDifference,
};
console.log("summary:", JSON.stringify(summary));
console.log("top-level keys:", Object.keys(proposal).join(", "));

writeFileSync("/tmp/metasapien_proposal.json", JSON.stringify(proposal, null, 1));
console.log("proposal JSON: /tmp/metasapien_proposal.json");
const rendered = buildMigrationProposalPdf(proposal);
const out = "/Users/straylight/Desktop/Metasapien_Migration_Report_DRAFT.pdf";
writeFileSync(out, Buffer.from(rendered.bytes));
console.log("pages:", rendered.pageCount ?? "?", "| written:", out);
// print the exact 8 upload-form numbers the founder needs
const c = proposal.commercial ?? {};
const audit = proposal.billAudit ?? {};
console.log("UPLOAD-FORM NUMBERS:");
console.log(JSON.stringify({
  ufms: proposal.ufmsOption?.monthlyCharge,
  currentMonthly: proposal.calculationBasis?.monthlySpendExVat ?? audit.monthlyEquivalentSpendExVat,
  yearOne: proposal.ufmsOption?.yearOneMonthlySaving,
  tenYear: proposal.tenYearComparison?.ufmsSavingTotal,
  provider: audit.provider, tariffs: audit.tariffNames,
  periods: audit.recognisedPeriodCount, days: audit.coveredDays,
}, null, 1));

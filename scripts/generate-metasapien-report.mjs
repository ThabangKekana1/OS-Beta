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
const summary = {
  currentMonthlyCostExVat: proposal.summary?.currentMonthlyCostExVat,
  solutionMonthlyCostExVat: proposal.summary?.solutionMonthlyCostExVat,
  yearOneMonthlyDifference: proposal.summary?.yearOneMonthlyDifference,
  tenYearDifference: proposal.summary?.tenYearDifference,
};
console.log("summary:", JSON.stringify(summary));
console.log("top-level keys:", Object.keys(proposal).join(", "));

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

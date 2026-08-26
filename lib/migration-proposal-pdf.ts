import { jsPDF } from "jspdf";
import type { F1Proposal } from "@/lib/f1-proposal";
import { sanitizeFileSegment } from "@/lib/download-utils";
import { ONSITE_INCLUSIONS } from "@/lib/report-pack-core";
import type { UtilityTariffHistoryRow } from "@/lib/proposal-impact-model";
import {
  KIT_COLORS,
  KIT_INK,
  KIT_PAGE,
  addKitPage,
  blend,
  chipRow,
  coverPage,
  darkCallout,
  dataTable,
  drawText,
  footerBand,
  hairline,
  inkTint,
  keyValueRows,
  kitLongDate,
  monoLabel,
  panel,
  accentBar,
  paragraph,
  sourceNote,
  stageJourney,
  statStrip,
  type KitStatCell,
} from "@/lib/document-kit";

// =============================================================================
// Foundation-1 migration proposal, print layer. House document design system:
// every piece of chrome comes from lib/document-kit.ts.
//
// Client-facing partner rule: no funder or partner is ever named. The funded
// system is "the funded system", the capital provider is "the funder", the
// wheeled supply comes from "the wheeled-energy provider".
// =============================================================================

type Pdf = jsPDF;

function money(value: number) {
  const absolute = Math.abs(Math.round(value)).toLocaleString("en-US");
  return `${value < 0 ? "-" : ""}R${absolute}`;
}

function compactMoney(value: number) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${sign}R${(absolute / 1_000_000).toFixed(2)}m`;
  if (absolute >= 100_000) return `${sign}R${Math.round(absolute / 1_000).toLocaleString("en-US")}k`;
  return `${sign}R${Math.round(absolute).toLocaleString("en-US")}`;
}

function units(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function decimal(value: number, digits = 2) {
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function hasPositiveCommercialCase(proposal: F1Proposal) {
  const monthlyDifference = proposal.billAwareEconomics?.yearOne.saving
    ?? proposal.ufmsOption.monthlySaving;
  return monthlyDifference > 0 && proposal.tenYearComparison.ufmsSaving > 0;
}

/** Overflow handler shared by long tables: fresh page, continuation header. */
function continuation(pdf: Pdf, eyebrowText: string, title: string, context: string) {
  return () => addKitPage(pdf, { eyebrow: eyebrowText, title, context });
}

// --------------------------------------------------------------------- cover

function buildCover(pdf: Pdf, proposal: F1Proposal) {
  const audit = proposal.billAudit;
  const economics = proposal.billAwareEconomics;
  const supported = hasPositiveCommercialCase(proposal);
  const current = audit?.averageMonthlySpendExVat ?? economics?.yearOne.currentUtilityCost ?? proposal.profile.monthlySpend;
  const yearOne = economics?.yearOne.saving ?? proposal.ufmsOption.monthlySaving;
  const solution = economics?.yearOne.solutionCost ?? current - yearOne;
  const tenYear = economics?.tenYear.saving ?? proposal.tenYearComparison.ufmsSaving;
  const generatedDate = kitLongDate(proposal.generatedAt);
  const siteLine = [proposal.site.city, proposal.site.province].filter(Boolean).join(", ");

  // KEY FIGURES: page one mirrors the operator upload form field-for-field
  // (founder direction 2026-08-09): read the numbers, type them in, submit.
  const keyFigures: KitStatCell[] = [
    { value: money(current), label: "Current monthly cost ex VAT" },
    { value: money(solution), label: "Solution monthly cost ex VAT" },
    { value: money(yearOne), label: "Year-one monthly movement", accent: supported ? KIT_COLORS.amber : KIT_COLORS.red },
    { value: compactMoney(tenYear), label: "Ten-year movement" },
  ];
  const truncate = (value: string, length: number) => (value.length > length ? `${value.slice(0, length - 1)}…` : value);
  const evidenceFigures: KitStatCell[] = [
    { value: truncate(audit?.provider ?? "Pending", 22), label: "Utility provider" },
    { value: truncate((audit?.tariffNames ?? []).join(", ") || "Pending", 22), label: "Tariff names" },
    { value: audit ? String(audit.uniquePeriodCount) : "Pending", label: "Billing periods audited" },
    { value: audit ? String(audit.coveredDays) : "Pending", label: "Days covered" },
  ];

  coverPage(pdf, {
    contextRight: `BILL-AUDITED · ${generatedDate.toUpperCase()}`,
    eyebrow: "FOUNDATION-1 · MIGRATION PROPOSAL · BILL-AUDITED",
    titleLine1: "Audited to the cent,",
    titleLine2: "ready to decide.",
    lead: `The formal migration proposal for ${proposal.businessName}, built line by line from the audited utility bills by the Foundation-1 Machine Intelligence. The funded system is engineered and installed at no cost to you: you pay nothing until the new power is live.`,
    subject: proposal.businessName,
    subjectDetail: [siteLine || null, proposal.clientProfileId ? `Profile ${proposal.clientProfileId}` : null, generatedDate]
      .filter(Boolean)
      .join(" · "),
    chips: [
      { text: audit ? `${audit.uniquePeriodCount} billing periods audited` : "Bill audit pending", tone: "cyan" },
      { text: supported ? "Commercial case supported" : "Commercial gaps identified", tone: "neutral" },
    ],
    stats: keyFigures,
    statsSecondary: evidenceFigures,
    sourceNote: `Generated ${generatedDate} · Bill-audited pre-engineering assessment, not a formal credit offer. Interval engineering validates yield, dispatch and final terms before the term sheet. All figures exclude VAT unless stated.`,
  });
}

// ------------------------------------------------------------ decision brief

function decisionPage(pdf: Pdf, proposal: F1Proposal, context: string) {
  let y = addKitPage(pdf, { eyebrow: "DECISION BRIEF · WHAT THE BILLS SUPPORT", title: "The case at a glance.", context });
  const economics = proposal.billAwareEconomics;
  const current = economics?.yearOne.currentUtilityCost ?? proposal.profile.monthlySpend;
  const solution = economics?.yearOne.solutionCost ?? current - proposal.ufmsOption.monthlySaving;
  const saving = economics?.yearOne.saving ?? proposal.ufmsOption.monthlySaving;
  const supported = hasPositiveCommercialCase(proposal);

  y = statStrip(pdf, y, 23.3, [
    { value: money(current), label: "Current utility path · monthly" },
    { value: money(solution), label: "Complete solution path · monthly" },
    { value: money(Math.abs(saving)), label: supported ? "Modelled monthly reduction" : "Modelled monthly premium", accent: supported ? KIT_COLORS.green : KIT_COLORS.red },
    { value: compactMoney(Math.abs(proposal.tenYearComparison.ufmsSaving)), label: supported ? "Ten-year reduction" : "Ten-year premium", accent: KIT_COLORS.amber },
  ]);
  y += 7;

  const verdict = supported
    ? `The bill pack and the dispatch model support a ${money(saving)} monthly reduction on the selected design period, ${decimal(Math.abs((saving / Math.max(1, current)) * 100), 1)} percent of the current bill. Interval engineering must validate generation, battery dispatch and imported-energy displacement before this becomes a formal offer.`
    : `The completed bill audit identifies a ${money(Math.abs(saving))} monthly premium on the selected design period. The proposal remains complete as a gap report; the recorded Expression of Interest keeps the case open for reassessment without accepting this configuration.`;
  y = darkCallout(pdf, y, 30, { eyebrow: "Foundation-1 view", title: supported ? "The commercial case is supported." : "A commercial gap is identified.", body: verdict });
  y += 9;

  monoLabel(pdf, "PROPOSED ARCHITECTURE · DESIGNED FOR THE HIGH-LOAD MONTH", KIT_PAGE.margin, y);
  y += 3;
  y = keyValueRows(pdf, y, [
    { label: "Solar array", value: `${proposal.ufmsOption.sizing.pvKwp} kWp` },
    { label: "Power conversion", value: `${proposal.ufmsOption.sizing.pcsKw} kW power conversion system` },
    { label: "Battery storage", value: `${proposal.ufmsOption.sizing.bessKwh} kWh` },
    { label: "Planning yield", value: proposal.solarYield ? `${units(proposal.solarYield.averageMonthlyGenerationKwh)} kWh a month` : "Pending" },
    { label: "Onsite energy to load", value: `${units(proposal.ufmsOption.dispatch.onsiteToLoadKwh)} kWh a month · ${decimal(proposal.ufmsOption.dispatch.onsiteCoveragePct, 1)}%` },
    { label: "Residual grid import", value: `${units(proposal.ufmsOption.dispatch.residualGridKwh)} kWh a month` },
  ]);
  y += 8;
  sourceNote(pdf, proposal.disclaimer, y);
}

// ---------------------------------------------------------------- evidence

function evidencePage(pdf: Pdf, proposal: F1Proposal, context: string) {
  let y = addKitPage(pdf, { eyebrow: "MACHINE INTELLIGENCE · BILL EVIDENCE", title: "What the bills actually say.", context, tone: KIT_COLORS.cyan });
  if (proposal.calculationBasis) {
    monoLabel(pdf, "DESIGN BASIS · THE SELECTED PERIOD", KIT_PAGE.margin, y);
    y += 3;
    y = keyValueRows(pdf, y, [
      { label: "Selected period", value: `${proposal.calculationBasis.periodStart} to ${proposal.calculationBasis.periodEnd}` },
      { label: "Actual period", value: `${money(proposal.calculationBasis.historical.billedSpendExVat)} · ${units(proposal.calculationBasis.historical.billedKwh)} kWh` },
      { label: "Standard month", value: `${money(proposal.calculationBasis.historical.monthlyEquivalentSpendExVat)} · ${units(proposal.calculationBasis.historical.monthlyEquivalentKwh)} kWh` },
      { label: "Approved-current baseline", value: proposal.calculationBasis.approvedCurrent?.monthlyEquivalentSpendExVat == null ? "Not available" : money(proposal.calculationBasis.approvedCurrent.monthlyEquivalentSpendExVat) },
      { label: "Meter evidence", value: `${proposal.calculationBasis.readType} · ${proposal.calculationBasis.billingDays} service days` },
    ]);
    y += 4;
    y = paragraph(pdf, proposal.calculationBasis.explanation, KIT_PAGE.margin, y, { size: 8, color: inkTint(KIT_INK.body) }, KIT_PAGE.contentWidth, { lineHeight: 4.1 });
    y += 7;
  }
  if (proposal.billAudit) {
    monoLabel(pdf, `BILL AUDIT · ${proposal.billAudit.uniquePeriodCount} PERIODS · ${proposal.billAudit.coveredDays} DAYS`, KIT_PAGE.margin, y);
    y += 3;
    y = keyValueRows(pdf, y, [
      { label: "Utility and tariff", value: `${proposal.billAudit.provider} · ${proposal.billAudit.tariffNames.join(", ")}` },
      { label: "Average usage", value: `${units(proposal.billAudit.averageMonthlyKwh)} kWh a month` },
      { label: "Historical average", value: `${money(proposal.billAudit.averageMonthlySpendExVat)} a month ex VAT` },
      { label: "Blended tariff", value: `R${decimal(proposal.billAudit.blendedTariffExVat)} per kWh ex VAT` },
      { label: "Actual-read share", value: `${Math.round(proposal.billAudit.actualReadShare * 100)}%` },
      { label: "Analysis confidence", value: proposal.billAudit.confidence },
    ]);
    y += 8;
    if (proposal.billAudit.warnings.length) {
      monoLabel(pdf, "EVIDENCE NOTICES · WHAT STILL NEEDS ATTENTION", KIT_PAGE.margin, y, { color: blend(KIT_COLORS.amber, 0.78) });
      y += 5;
      for (const warning of proposal.billAudit.warnings) {
        drawText(pdf, "·", KIT_PAGE.margin + 0.7, y, { weight: "bold", size: 8, color: inkTint(KIT_INK.ghost) });
        y = paragraph(pdf, warning, KIT_PAGE.margin + 4.9, y, { size: 8, color: inkTint(KIT_INK.dim) }, KIT_PAGE.contentWidth - 4.9, { lineHeight: 4 });
        y += 1.6;
      }
    }
  }
  if (!proposal.calculationBasis && !proposal.billAudit) {
    paragraph(
      pdf,
      "No audited bill pack is attached to this case yet. The figures in this proposal are built from the stated monthly spend; the secure bill assessment replaces every assumption with the exact supplier tariff, consumption and charges.",
      KIT_PAGE.margin,
      y,
      { size: 8.8, color: inkTint(KIT_INK.body) },
      KIT_PAGE.contentWidth,
      { lineHeight: 4.6 },
    );
  }
}

// ------------------------------------------------------------ commercial fit

function commercialFitPage(pdf: Pdf, proposal: F1Proposal, context: string) {
  const fit = proposal.commercialFit;
  if (!fit) return;
  let y = addKitPage(pdf, { eyebrow: "COMMERCIAL FIT · PACKAGE TEST", title: "Does the load fit a package?", context });
  const gapTone = fit.belowCommercialMinimum || fit.aboveStandardMaximum;
  y = statStrip(pdf, y, 23.3, [
    { value: `${decimal(fit.requiredPvKwp, 1)} kWp`, label: "Load-supported size" },
    { value: `${fit.selectedPvKwp} kWp`, label: `Selected package · smallest evidenced ${fit.minimumCommercialPvKwp} kWp` },
    { value: `${fit.sizeVariancePct >= 0 ? "+" : ""}${decimal(fit.sizeVariancePct, 1)}%`, label: gapTone ? "Size variance · commercial gap" : "Size variance · within range", accent: gapTone ? KIT_COLORS.red : KIT_COLORS.green },
  ]);
  y += 7;
  y = keyValueRows(pdf, y, [
    { label: "Fit status", value: fit.status.replace(/-/g, " ") },
    { label: "Bill-backed monthly use", value: `${units(fit.monthlyConsumptionKwh)} kWh` },
    { label: "Selected planning generation", value: `${units(fit.selectedMonthlyGenerationKwh)} kWh a month` },
    { label: "Generation variance", value: `${fit.generationGapKwh >= 0 ? "+" : ""}${units(fit.generationGapKwh)} kWh a month` },
    { label: "Planning coverage", value: `${decimal(fit.generationCoveragePct, 1)}%` },
    { label: "Standard package range", value: `${fit.minimumCommercialPvKwp} to ${fit.maximumStandardPvKwp} kWp` },
  ]);
  y += 7;

  const messageLines = Math.max(2, Math.ceil(fit.message.length / 105));
  const panelHeight = 12 + messageLines * 4.1;
  panel(pdf, KIT_PAGE.margin, y, KIT_PAGE.contentWidth, panelHeight);
  accentBar(pdf, KIT_PAGE.margin, y, panelHeight, gapTone ? KIT_COLORS.red : KIT_COLORS.green);
  monoLabel(pdf, gapTone ? "PACKAGE GAP" : "PACKAGE FIT", KIT_PAGE.margin + 5.6, y + 6.4, { color: blend(gapTone ? KIT_COLORS.red : KIT_COLORS.green, 0.85, KIT_COLORS.panel), size: 6.2 });
  paragraph(pdf, fit.message, KIT_PAGE.margin + 5.6, y + 11.6, { size: 8.2, color: inkTint(KIT_INK.body, KIT_COLORS.panel) }, KIT_PAGE.contentWidth - 11.2, { lineHeight: 4.1 });
  y += panelHeight + 9;

  const economics = proposal.billAwareEconomics;
  if (economics) {
    monoLabel(pdf, "ECONOMIC TEST · WHAT THE PACKAGE DOES TO THE BILL", KIT_PAGE.margin, y);
    y += 3;
    const monthlyDifference = economics.yearOne.saving;
    const tenYearDifference = economics.tenYear.saving;
    keyValueRows(pdf, y, [
      { label: "Approved-current utility path", value: `${money(economics.yearOne.currentUtilityCost)} a month` },
      { label: "Complete solution path", value: `${money(economics.yearOne.solutionCost)} a month` },
      { label: monthlyDifference >= 0 ? "Monthly reduction" : "Monthly premium", value: money(Math.abs(monthlyDifference)) },
      { label: tenYearDifference >= 0 ? "Ten-year reduction" : "Ten-year premium", value: money(Math.abs(tenYearDifference)) },
      { label: "Proposal disposition", value: hasPositiveCommercialCase(proposal) ? "Proceed to verification and formal terms" : "Retain for gap reassessment", strong: true },
    ]);
  }
}

// -------------------------------------------------------- migration waterfall

function waterfallPage(pdf: Pdf, proposal: F1Proposal, context: string) {
  let y = addKitPage(pdf, { eyebrow: "MIGRATION WATERFALL · HONEST ACCOUNTING", title: "Every unit is assigned once.", context });
  const dispatch = proposal.ufmsOption.dispatch;
  const combined = proposal.lumenCombined;
  y = statStrip(pdf, y, 23.3, [
    { value: `${decimal(dispatch.onsiteCoveragePct, 1)}%`, label: "Onsite share · solar and battery", accent: KIT_COLORS.amber },
    { value: `${units(dispatch.residualGridKwh)} kWh`, label: "Grid residual after onsite dispatch" },
    { value: combined ? `${units(combined.wheeledResidualKwh)} kWh` : "Screen only", label: "Residual wheeled · never onsite units", accent: KIT_COLORS.cyan },
  ]);
  y += 8;

  monoLabel(pdf, "ENERGY WATERFALL · MONTHLY UNITS", KIT_PAGE.margin, y);
  y += 2;
  const energyRows: Array<[string, number]> = [
    ["Business load", dispatch.monthlyLoadKwh],
    ["Solar generation", dispatch.solarGenerationKwh],
    ["Direct solar to load", dispatch.directSolarToLoadKwh],
    ["Battery to load", dispatch.batteryToLoadKwh],
    ["Onsite energy delivered", dispatch.onsiteToLoadKwh],
    ["Residual grid import", dispatch.residualGridKwh],
    ["Residual energy wheeled", combined?.wheeledResidualKwh ?? 0],
    ["Residual utility commodity energy", combined?.eskomResidualKwh ?? dispatch.residualGridKwh],
  ];
  y = dataTable(pdf, y, energyRows, [
    { label: "Energy step", width: 118, strong: true, value: (row) => row[0] },
    { label: "Monthly kWh", width: 56, align: "right", value: (row) => units(row[1]) },
  ], { fontSize: 7.6 });
  y += 8;

  monoLabel(pdf, "CHARGE WATERFALL · WHAT REMAINS PAYABLE", KIT_PAGE.margin, y);
  y += 2;
  const economics = proposal.billAwareEconomics;
  const baseline = economics?.yearOne.currentUtilityCost ?? proposal.profile.monthlySpend;
  const chargeRows: Array<[string, number]> = [
    ["Current utility bill", baseline],
    ["Funded-system charge", proposal.ufmsOption.monthlyCharge],
    ["Retained grid charges after onsite supply", proposal.ufmsOption.chargeWaterfall.retainedAfterUfms.total],
    ["Residual wheeling charge", combined?.wheelingMonthlyCharge ?? 0],
    ["Complete combined path", combined?.monthlyCost ?? proposal.ufmsOption.monthlyCharge + proposal.ufmsOption.chargeWaterfall.retainedAfterUfms.total],
  ];
  y = dataTable(pdf, y, chargeRows, [
    { label: "Rand step", width: 118, strong: true, value: (row) => row[0] },
    { label: "Month one · ex VAT", width: 56, align: "right", value: (row) => money(row[1]) },
  ], { fontSize: 7.6 });
  y += 6;
  sourceNote(pdf, combined?.note ?? proposal.wheelingOption.note, y);
}

// ------------------------------------------------------------------ economics

function economicsPage(pdf: Pdf, proposal: F1Proposal, context: string) {
  const economics = proposal.billAwareEconomics;
  if (!economics) return;
  let y = addKitPage(pdf, { eyebrow: "ECONOMICS · TEN-YEAR COST PATH", title: "Ten years, both paths priced.", context });
  const rows = economics.tenYear.rows;
  y = dataTable(pdf, y, rows, [
    { label: "Year", width: 18, strong: true, value: (row) => String(row.year) },
    { label: "Utility path", width: 34, align: "right", value: (row) => money(row.utilityCost) },
    { label: "Funded system", width: 32, align: "right", value: (row) => money(row.ufmsCharge) },
    { label: "Retained grid", width: 30, align: "right", value: (row) => money(row.residualGridCost) },
    { label: "Solution path", width: 30, align: "right", value: (row) => money(row.solutionCost) },
    { label: "Cumulative kept", width: 30, align: "right", value: (row) => money(row.cumulativeSaving) },
  ], { fontSize: 7.4, onOverflow: continuation(pdf, "ECONOMICS · CONTINUED", "Ten years, both paths priced.", context) });
  y += 9;
  y = statStrip(pdf, y, 22, [
    { value: compactMoney(economics.tenYear.currentUtilityCost), label: "Utility path · ten-year total" },
    { value: compactMoney(economics.tenYear.solutionCost), label: "Solution path · ten-year total" },
    { value: compactMoney(economics.tenYear.saving), label: economics.tenYear.saving >= 0 ? "Kept in the business" : "Ten-year premium", accent: economics.tenYear.saving >= 0 ? KIT_COLORS.green : KIT_COLORS.red },
  ]);
  y += 7;
  sourceNote(pdf, economics.methodology, y);
}

// ------------------------------------------------------- tariff intelligence

function drawTariffChart(
  pdf: Pdf,
  x: number,
  y: number,
  w: number,
  h: number,
  rows: NonNullable<F1Proposal["tariffComparison"]>["projectionRows"],
  history: readonly UtilityTariffHistoryRow[],
) {
  const years = [...new Set([...history.map((row) => row.year), ...rows.map((row) => row.year)])].sort((a, b) => a - b);
  const values = [
    ...history.map((row) => row.utilityTariffRandPerKwh),
    ...rows.flatMap((row) => [row.utilityEffectiveTariff, row.ufmsEffectiveTariff, row.assetFinanceInstalmentTariff]),
  ];
  const max = Math.max(...values) * 1.12;
  const min = Math.max(0, Math.min(...values) * 0.85);
  const px = (year: number) => x + ((year - years[0]) / Math.max(1, years.at(-1)! - years[0])) * w;
  const py = (value: number) => y + h - ((value - min) / Math.max(0.01, max - min)) * h;
  for (let index = 0; index <= 4; index += 1) {
    hairline(pdf, x, y + (index / 4) * h, x + w, y + (index / 4) * h, { alpha: KIT_INK.softLine });
  }
  const historyColor = blend(KIT_COLORS.cyan, 0.8);
  pdf.setDrawColor(historyColor[0], historyColor[1], historyColor[2]);
  pdf.setLineWidth(0.35);
  pdf.setLineDashPattern([1.4, 1.4], 0);
  for (let index = 0; index < history.length - 1; index += 1) {
    pdf.line(px(history[index].year), py(history[index].utilityTariffRandPerKwh), px(history[index + 1].year), py(history[index + 1].utilityTariffRandPerKwh));
  }
  const series: Array<{ key: keyof (typeof rows)[number]; color: readonly [number, number, number]; dash?: number[] }> = [
    { key: "utilityEffectiveTariff", color: KIT_COLORS.red },
    { key: "ufmsEffectiveTariff", color: KIT_COLORS.green },
    { key: "assetFinanceInstalmentTariff", color: KIT_COLORS.violet, dash: [1.8, 1.8] },
  ];
  for (const item of series) {
    pdf.setDrawColor(item.color[0], item.color[1], item.color[2]);
    pdf.setLineWidth(0.55);
    pdf.setLineDashPattern(item.dash ?? [], 0);
    for (let index = 0; index < rows.length - 1; index += 1) {
      pdf.line(px(rows[index].year), py(Number(rows[index][item.key])), px(rows[index + 1].year), py(Number(rows[index + 1][item.key])));
    }
  }
  pdf.setLineDashPattern([], 0);
  years.forEach((year, index) => {
    if (index === 0 || index === years.length - 1 || index % 5 === 0) {
      monoLabel(pdf, String(year), px(year), y + h + 4.4, { size: 5.6, alpha: KIT_INK.ghost, trackingEm: 0.06, align: "center" });
    }
  });
  const legend: Array<[string, readonly [number, number, number]]> = [
    ["National context", historyColor],
    ["Client utility", KIT_COLORS.red],
    ["Funded system + grid", KIT_COLORS.green],
    ["Asset instalment", KIT_COLORS.violet],
  ];
  let legendX = x;
  for (const [label, color] of legend) {
    pdf.setFillColor(color[0], color[1], color[2]);
    pdf.rect(legendX, y - 5.4, 3.4, 1.1, "F");
    monoLabel(pdf, label, legendX + 4.6, y - 4.2, { size: 5.6, alpha: KIT_INK.dim, trackingEm: 0.06 });
    legendX += 44;
  }
}

function tariffPages(pdf: Pdf, proposal: F1Proposal, context: string) {
  if (!proposal.tariffComparison) return;
  let y = addKitPage(pdf, { eyebrow: "TARIFF INTELLIGENCE · RAND PER UNIT", title: "Utility versus funded energy.", context, tone: KIT_COLORS.cyan });
  drawTariffChart(pdf, KIT_PAGE.margin, y + 7, KIT_PAGE.contentWidth, 52, proposal.tariffComparison.projectionRows, proposal.tariffComparison.historicalContext);
  y += 68;
  y = dataTable(pdf, y, proposal.tariffComparison.projectionRows, [
    { label: "Year", width: 22, strong: true, value: (row) => String(row.year) },
    { label: "Utility", width: 38, align: "right", value: (row) => `R${decimal(row.utilityEffectiveTariff)}` },
    { label: "Funded system + grid", width: 40, align: "right", value: (row) => `R${decimal(row.ufmsEffectiveTariff)}` },
    { label: "Asset instalment", width: 38, align: "right", value: (row) => `R${decimal(row.assetFinanceInstalmentTariff)}` },
    { label: "Asset + grid", width: 36, align: "right", value: (row) => `R${decimal(row.assetFinanceCompleteTariff)}` },
  ], { fontSize: 7, onOverflow: continuation(pdf, "TARIFF INTELLIGENCE · CONTINUED", "Utility versus funded energy.", context) });
  y += 5;
  sourceNote(pdf, proposal.tariffComparison.historicalContextNote, y);

  y = addKitPage(pdf, { eyebrow: "HISTORICAL CONTEXT · NATIONAL TARIFF TEMPLATE", title: "Where the utility path comes from.", context, tone: KIT_COLORS.cyan });
  dataTable(pdf, y, proposal.tariffComparison.historicalContext, [
    { label: "Year", width: 34, strong: true, value: (row) => String(row.year) },
    { label: "Rand per kWh", width: 50, align: "right", value: (row) => `R${decimal(row.utilityTariffRandPerKwh)}` },
    { label: "Cumulative increase", width: 50, align: "right", value: (row) => `${row.cumulativeIncreasePct.toLocaleString("en-US")}%` },
    { label: "Status", width: 40, align: "right", value: (row) => (row.evidence === "historical-template" ? "Template history" : "Legacy projection") },
  ], { fontSize: 6.4, rowPadding: 1.2, onOverflow: continuation(pdf, "HISTORICAL CONTEXT · CONTINUED", "Where the utility path comes from.", context) });
}

// ------------------------------------------------------ commercial structures

function commercialPage(pdf: Pdf, proposal: F1Proposal, context: string) {
  let y = addKitPage(pdf, { eyebrow: "COMMERCIAL STRUCTURES · ONE SYSTEM, THREE ROUTES", title: "Three ways to fund the same system.", context });
  const capex = proposal.commercial.capitalCostInclVat;
  const asset = proposal.commercial.structures.find((option) => option.label === "Asset Finance");
  y = statStrip(pdf, y, 23.3, [
    { value: money(capex.total), label: "Turnkey capital · indicative incl VAT" },
    { value: money(proposal.ufmsOption.monthlyCharge), label: "Funded system · month one ex VAT", accent: KIT_COLORS.amber },
    { value: asset?.monthlyCharge ? money(asset.monthlyCharge) : "Pending", label: "Asset finance · indicative, credit subject" },
  ]);
  y += 8;

  monoLabel(pdf, "STRUCTURE COMPARISON", KIT_PAGE.margin, y);
  y += 2;
  y = dataTable(pdf, y, proposal.commercial.structures, [
    { label: "Option", width: 30, strong: true, value: (row) => row.label },
    { label: "Monthly", width: 28, align: "right", value: (row) => (row.monthlyCharge === null ? "·" : money(row.monthlyCharge)) },
    { label: "Upfront", width: 28, align: "right", value: (row) => (row.upfront === null ? "·" : money(row.upfront)) },
    { label: "Escalation", width: 22, align: "right", value: (row) => (row.escalation === null ? "·" : `${Math.round(row.escalation * 100)}%`) },
    { label: "What it means", width: 66, value: (row) => row.comparisonNote },
  ], { fontSize: 7.2 });
  y += 8;

  monoLabel(pdf, "TURNKEY VALUE · WHERE THE CAPITAL GOES", KIT_PAGE.margin, y);
  y += 3;
  keyValueRows(pdf, y, [
    { label: "Generation equipment", value: money(capex.generation) },
    { label: "Power conversion and storage", value: money(capex.powerCubeBess) },
    { label: "Engineering and implementation", value: money(capex.engineering) },
    { label: "Project, compliance and lifecycle costs", value: money(capex.softCosts) },
    { label: "Turnkey total", value: money(capex.total), strong: true },
  ]);
}

// ---------------------------------------------------------- inclusions

function inclusionsPage(pdf: Pdf, context: string) {
  let y = addKitPage(pdf, {
    eyebrow: "THE ON-SITE SERVICE · WHAT THE ONE AMOUNT INCLUDES",
    title: "Everything the amount carries.",
    context,
  });
  y += 2;
  y = paragraph(
    pdf,
    "The solar and storage pathway replaces your utility bill with one fixed monthly amount under a power purchase agreement with a minimum term of 10 years. That one amount carries the full service below, owned, insured and operated for the life of the agreement, at no capital outlay from you.",
    KIT_PAGE.margin,
    y,
    { size: 9, color: inkTint(KIT_INK.body) },
    KIT_PAGE.contentWidth,
  );
  y += 6;
  const rowHeight = 12.6;
  panel(pdf, KIT_PAGE.margin, y, KIT_PAGE.contentWidth, rowHeight * ONSITE_INCLUSIONS.length + 2.4);
  ONSITE_INCLUSIONS.forEach((inclusion, index) => {
    const rowY = y + 1.2 + index * rowHeight;
    if (index > 0) {
      hairline(pdf, KIT_PAGE.margin + 4, rowY, KIT_PAGE.margin + KIT_PAGE.contentWidth - 4, rowY, { alpha: KIT_INK.softLine, base: KIT_COLORS.panel });
    }
    monoLabel(pdf, inclusion.index, KIT_PAGE.margin + 6, rowY + 7.6, { size: 7.4, color: KIT_COLORS.amber, alpha: 0.92, base: KIT_COLORS.panel });
    drawText(pdf, inclusion.item, KIT_PAGE.margin + 16, rowY + 5.8, { size: 9.4, weight: "bold", color: blend(KIT_COLORS.ink, 0.9, KIT_COLORS.panel) });
    drawText(pdf, inclusion.detail, KIT_PAGE.margin + 16, rowY + 10.2, { size: 7.8, color: blend(KIT_COLORS.ink, KIT_INK.dim, KIT_COLORS.panel) });
  });
  y += rowHeight * ONSITE_INCLUSIONS.length + 2.4;
  y += 5;
  paragraph(
    pdf,
    "The wheeled renewable energy pathway carries the same minimum 10-year power purchase agreement and is available as traditional wheeling or virtual wheeling, whichever fits your metering and supply arrangement.",
    KIT_PAGE.margin,
    y,
    { size: 8.4, color: inkTint(KIT_INK.dim) },
    KIT_PAGE.contentWidth,
  );
  footerBand(pdf, "Migration proposal", context);
}

// -------------------------------------------------------------------- impact

function impactPage(pdf: Pdf, proposal: F1Proposal, context: string) {
  if (!proposal.energyAndEsg) return;
  let y = addKitPage(pdf, { eyebrow: "ENVIRONMENTAL IMPACT · PLANNING VIEW", title: "What cleaner energy may avoid.", context, tone: KIT_COLORS.green });
  const energy = proposal.energyAndEsg.annualPlanningEnergyReductionGwh;
  y = statStrip(pdf, y, 23.3, [
    { value: energy === null ? "Pending" : `${decimal(energy, 3)} GWh`, label: "Planning energy · modelled displacement" },
    { value: proposal.energyAndEsg.annualScope2EmissionsTonnes === null ? "Pending" : `${decimal(proposal.energyAndEsg.annualScope2EmissionsTonnes, 1)} t`, label: "Scope 2 baseline · audited consumption" },
    { value: `${proposal.energyAndEsg.energyEsgReadinessScore}/100`, label: proposal.energyAndEsg.scoreLabel, accent: KIT_COLORS.green },
  ]);
  y += 8;
  y = dataTable(pdf, y, proposal.energyAndEsg.impactRows, [
    { label: "Impact", width: 66, strong: true, value: (row) => row.label },
    { label: "Factor", width: 52, align: "right", value: (row) => `${decimal(row.factor, row.factor < 10 ? 2 : 0)} ${row.factorUnit}` },
    { label: "Annual reduction", width: 56, align: "right", value: (row) => `${decimal(row.annualReduction, row.annualReduction < 10 ? 2 : 0)} ${row.reductionUnit}` },
  ], { fontSize: 7.4 });
  y += 6;
  y = sourceNote(pdf, "Carbon dioxide equivalence uses the current Foundation-1 report factor of 0.94 kilograms per kWh. The remaining factors reproduce the observed funded-project planning factors and are disclosed as legacy planning values, not independently verified engineering outcomes.", y);
  y += 1.5;
  sourceNote(pdf, proposal.energyAndEsg.scoreScope, y);
}

// -------------------------------------------------------------- methodology

function methodologyPage(pdf: Pdf, proposal: F1Proposal, context: string) {
  let y = addKitPage(pdf, { eyebrow: "METHOD AND LIMITATIONS · READ ME FIRST", title: "How to read this proposal.", context });
  for (const [index, line] of proposal.explainer.entries()) {
    if (y > KIT_PAGE.bodyLimitY - 14) {
      y = addKitPage(pdf, { eyebrow: "METHOD AND LIMITATIONS · CONTINUED", title: "How to read this proposal.", context });
    }
    drawText(pdf, String(index + 1).padStart(2, "0"), KIT_PAGE.margin, y, { font: "courier", size: 8, color: blend(KIT_COLORS.amber, 0.9), trackingEm: 0.08 });
    y = paragraph(pdf, line, KIT_PAGE.margin + 12.7, y, { size: 8.2, color: inkTint(KIT_INK.body) }, KIT_PAGE.contentWidth - 12.7, { lineHeight: 4.1 });
    y += 3.4;
  }
  const limitations = proposal.billAwareEconomics?.limitations ?? [];
  if (limitations.length) {
    y += 4;
    if (y > KIT_PAGE.bodyLimitY - 26) {
      y = addKitPage(pdf, { eyebrow: "METHOD AND LIMITATIONS · CONTINUED", title: "How to read this proposal.", context });
    }
    monoLabel(pdf, "GUARDRAILS · WHAT IS DELIBERATELY NOT ASSUMED", KIT_PAGE.margin, y);
    y += 5;
    for (const limitation of limitations) {
      if (y > KIT_PAGE.bodyLimitY - 8) {
        y = addKitPage(pdf, { eyebrow: "METHOD AND LIMITATIONS · CONTINUED", title: "How to read this proposal.", context });
      }
      drawText(pdf, "·", KIT_PAGE.margin + 0.7, y, { weight: "bold", size: 7.8, color: inkTint(KIT_INK.ghost) });
      y = paragraph(pdf, limitation, KIT_PAGE.margin + 4.9, y, { size: 7.8, color: inkTint(KIT_INK.dim) }, KIT_PAGE.contentWidth - 4.9, { lineHeight: 3.9 });
      y += 1.6;
    }
  }
}

// ------------------------------------------------------------ the journey

function journeyPage(pdf: Pdf, proposal: F1Proposal, context: string) {
  let y = addKitPage(pdf, { eyebrow: "SECURE MIGRATION · THE FULL JOURNEY", title: "From proposal to savings from day one.", context });
  const supported = hasPositiveCommercialCase(proposal);
  y = stageJourney(pdf, y + 2, [
    { title: "Screen", detail: "The public estimate that opened this case: the monthly spend and the site's area, no documents.", state: "done" },
    { title: "Evidence", detail: "The most recent utility bills, submitted together and reconciled as one evidence pack.", state: "done" },
    { title: "Foundation-1 Migration Report", detail: "The audited read of the bills: every charge line checked, every route compared.", state: "done" },
    { title: "Non-binding Expression of Interest", detail: "The authorised representative recorded interest in formal terms. Nothing binding.", state: "done" },
    { title: "Formal proposals", detail: "This document: the funded pathway priced from the audited bills.", state: "current" },
    { title: "Verification", detail: "Foundation-1 confirms the business holds the required verification documents, then hands the case to the funder.", state: "ahead" },
    { title: "Term sheet", detail: "The funder issues formal terms. Nothing binds either party until this is signed.", state: "ahead" },
    { title: "Migration", detail: "The funded system is installed and commissioned with the grid connection retained. R0 end to end until the switch.", state: "ahead" },
    { title: "Savings from day one", detail: "The new monthly cost applies from the first billing cycle after go-live: qualifying sites keep up to about sixty percent.", state: "final" },
  ]);
  y += 2;
  darkCallout(pdf, y, 26, {
    eyebrow: "Next step",
    title: supported ? "Confirm verification and request formal terms." : "Keep the case open for reassessment.",
    body: supported
      ? "Reply to your Foundation-1 contact to start verification. You pay nothing to start, nothing to design and nothing to build: the first payment exists only after your new power is live, and from that day you simply pay less."
      : "Foundation-1 retains the audited evidence pack and reprices the case when system pricing, consumption or utility tariffs move. No cost, no obligation, and the evidence stays yours.",
  });
}

// ----------------------------------------------------------------- assembly

export function migrationProposalPdfFilename(proposal: F1Proposal) {
  const company = sanitizeFileSegment(proposal.businessName) || "client";
  const profile = sanitizeFileSegment(proposal.clientProfileId ?? "profile");
  return `foundation-1-migration-proposal-${company}-${profile}.pdf`;
}

export function buildMigrationProposalPdf(proposal: F1Proposal) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  pdf.setProperties({
    title: `Foundation-1 Migration Proposal: ${proposal.businessName}`,
    subject: "Bill-audited pre-engineering renewable-energy migration assessment",
    author: "Foundation-1 (Pty) Ltd",
    creator: "Foundation-1 1-MI",
    keywords: "renewable energy, migration proposal, funded system, asset finance, environmental readiness",
  });
  const context = [proposal.clientProfileId ?? null, proposal.site.city ?? null]
    .filter(Boolean)
    .join(" · ")
    .toUpperCase() || "CONFIDENTIAL";
  buildCover(pdf, proposal);
  decisionPage(pdf, proposal, context);
  evidencePage(pdf, proposal, context);
  commercialFitPage(pdf, proposal, context);
  waterfallPage(pdf, proposal, context);
  economicsPage(pdf, proposal, context);
  tariffPages(pdf, proposal, context);
  commercialPage(pdf, proposal, context);
  inclusionsPage(pdf, context);
  impactPage(pdf, proposal, context);
  methodologyPage(pdf, proposal, context);
  journeyPage(pdf, proposal, context);
  footerBand(pdf, "Migration proposal", "Confidential client assessment");
  return {
    bytes: new Uint8Array(pdf.output("arraybuffer")),
    filename: migrationProposalPdfFilename(proposal),
    pageCount: pdf.getNumberOfPages(),
  };
}

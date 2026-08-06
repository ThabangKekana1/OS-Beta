import { jsPDF } from "jspdf";
import type { F1Proposal } from "@/lib/f1-proposal";
import { sanitizeFileSegment } from "@/lib/download-utils";
import type { UtilityTariffHistoryRow } from "@/lib/proposal-impact-model";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = 286;
const INK: [number, number, number] = [16, 28, 22];
const MUTED: [number, number, number] = [94, 108, 100];
const GREEN: [number, number, number] = [35, 155, 102];
const PALE: [number, number, number] = [238, 247, 241];
const RULE: [number, number, number] = [216, 226, 220];

type Pdf = jsPDF;

type TableColumn<T> = {
  label: string;
  width: number;
  align?: "left" | "right";
  value: (row: T) => string;
};

function money(value: number) {
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

function decimal(value: number, digits = 2) {
  return value.toLocaleString("en-ZA", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function hasPositiveCommercialCase(proposal: F1Proposal) {
  const monthlyDifference = proposal.billAwareEconomics?.yearOne.saving
    ?? proposal.ufmsOption.monthlySaving;
  return monthlyDifference > 0 && proposal.tenYearComparison.ufmsSaving > 0;
}

function addPage(pdf: Pdf, title?: string) {
  pdf.addPage();
  if (title) {
    pdf.setTextColor(...GREEN);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text(title.toUpperCase(), MARGIN, 16);
    pdf.setDrawColor(...RULE);
    pdf.line(MARGIN, 21, PAGE_W - MARGIN, 21);
  }
}

function sectionTitle(pdf: Pdf, eyebrow: string, title: string, y: number) {
  pdf.setTextColor(...GREEN);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.text(eyebrow.toUpperCase(), MARGIN, y);
  pdf.setTextColor(...INK);
  pdf.setFontSize(19);
  pdf.text(title, MARGIN, y + 9);
  return y + 17;
}

function paragraph(pdf: Pdf, text: string, x: number, y: number, width: number, options: { size?: number; color?: [number, number, number]; lineHeight?: number } = {}) {
  const size = options.size ?? 9;
  const lineHeight = options.lineHeight ?? size * 0.45;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(size);
  pdf.setTextColor(...(options.color ?? MUTED));
  const lines = pdf.splitTextToSize(text, width) as string[];
  pdf.text(lines, x, y, { lineHeightFactor: 1.35 });
  return y + Math.max(1, lines.length) * lineHeight;
}

function metric(pdf: Pdf, x: number, y: number, w: number, label: string, value: string, note?: string) {
  pdf.setFillColor(...PALE);
  pdf.roundedRect(x, y, w, 34, 3, 3, "F");
  pdf.setTextColor(...MUTED);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.8);
  pdf.text(label.toUpperCase(), x + 5, y + 7);
  pdf.setTextColor(...INK);
  pdf.setFontSize(15);
  pdf.text(value, x + 5, y + 18);
  if (note) {
    pdf.setTextColor(...MUTED);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.7);
    const lines = pdf.splitTextToSize(note, w - 10) as string[];
    pdf.text(lines.slice(0, 2), x + 5, y + 25, { lineHeightFactor: 1.2 });
  }
}

function drawTable<T>(pdf: Pdf, y: number, rows: readonly T[], columns: readonly TableColumn<T>[], options: { title?: string; pageTitle?: string; fontSize?: number; minRowHeight?: number; padding?: number } = {}) {
  const fontSize = options.fontSize ?? 7.5;
  const headerHeight = 10;
  const padding = options.padding ?? 2.5;
  const minRowHeight = options.minRowHeight ?? 9;
  const drawHeader = (atY: number) => {
    pdf.setFillColor(...INK);
    pdf.rect(MARGIN, atY, CONTENT_W, headerHeight, "F");
    let x = MARGIN;
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(fontSize - 0.5);
    for (const column of columns) {
      pdf.text(column.label, column.align === "right" ? x + column.width - padding : x + padding, atY + 6.5, {
        align: column.align === "right" ? "right" : "left",
      });
      x += column.width;
    }
    return atY + headerHeight;
  };

  if (options.title) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(...INK);
    pdf.text(options.title, MARGIN, y);
    y += 6;
  }
  y = drawHeader(y);

  for (const row of rows) {
    const values = columns.map((column) => pdf.splitTextToSize(column.value(row), column.width - padding * 2) as string[]);
    const maxLines = Math.max(...values.map((lines) => Math.max(1, lines.length)));
    const rowHeight = Math.max(minRowHeight, maxLines * (fontSize * 0.42) + padding * 2);
    if (y + rowHeight > FOOTER_Y - 8) {
      addPage(pdf, options.pageTitle ?? options.title);
      y = drawHeader(26);
    }
    pdf.setDrawColor(...RULE);
    pdf.line(MARGIN, y + rowHeight, PAGE_W - MARGIN, y + rowHeight);
    let x = MARGIN;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(fontSize);
    pdf.setTextColor(...INK);
    columns.forEach((column, index) => {
      pdf.text(values[index], column.align === "right" ? x + column.width - padding : x + padding, y + padding + fontSize * 0.36, {
        align: column.align === "right" ? "right" : "left",
        lineHeightFactor: 1.2,
      });
      x += column.width;
    });
    y += rowHeight;
  }
  return y;
}

function drawLineChart(
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
  const pxForYear = (year: number) => x + ((year - years[0]) / Math.max(1, years.at(-1)! - years[0])) * w;
  const py = (value: number) => y + h - ((value - min) / Math.max(0.01, max - min)) * h;
  pdf.setDrawColor(...RULE);
  pdf.setLineWidth(0.25);
  for (let i = 0; i <= 4; i += 1) {
    const gy = y + (i / 4) * h;
    pdf.line(x, gy, x + w, gy);
  }
  pdf.setDrawColor(55, 156, 191);
  pdf.setLineWidth(0.55);
  pdf.setLineDashPattern([1.5, 1.5], 0);
  for (let i = 0; i < history.length - 1; i += 1) {
    pdf.line(
      pxForYear(history[i].year),
      py(history[i].utilityTariffRandPerKwh),
      pxForYear(history[i + 1].year),
      py(history[i + 1].utilityTariffRandPerKwh),
    );
  }
  const series: Array<{ key: keyof (typeof rows)[number]; color: [number, number, number]; dash?: number[] }> = [
    { key: "utilityEffectiveTariff", color: [224, 89, 72] },
    { key: "ufmsEffectiveTariff", color: [42, 166, 105] },
    { key: "assetFinanceInstalmentTariff", color: [70, 116, 205], dash: [2, 2] },
  ];
  for (const item of series) {
    pdf.setDrawColor(...item.color);
    pdf.setLineWidth(0.8);
    pdf.setLineDashPattern(item.dash ?? [], 0);
    for (let i = 0; i < rows.length - 1; i += 1) {
      pdf.line(pxForYear(rows[i].year), py(Number(rows[i][item.key])), pxForYear(rows[i + 1].year), py(Number(rows[i + 1][item.key])));
    }
  }
  pdf.setLineDashPattern([], 0);
  pdf.setFontSize(6.5);
  pdf.setTextColor(...MUTED);
  years.forEach((year, index) => {
    if (index === 0 || index === years.length - 1 || index % 5 === 0) pdf.text(String(year), pxForYear(year), y + h + 5, { align: "center" });
  });
  const legend = [
    ["National context", [55, 156, 191]],
    ["Client utility", [224, 89, 72]],
    ["UFMS + grid", [42, 166, 105]],
    ["Asset instalment", [70, 116, 205]],
  ] as const;
  let legendX = x;
  pdf.setFontSize(6.2);
  for (const [label, color] of legend) {
    pdf.setFillColor(color[0], color[1], color[2]);
    pdf.rect(legendX, y - 7, 4, 1.6, "F");
    pdf.setTextColor(...MUTED);
    pdf.text(label, legendX + 6, y - 5.5);
    legendX += 42;
  }
}

function coverPage(pdf: Pdf, proposal: F1Proposal) {
  const supported = hasPositiveCommercialCase(proposal);
  pdf.setFillColor(4, 11, 8);
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
  pdf.setFillColor(185, 255, 145);
  pdf.circle(182, 28, 18, "F");
  pdf.setFillColor(4, 11, 8);
  pdf.circle(182, 28, 8, "F");
  pdf.setTextColor(185, 255, 145);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("FOUNDATION-1 / MIGRATION INTELLIGENCE", MARGIN, 25);
  pdf.setTextColor(244, 247, 244);
  pdf.setFontSize(31);
  pdf.text(["Migration", "Proposal"], MARGIN, 73, { lineHeightFactor: 0.95 });
  pdf.setFontSize(12);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(185, 194, 188);
  pdf.text("Bill-audited pre-engineering assessment", MARGIN, 105);
  pdf.setDrawColor(185, 255, 145);
  pdf.setLineWidth(1.2);
  pdf.line(MARGIN, 119, 78, 119);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(244, 247, 244);
  pdf.setFontSize(17);
  pdf.text(proposal.businessName, MARGIN, 145);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(185, 194, 188);
  const meta = [
    proposal.clientProfileId ? `Profile ${proposal.clientProfileId}` : null,
    [proposal.site.city, proposal.site.province].filter(Boolean).join(", ") || null,
    new Date(proposal.generatedAt).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" }),
  ].filter(Boolean) as string[];
  pdf.text(meta, MARGIN, 155, { lineHeightFactor: 1.7 });
  pdf.setFillColor(12, 27, 19);
  pdf.roundedRect(MARGIN, 202, CONTENT_W, 45, 4, 4, "F");
  pdf.setTextColor(185, 255, 145);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("REPORT STATUS", MARGIN + 7, 213);
  pdf.setTextColor(244, 247, 244);
  pdf.setFontSize(14);
  pdf.text(supported ? "Bill-audited / commercial case supported" : "Bill-audited / commercial gaps identified", MARGIN + 7, 225);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(185, 194, 188);
  pdf.text("Not a formal credit offer. Engineering validates yield, dispatch and final terms.", MARGIN + 7, 236);
}

function executivePage(pdf: Pdf, proposal: F1Proposal) {
  addPage(pdf);
  let y = sectionTitle(pdf, "Decision brief", "The case at a glance", 20);
  const economics = proposal.billAwareEconomics;
  const current = economics?.yearOne.currentUtilityCost ?? proposal.profile.monthlySpend;
  const solution = economics?.yearOne.solutionCost ?? current - proposal.ufmsOption.monthlySaving;
  const saving = economics?.yearOne.saving ?? proposal.ufmsOption.monthlySaving;
  const supported = hasPositiveCommercialCase(proposal);
  const metricW = (CONTENT_W - 6) / 2;
  metric(pdf, MARGIN, y, metricW, "Approved-current design bill", `${money(current)}/mo`, "Ex VAT · selected high-load period");
  metric(pdf, MARGIN + metricW + 6, y, metricW, "Complete solution path", `${money(solution)}/mo`, "UFMS charge + retained grid charges");
  metric(pdf, MARGIN, y + 40, metricW, supported ? "Modelled monthly reduction" : "Modelled monthly premium", money(Math.abs(saving)), supported ? `${((saving / current) * 100).toFixed(1)}% P50 bill-audited result` : `${Math.abs((saving / current) * 100).toFixed(1)}% above current path`);
  metric(pdf, MARGIN + metricW + 6, y + 40, metricW, supported ? "Ten-year reduction" : "Ten-year premium", money(Math.abs(proposal.tenYearComparison.ufmsSaving)), "Nominal ZAR · disclosed escalation path");
  y += 86;
  pdf.setFillColor(9, 20, 14);
  pdf.roundedRect(MARGIN, y, CONTENT_W, 34, 4, 4, "F");
  pdf.setTextColor(185, 255, 145);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("FOUNDATION-1 VIEW", MARGIN + 7, y + 9);
  pdf.setTextColor(244, 247, 244);
  pdf.setFontSize(12);
  const verdict = supported
    ? `The bill pack and P50 dispatch model support a ${money(saving)} monthly reduction on the selected design period. Interval engineering must validate generation, battery dispatch and imported-energy displacement before this becomes a formal offer.`
    : `The completed bill audit identifies a ${money(Math.abs(saving))} monthly premium on the selected design period. The proposal remains complete as a gap report; the post-proposal EOI records interest in future reassessment without accepting this configuration.`;
  pdf.text(pdf.splitTextToSize(verdict, CONTENT_W - 14) as string[], MARGIN + 7, y + 19, { lineHeightFactor: 1.25 });
  y += 43;
  y = sectionTitle(pdf, "Proposed architecture", "Designed for the high-load month", y);
  const specs = [
    ["Solar array", `${proposal.ufmsOption.sizing.pvKwp} kWp`],
    ["Power conversion", `${proposal.ufmsOption.sizing.pcsKw} kW PCS`],
    ["Battery storage", `${proposal.ufmsOption.sizing.bessKwh} kWh`],
    ["Planning yield", proposal.solarYield ? `${Math.round(proposal.solarYield.averageMonthlyGenerationKwh).toLocaleString("en-ZA")} kWh/mo` : "Pending"],
    ["Onsite energy to load", `${Math.round(proposal.ufmsOption.dispatch.onsiteToLoadKwh).toLocaleString("en-ZA")} kWh/mo · ${proposal.ufmsOption.dispatch.onsiteCoveragePct.toFixed(1)}%`],
    ["Residual grid import", `${Math.round(proposal.ufmsOption.dispatch.residualGridKwh).toLocaleString("en-ZA")} kWh/mo`],
  ];
  y = drawTable(pdf, y, specs, [
    { label: "DESIGN ELEMENT", width: 94, value: (row) => row[0] },
    { label: "PLANNING VALUE", width: 84, align: "right", value: (row) => row[1] },
  ]);
  paragraph(pdf, proposal.disclaimer, MARGIN, y + 8, CONTENT_W, { size: 7.5 });
}

function auditPage(pdf: Pdf, proposal: F1Proposal) {
  addPage(pdf);
  let y = sectionTitle(pdf, "Evidence", "What the bills actually say", 20);
  if (proposal.calculationBasis) {
    const basisRows = [
      ["Selected period", `${proposal.calculationBasis.periodStart} to ${proposal.calculationBasis.periodEnd}`],
      ["Actual period", `${money(proposal.calculationBasis.historical.billedSpendExVat)} · ${Math.round(proposal.calculationBasis.historical.billedKwh).toLocaleString("en-ZA")} kWh`],
      ["Standard month", `${money(proposal.calculationBasis.historical.monthlyEquivalentSpendExVat)} · ${Math.round(proposal.calculationBasis.historical.monthlyEquivalentKwh).toLocaleString("en-ZA")} kWh`],
      ["Approved-current", proposal.calculationBasis.approvedCurrent?.monthlyEquivalentSpendExVat == null ? "Not available" : money(proposal.calculationBasis.approvedCurrent.monthlyEquivalentSpendExVat)],
      ["Meter evidence", `${proposal.calculationBasis.readType} · ${proposal.calculationBasis.billingDays} service days`],
    ];
    y = drawTable(pdf, y, basisRows, [
      { label: "DESIGN BASIS", width: 62, value: (row) => row[0] },
      { label: "VALUE", width: 116, align: "right", value: (row) => row[1] },
    ]);
    y = paragraph(pdf, proposal.calculationBasis.explanation, MARGIN, y + 7, CONTENT_W, { size: 8 });
  }
  if (proposal.billAudit) {
    y = sectionTitle(pdf, "Six-period audit", `${proposal.billAudit.uniquePeriodCount} periods / ${proposal.billAudit.coveredDays} days`, y + 10);
    const auditRows = [
      ["Utility / tariff", `${proposal.billAudit.provider} · ${proposal.billAudit.tariffNames.join(", ")}`],
      ["Average usage", `${Math.round(proposal.billAudit.averageMonthlyKwh).toLocaleString("en-ZA")} kWh/month`],
      ["Historical average", `${money(proposal.billAudit.averageMonthlySpendExVat)}/month ex VAT`],
      ["Blended tariff", `R${decimal(proposal.billAudit.blendedTariffExVat)}/kWh ex VAT`],
      ["Actual-read share", `${Math.round(proposal.billAudit.actualReadShare * 100)}%`],
      ["Analysis confidence", proposal.billAudit.confidence],
    ];
    y = drawTable(pdf, y, auditRows, [
      { label: "AUDIT FIELD", width: 62, value: (row) => row[0] },
      { label: "RESULT", width: 116, align: "right", value: (row) => row[1] },
    ]);
    if (proposal.billAudit.warnings.length) {
      y = sectionTitle(pdf, "Evidence notices", "What still needs attention", y + 10);
      for (const warning of proposal.billAudit.warnings) y = paragraph(pdf, `• ${warning}`, MARGIN, y, CONTENT_W, { size: 8 });
    }
  }
}

function commercialFitPage(pdf: Pdf, proposal: F1Proposal) {
  const fit = proposal.commercialFit;
  if (!fit) return;
  addPage(pdf);
  let y = sectionTitle(pdf, "Commercial fit", "Does the load fit an available package?", 20);
  const gapTone = fit.belowCommercialMinimum || fit.aboveStandardMaximum;
  metric(pdf, MARGIN, y, 56, "Load-supported size", `${decimal(fit.requiredPvKwp, 1)} kWp`, "Before standard-package rounding");
  metric(pdf, MARGIN + 61, y, 56, "Selected package", `${fit.selectedPvKwp} kWp`, `Smallest evidenced: ${fit.minimumCommercialPvKwp} kWp`);
  metric(pdf, MARGIN + 122, y, 56, "Size variance", `${fit.sizeVariancePct >= 0 ? "+" : ""}${decimal(fit.sizeVariancePct, 1)}%`, gapTone ? "Commercial gap identified" : "Within commercial range");
  y += 43;
  const fitRows = [
    ["Fit status", fit.status.replace(/-/g, " ")],
    ["Bill-backed monthly use", `${Math.round(fit.monthlyConsumptionKwh).toLocaleString("en-ZA")} kWh`],
    ["Selected planning generation", `${Math.round(fit.selectedMonthlyGenerationKwh).toLocaleString("en-ZA")} kWh/month`],
    ["Generation variance", `${fit.generationGapKwh >= 0 ? "+" : ""}${Math.round(fit.generationGapKwh).toLocaleString("en-ZA")} kWh/month`],
    ["Planning coverage", `${decimal(fit.generationCoveragePct, 1)}%`],
    ["Standard package range", `${fit.minimumCommercialPvKwp}-${fit.maximumStandardPvKwp} kWp`],
  ];
  y = drawTable(pdf, y, fitRows, [
    { label: "FIT TEST", width: 76, value: (row) => row[0] },
    { label: "RESULT", width: 102, align: "right", value: (row) => row[1] },
  ]);
  pdf.setFillColor(...(gapTone ? [255, 244, 239] as [number, number, number] : PALE));
  pdf.roundedRect(MARGIN, y + 8, CONTENT_W, 37, 4, 4, "F");
  pdf.setTextColor(...(gapTone ? [154, 67, 46] as [number, number, number] : GREEN));
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.text(gapTone ? "PACKAGE GAP" : "PACKAGE FIT", MARGIN + 7, y + 18);
  paragraph(pdf, fit.message, MARGIN + 7, y + 27, CONTENT_W - 14, { size: 8, color: INK });
  y += 54;

  const economics = proposal.billAwareEconomics;
  if (economics) {
    y = sectionTitle(pdf, "Economic gap", "What the package does to the bill", y);
    const monthlyDifference = economics.yearOne.saving;
    const tenYearDifference = economics.tenYear.saving;
    const rows = [
      ["Approved-current utility path", `${money(economics.yearOne.currentUtilityCost)}/month`],
      ["Complete solution path", `${money(economics.yearOne.solutionCost)}/month`],
      [monthlyDifference >= 0 ? "Monthly reduction" : "Monthly premium", money(Math.abs(monthlyDifference))],
      [tenYearDifference >= 0 ? "Ten-year reduction" : "Ten-year premium", money(Math.abs(tenYearDifference))],
      ["Proposal disposition", hasPositiveCommercialCase(proposal) ? "EOI · proceed to formal assessment" : "EOI · retain for gap reassessment"],
    ];
    drawTable(pdf, y, rows, [
      { label: "COMMERCIAL TEST", width: 88, value: (row) => row[0] },
      { label: "RESULT", width: 90, align: "right", value: (row) => row[1] },
    ]);
  }
}

function migrationPathPage(pdf: Pdf, proposal: F1Proposal) {
  addPage(pdf);
  let y = sectionTitle(pdf, "Migration waterfall", "Every kWh is assigned once", 20);
  const dispatch = proposal.ufmsOption.dispatch;
  const combined = proposal.lumenCombined;
  metric(pdf, MARGIN, y, 56, "Onsite share", `${decimal(dispatch.onsiteCoveragePct, 1)}%`, "Direct solar + battery output");
  metric(pdf, MARGIN + 61, y, 56, "Grid residual", `${Math.round(dispatch.residualGridKwh).toLocaleString("en-ZA")} kWh`, "After onsite dispatch");
  metric(pdf, MARGIN + 122, y, 56, "Residual wheeled", combined ? `${Math.round(combined.wheeledResidualKwh).toLocaleString("en-ZA")} kWh` : "Screen only", "Never applied to onsite kWh");
  y += 43;
  const energyRows = [
    ["Business load", dispatch.monthlyLoadKwh],
    ["Solar generation", dispatch.solarGenerationKwh],
    ["Direct solar to load", dispatch.directSolarToLoadKwh],
    ["Battery to load", dispatch.batteryToLoadKwh],
    ["Onsite energy delivered", dispatch.onsiteToLoadKwh],
    ["Residual grid import", dispatch.residualGridKwh],
    ["Residual energy wheeled", combined?.wheeledResidualKwh ?? 0],
    ["Residual Eskom commodity energy", combined?.eskomResidualKwh ?? dispatch.residualGridKwh],
  ] as const;
  y = drawTable(pdf, y, energyRows, [
    { label: "ENERGY STEP", width: 112, value: (row) => row[0] },
    { label: "MONTHLY kWh", width: 66, align: "right", value: (row) => Math.round(row[1]).toLocaleString("en-ZA") },
  ]);
  y = sectionTitle(pdf, "Charge waterfall", "What remains payable", y + 10);
  const economics = proposal.billAwareEconomics;
  const baseline = economics?.yearOne.currentUtilityCost ?? proposal.profile.monthlySpend;
  const chargeRows = [
    ["Current utility bill", baseline],
    ["UFMS funded-system charge", proposal.ufmsOption.monthlyCharge],
    ["Retained grid charges after onsite", proposal.ufmsOption.chargeWaterfall.retainedAfterUfms.total],
    ["Residual wheeling charge", combined?.wheelingMonthlyCharge ?? 0],
    ["Complete combined path", combined?.monthlyCost ?? proposal.ufmsOption.monthlyCharge + proposal.ufmsOption.chargeWaterfall.retainedAfterUfms.total],
  ] as const;
  y = drawTable(pdf, y, chargeRows, [
    { label: "RAND STEP", width: 112, value: (row) => row[0] },
    { label: "MONTH ONE · EX VAT", width: 66, align: "right", value: (row) => money(row[1]) },
  ]);
  paragraph(pdf, combined?.note ?? proposal.wheelingOption.note, MARGIN, y + 8, CONTENT_W, { size: 7.5 });
}

function economicsPage(pdf: Pdf, proposal: F1Proposal) {
  addPage(pdf);
  let y = sectionTitle(pdf, "Economics", "Ten-year cost path", 20);
  const economics = proposal.billAwareEconomics;
  if (!economics) return;
  const rows = economics.tenYear.rows;
  y = drawTable(pdf, y, rows, [
    { label: "YEAR", width: 15, value: (row) => String(row.year) },
    { label: "UTILITY", width: 34, align: "right", value: (row) => money(row.utilityCost) },
    { label: "UFMS", width: 31, align: "right", value: (row) => money(row.ufmsCharge) },
    { label: "GRID", width: 29, align: "right", value: (row) => money(row.residualGridCost) },
    { label: "SOLUTION", width: 34, align: "right", value: (row) => money(row.solutionCost) },
    { label: "CUM. GAP", width: 35, align: "right", value: (row) => money(row.cumulativeSaving) },
  ], { fontSize: 7, pageTitle: "Ten-year economics" });
  y = sectionTitle(pdf, "Totals", "The complete comparison", y + 10);
  metric(pdf, MARGIN, y, 55, "Utility path", money(economics.tenYear.currentUtilityCost));
  metric(pdf, MARGIN + 61, y, 55, "Solution path", money(economics.tenYear.solutionCost));
  metric(pdf, MARGIN + 122, y, 56, "Difference", money(economics.tenYear.saving));
  y += 42;
  paragraph(pdf, economics.methodology, MARGIN, y, CONTENT_W, { size: 8 });
}

function tariffPage(pdf: Pdf, proposal: F1Proposal) {
  if (!proposal.tariffComparison) return;
  addPage(pdf);
  let y = sectionTitle(pdf, "Tariff intelligence", "Utility versus funded energy", 20);
  drawLineChart(
    pdf,
    MARGIN,
    y + 8,
    CONTENT_W,
    58,
    proposal.tariffComparison.projectionRows,
    proposal.tariffComparison.historicalContext,
  );
  y += 79;
  y = drawTable(pdf, y, proposal.tariffComparison.projectionRows, [
    { label: "YEAR", width: 20, value: (row) => String(row.year) },
    { label: "UTILITY", width: 42, align: "right", value: (row) => `R${decimal(row.utilityEffectiveTariff)}` },
    { label: "UFMS + GRID", width: 43, align: "right", value: (row) => `R${decimal(row.ufmsEffectiveTariff)}` },
    { label: "ASSET INSTAL.", width: 38, align: "right", value: (row) => `R${decimal(row.assetFinanceInstalmentTariff)}` },
    { label: "ASSET + GRID", width: 35, align: "right", value: (row) => `R${decimal(row.assetFinanceCompleteTariff)}` },
  ], { fontSize: 7, pageTitle: "Tariff intelligence" });
  paragraph(pdf, proposal.tariffComparison.historicalContextNote, MARGIN, y + 7, CONTENT_W, { size: 7.2 });

  addPage(pdf);
  y = sectionTitle(pdf, "Historical context", "National tariff template, 2007-2033", 20);
  y = drawTable(pdf, y, proposal.tariffComparison.historicalContext, [
    { label: "YEAR", width: 35, value: (row) => String(row.year) },
    { label: "R/kWh", width: 55, align: "right", value: (row) => `R${decimal(row.utilityTariffRandPerKwh)}` },
    { label: "CUMULATIVE", width: 50, align: "right", value: (row) => `${row.cumulativeIncreasePct.toLocaleString("en-ZA")}%` },
    { label: "STATUS", width: 38, align: "right", value: (row) => row.evidence === "historical-template" ? "Template history" : "Legacy projection" },
  ], { fontSize: 6.2, minRowHeight: 7.1, padding: 1.6, pageTitle: "Historical tariff context" });
}

function commercialPage(pdf: Pdf, proposal: F1Proposal) {
  addPage(pdf);
  let y = sectionTitle(pdf, "Commercial structures", "Three ways to fund the same system", 20);
  const capex = proposal.commercial.capitalCostInclVat;
  metric(pdf, MARGIN, y, 56, "Turnkey capital", money(capex.total), "Indicative · incl VAT");
  metric(pdf, MARGIN + 61, y, 56, "UFMS month one", money(proposal.ufmsOption.monthlyCharge), "Ex VAT · 6% annual escalation");
  const asset = proposal.commercial.structures.find((option) => option.label === "Asset Finance");
  metric(pdf, MARGIN + 122, y, 56, "Asset finance", asset?.monthlyCharge ? money(asset.monthlyCharge) : "Pending", "Indicative · credit subject");
  y += 43;
  y = drawTable(pdf, y, proposal.commercial.structures, [
    { label: "OPTION", width: 32, value: (row) => row.label },
    { label: "MONTHLY", width: 32, align: "right", value: (row) => row.monthlyCharge === null ? "n/a" : money(row.monthlyCharge) },
    { label: "UPFRONT", width: 29, align: "right", value: (row) => row.upfront === null ? "n/a" : money(row.upfront) },
    { label: "ESC.", width: 20, align: "right", value: (row) => row.escalation === null ? "n/a" : `${Math.round(row.escalation * 100)}%` },
    { label: "WHAT IT MEANS", width: 65, value: (row) => row.comparisonNote },
  ], { fontSize: 7, pageTitle: "Commercial structures" });
  y = sectionTitle(pdf, "Turnkey value", "Where the capital goes", y + 10);
  const stackRows = [
    ["Generation equipment", capex.generation],
    ["Power conversion and storage", capex.powerCubeBess],
    ["Engineering and implementation", capex.engineering],
    ["Project, compliance and lifecycle costs", capex.softCosts],
  ] as const;
  drawTable(pdf, y, stackRows, [
    { label: "CAPITAL COMPONENT", width: 118, value: (row) => row[0] },
    { label: "INDICATIVE VALUE", width: 60, align: "right", value: (row) => money(row[1]) },
  ]);
}

function impactPage(pdf: Pdf, proposal: F1Proposal) {
  if (!proposal.energyAndEsg) return;
  addPage(pdf);
  let y = sectionTitle(pdf, "Environmental impact", "What cleaner energy may avoid", 20);
  const energy = proposal.energyAndEsg.annualPlanningEnergyReductionGwh;
  metric(pdf, MARGIN, y, 56, "Planning energy", energy === null ? "Pending" : `${decimal(energy, 3)} GWh`, "Modelled onsite grid displacement");
  metric(pdf, MARGIN + 61, y, 56, "Scope 2 baseline", proposal.energyAndEsg.annualScope2EmissionsTonnes === null ? "Pending" : `${decimal(proposal.energyAndEsg.annualScope2EmissionsTonnes, 1)} t`, "Audited grid consumption");
  metric(pdf, MARGIN + 122, y, 56, "ESG readiness", `${proposal.energyAndEsg.energyEsgReadinessScore}/100`, proposal.energyAndEsg.scoreLabel);
  y += 43;
  y = drawTable(pdf, y, proposal.energyAndEsg.impactRows, [
    { label: "IMPACT", width: 67, value: (row) => row.label },
    { label: "FACTOR", width: 50, align: "right", value: (row) => `${decimal(row.factor, row.factor < 10 ? 2 : 0)} ${row.factorUnit}` },
    { label: "ANNUAL REDUCTION", width: 61, align: "right", value: (row) => `${decimal(row.annualReduction, row.annualReduction < 10 ? 2 : 0)} ${row.reductionUnit}` },
  ], { fontSize: 7.5 });
  y = paragraph(pdf, "CO2e uses the current Foundation-1 report factor of 0.94 kgCO2e/kWh. NOx, SO2, particulate, water, coal and ash factors reproduce the observed partner proposal and are disclosed as legacy planning factors, not independently verified engineering outcomes.", MARGIN, y + 8, CONTENT_W, { size: 7.5 });
  paragraph(pdf, proposal.energyAndEsg.scoreScope, MARGIN, y + 4, CONTENT_W, { size: 7.5 });
}

function methodologyPage(pdf: Pdf, proposal: F1Proposal) {
  addPage(pdf);
  let y = sectionTitle(pdf, "Method and limitations", "How to read this proposal", 20);
  for (const [index, line] of proposal.explainer.entries()) {
    pdf.setFillColor(...PALE);
    pdf.circle(MARGIN + 3, y - 1, 3, "F");
    pdf.setTextColor(...GREEN);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.text(String(index + 1), MARGIN + 3, y, { align: "center" });
    y = paragraph(pdf, line, MARGIN + 10, y, CONTENT_W - 10, { size: 8 });
    y += 4;
    if (y > FOOTER_Y - 18) {
      addPage(pdf, "Method and limitations");
      y = 30;
    }
  }
  if (proposal.billAwareEconomics) {
    y = sectionTitle(pdf, "Guardrails", "What is deliberately not assumed", y + 4);
    for (const limitation of proposal.billAwareEconomics.limitations) {
      y = paragraph(pdf, `• ${limitation}`, MARGIN, y, CONTENT_W, { size: 7.8 });
      y += 2;
    }
  }
}

function addFooters(pdf: Pdf, proposal: F1Proposal) {
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(...(page === 1 ? [53, 71, 62] as [number, number, number] : RULE));
    pdf.line(MARGIN, FOOTER_Y - 4, PAGE_W - MARGIN, FOOTER_Y - 4);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(...(page === 1 ? [150, 163, 155] as [number, number, number] : MUTED));
    pdf.text("FOUNDATION-1 (PTY) LTD · CONFIDENTIAL CLIENT ASSESSMENT", MARGIN, FOOTER_Y);
    pdf.text(`${proposal.clientProfileId ?? "Client"} · ${page} / ${pages}`, PAGE_W - MARGIN, FOOTER_Y, { align: "right" });
  }
}

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
    creator: "Foundation-1 1OS",
    keywords: "renewable energy, migration proposal, UFMS, asset finance, ESG",
  });
  coverPage(pdf, proposal);
  executivePage(pdf, proposal);
  auditPage(pdf, proposal);
  commercialFitPage(pdf, proposal);
  migrationPathPage(pdf, proposal);
  economicsPage(pdf, proposal);
  tariffPage(pdf, proposal);
  commercialPage(pdf, proposal);
  impactPage(pdf, proposal);
  methodologyPage(pdf, proposal);
  addFooters(pdf, proposal);
  return {
    bytes: new Uint8Array(pdf.output("arraybuffer")),
    filename: migrationProposalPdfFilename(proposal),
    pageCount: pdf.getNumberOfPages(),
  };
}

/**
 * FOUNDATION-1 FUNDER-REPORT PDF, server-rendered report artifact (v2).
 *
 * jsPDF A4 on the house document design system (lib/document-kit.ts), so the
 * report ships in production without the presentations worker. The full R3F
 * migration-path deck is generated offline from the same ClientSavingsData
 * JSON (see lib/funder-report-pipeline.ts for the three commands).
 *
 * AUDIENCE: internal, travels with the case to the funder. It may name the
 * funding partners, so partner-neutral copy is switched off for this build
 * and restored afterwards. It still contains ONLY bill-derived and
 * funder-stated figures: no clone-engine constants, cross-check reasoning or
 * prediction internals may be rendered here.
 */
import { jsPDF } from "jspdf";
import { sanitizeFileSegment } from "@/lib/download-utils";
import type { FunderReport } from "@/lib/funder-report";
import {
  KIT_COLORS,
  KIT_INK,
  KIT_PAGE,
  addKitPage,
  blend,
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
  setPartnerNeutralCopy,
  sourceNote,
  stageJourney,
  statStrip,
  type KitKeyValueRow,
} from "@/lib/document-kit";

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

/* ---------------------------------------------------------------- pages */

function buildCover(pdf: Pdf, report: FunderReport) {
  const facts = report.billFacts;
  const generatedDate = kitLongDate(report.generatedAt);
  const optionCell = (label: string, option: { present: boolean; monthlyCost: number | null; monthlySaving: number | null }) => {
    if (option.present && option.monthlyCost !== null) {
      return { value: money(option.monthlyCost), label };
    }
    return { value: "\u00b7", label: `${label} \u00b7 no proposal on file` };
  };
  coverPage(pdf, {
    contextRight: `CASE ${report.caseReference} \u00b7 ${generatedDate.toUpperCase()}`,
    eyebrow: "FOUNDATION-1 \u00b7 FUNDER PROPOSAL REPORT",
    titleLine1: "Both proposals,",
    titleLine2: "one baseline.",
    lead: `The funders have returned their paper for this site. This report reads each proposal, checks it against the ${facts.billsCount} audited utility bills, and prices what each option costs per month and over ten years, individually and combined.`,
    subject: report.businessName,
    subjectDetail: `CASE ${report.caseReference} \u00b7 ${facts.provider} \u00b7 ${generatedDate}`,
    chips: [
      { text: `${facts.billsCount} audited utility bills`, tone: "cyan" },
      { text: "Funder paper reconciled", tone: "neutral" },
    ],
    stats: [
      { value: money(report.options.eskomMonthly), label: "Eskom today \u00b7 monthly ex VAT" },
      optionCell("Nedbank UFMS \u00b7 monthly position", report.options.ufms),
      optionCell("Green Share wheeling \u00b7 monthly position", report.options.wheeling),
      { ...optionCell("Combined \u00b7 monthly position", report.options.combined), accent: KIT_COLORS.amber },
    ],
    sourceNote: `Generated ${generatedDate} \u00b7 Every figure in this report is either read directly from the utility bills or stated on the funder's own paper. Where a proposal leaves a number out, the gap is filled from the bill audit, never the other way around.`,
  });
}

type ChargeRowSource = { label: string; detail?: string; amount: string; bold?: boolean };

function chargeRows(rows: ChargeRowSource[]): KitKeyValueRow[] {
  return rows.map((row) => ({ label: row.label, value: row.amount, note: row.detail, strong: row.bold }));
}

function billPage(pdf: Pdf, report: FunderReport, context: string) {
  const facts = report.billFacts;
  let y = addKitPage(pdf, { eyebrow: "SECTION 01 \u00b7 THE AUDITED BASELINE", title: "The bill today.", context });
  y = paragraph(
    pdf,
    `Averaged across ${facts.billsCount} billing periods on ${facts.provider} (${facts.tariffNames.join(", ") || "tariff on file"}), the site takes ${units(facts.monthlyKwh)} kWh a month and pays ${money(facts.monthlySpendExVat)} ex VAT. That total is made of three different kinds of charge.`,
    KIT_PAGE.margin,
    y,
    { size: 8.8, color: inkTint(KIT_INK.body) },
    KIT_PAGE.contentWidth,
    { lineHeight: 4.6 },
  );
  y += 5;

  const tou = facts.tou;
  const touRows: ChargeRowSource[] = [];
  const touDefs = [
    ["Peak energy", tou.peak, "Weekday mornings and early evenings"],
    ["Standard energy", tou.standard, "The rest of the working day"],
    ["Off-peak energy", tou.offpeak, "Nights and weekends"],
  ] as const;
  for (const [label, period, when] of touDefs) {
    if (period.spend === 0 && period.kwh === 0) continue;
    touRows.push({
      label: `${label} \u00b7 ${units(period.kwh)} kWh at about R${period.rate.toFixed(2)} per kWh`,
      detail: when,
      amount: money(period.spend),
    });
  }
  const energyTotal = tou.peak.spend + tou.standard.spend + tou.offpeak.spend;
  touRows.push({ label: "Electricity subtotal", amount: money(energyTotal), bold: true });
  monoLabel(pdf, "1 \u00b7 THE ELECTRICITY ITSELF", KIT_PAGE.margin, y);
  y = keyValueRows(pdf, y + 2.4, chargeRows(touRows));
  y += 7;

  const meterRows: ChargeRowSource[] = facts.meterCharges.map((line) => ({ label: line.label, amount: money(line.amount) }));
  const meterTotal = facts.meterCharges.reduce((total, line) => total + line.amount, 0);
  meterRows.push({ label: "Meter charges subtotal", amount: money(meterTotal), bold: true });
  monoLabel(pdf, "2 \u00b7 CHARGES FOR PULLING POWER THROUGH THE ESKOM METER", KIT_PAGE.margin, y);
  y = keyValueRows(pdf, y + 2.4, chargeRows(meterRows));
  y += 7;

  const connRows: ChargeRowSource[] = facts.connectionCharges.map((line) => ({ label: line.label, amount: money(line.amount) }));
  const connTotal = facts.connectionCharges.reduce((total, line) => total + line.amount, 0);
  connRows.push({ label: "Connection subtotal", amount: money(connTotal), bold: true });
  monoLabel(pdf, "3 \u00b7 CHARGES FOR BEING CONNECTED AT ALL", KIT_PAGE.margin, y);
  y = keyValueRows(pdf, y + 2.4, chargeRows(connRows));
  y += 8;

  statStrip(pdf, y, 20, [
    { value: money(report.options.eskomMonthly), label: "Average monthly bill ex VAT", accent: KIT_COLORS.amber },
    { value: units(facts.monthlyKwh), label: "kWh taken in an average month" },
    { value: String(facts.billsCount), label: "Billing periods reconciled" },
  ], { valueSize: 11 });
}

function ufmsPage(pdf: Pdf, report: FunderReport, context: string) {
  let y = addKitPage(pdf, { eyebrow: "SECTION 02 \u00b7 THE ON-SITE PROPOSAL", title: "What Nedbank proposes: UFMS.", context });
  const ex = report.ufmsExtraction;
  const data = report.clientSavingsData;
  const opt = report.options.ufms;
  if (!opt.present || !ex) {
    paragraph(pdf, "No UFMS proposal has been returned for this site yet.", KIT_PAGE.margin, y, { size: 8.8, color: inkTint(KIT_INK.body) }, KIT_PAGE.contentWidth, { lineHeight: 4.6 });
    return;
  }
  y = paragraph(
    pdf,
    `Nedbank and Eqstra's Utility Full Maintenance Service puts a ${data.system.solarKwp} kWp solar system with a ${data.system.batteryKwh} kWh battery on the site, fully maintained and insured, for one monthly charge. Their proposal (${opt.sourceFileName ?? "on file"}) states:`,
    KIT_PAGE.margin,
    y,
    { size: 8.8, color: inkTint(KIT_INK.body) },
    KIT_PAGE.contentWidth,
    { lineHeight: 4.6 },
  );
  y += 5;
  y = statStrip(pdf, y, 23.3, [
    { value: money(data.ufms.monthlyCharge), label: `Monthly charge \u00b7 escalates ${data.ufms.escalationPct}% for ${data.ufms.termYears} years` },
    { value: `${data.system.solarKwp} kWp + ${data.system.batteryKwh} kWh`, label: `System \u00b7 up to ${units(data.system.monthlyGenerationKwh)} kWh a month` },
    { value: money(opt.monthlyCost ?? 0), label: `Bill after \u00b7 ${(opt.monthlySaving ?? 0) >= 0 ? "saves" : "adds"} ${money(Math.abs(opt.monthlySaving ?? 0))} a month`, accent: (opt.monthlySaving ?? 0) >= 0 ? KIT_COLORS.green : KIT_COLORS.red },
  ]);
  y += 9;

  const facts = report.billFacts;
  const energyTotal = facts.tou.peak.spend + facts.tou.standard.spend + facts.tou.offpeak.spend;
  const meterTotal = facts.meterCharges.reduce((total, line) => total + line.amount, 0);
  const connTotal = facts.connectionCharges.reduce((total, line) => total + line.amount, 0);
  monoLabel(pdf, "WHAT STOPS, WHAT STARTS", KIT_PAGE.margin, y);
  y = keyValueRows(pdf, y + 2.4, chargeRows([
    {
      label: "Eskom electricity and meter charges stop",
      detail: "Units are made on the roof, so they never come through the Eskom meter.",
      amount: `- ${money(energyTotal + meterTotal)}`,
    },
    {
      label: "One monthly charge to the bank starts",
      detail: "System, insurance and maintenance included, as stated on the proposal.",
      amount: `+ ${money(data.ufms.monthlyCharge)}`,
    },
    {
      label: "The Eskom connection stays",
      detail: "Eskom remains the backup supply.",
      amount: `+ ${money(connTotal)}`,
    },
    { label: "New monthly position", amount: money(opt.monthlyCost ?? 0), bold: true },
  ]));
  y += 6;

  if (report.funderClaims.ufmsTenYearSavingClaim !== null) {
    sourceNote(
      pdf,
      `The funder's own paper estimates a ten-year saving of ${money(report.funderClaims.ufmsTenYearSavingClaim)} for this option. Section 05 shows the ten-year picture computed from the audited bills alongside that claim.`,
      y,
    );
  }
}

function wheelingPage(pdf: Pdf, report: FunderReport, context: string) {
  let y = addKitPage(pdf, { eyebrow: "SECTION 03 \u00b7 THE WHEELED PROPOSAL", title: "What Green Share proposes: wheeling.", context, tone: KIT_COLORS.cyan });
  const data = report.clientSavingsData;
  const opt = report.options.wheeling;
  if (!opt.present) {
    paragraph(pdf, "No wheeling proposal has been returned for this site yet.", KIT_PAGE.margin, y, { size: 8.8, color: inkTint(KIT_INK.body) }, KIT_PAGE.contentWidth, { lineHeight: 4.6 });
    return;
  }
  const facts = report.billFacts;
  y = paragraph(
    pdf,
    `Green Share delivers solar energy from their own plant to the existing meter through the grid. No equipment on site, no capital, no credit check: the electricity units are simply repriced at a fixed R${data.wheeling.ratePerKwh.toFixed(2)} per kWh, with escalation capped at ${data.wheeling.escalationPct}% a year for ${data.wheeling.termYears} years, as stated on their proposal.`,
    KIT_PAGE.margin,
    y,
    { size: 8.8, color: inkTint(KIT_INK.body) },
    KIT_PAGE.contentWidth,
    { lineHeight: 4.6 },
  );
  y += 5;
  y = statStrip(pdf, y, 23.3, [
    { value: `R${data.wheeling.ratePerKwh.toFixed(2)}/kWh`, label: `Wheeled rate \u00b7 capped at ${data.wheeling.escalationPct}% escalation`, accent: KIT_COLORS.cyan },
    { value: money(facts.energyMonthlySpend), label: "What it reprices \u00b7 energy lines only" },
    { value: money(opt.monthlyCost ?? 0), label: `Bill after \u00b7 ${(opt.monthlySaving ?? 0) >= 0 ? "saves" : "adds"} ${money(Math.abs(opt.monthlySaving ?? 0))} a month`, accent: (opt.monthlySaving ?? 0) >= 0 ? KIT_COLORS.green : KIT_COLORS.red },
  ]);
  y += 9;

  monoLabel(pdf, "WHAT CHANGES, WHAT STAYS", KIT_PAGE.margin, y);
  keyValueRows(pdf, y + 2.4, chargeRows([
    {
      label: "The electricity units, repriced",
      detail: `${units(facts.monthlyKwh)} kWh at R${data.wheeling.ratePerKwh.toFixed(2)} per kWh instead of ${money(facts.energyMonthlySpend)} on Eskom's energy rates.`,
      amount: money(facts.monthlyKwh * data.wheeling.ratePerKwh),
    },
    {
      label: "Meter and connection charges stay with Eskom",
      detail: "Wheeling reprices energy only; network and connection charges survive on the Eskom bill.",
      amount: `+ ${money(facts.monthlySpendExVat - facts.energyMonthlySpend)}`,
    },
    { label: "New monthly position", amount: money(opt.monthlyCost ?? 0), bold: true },
  ]));
}

function combinedPage(pdf: Pdf, report: FunderReport, context: string) {
  let y = addKitPage(pdf, { eyebrow: "SECTION 04 \u00b7 BOTH TOGETHER", title: "Both options, one waterfall.", context, tone: KIT_COLORS.green });
  const opt = report.options.combined;
  if (!opt.present || opt.monthlyCost === null) {
    paragraph(pdf, "The combined picture becomes available once both funder proposals are on file for this site.", KIT_PAGE.margin, y, { size: 8.8, color: inkTint(KIT_INK.body) }, KIT_PAGE.contentWidth, { lineHeight: 4.6 });
    return;
  }
  y = paragraph(
    pdf,
    "The two options are not rivals: they cover different parts of the bill. The on-site UFMS system serves the load first; wheeling then reprices only the residual units the system cannot reach. The same unit of electricity is never paid for twice.",
    KIT_PAGE.margin,
    y,
    { size: 8.8, color: inkTint(KIT_INK.body) },
    KIT_PAGE.contentWidth,
    { lineHeight: 4.6 },
  );
  y += 5;
  y = statStrip(pdf, y, 23.3, [
    { value: money(report.options.eskomMonthly), label: "Eskom today \u00b7 monthly ex VAT" },
    { value: money(opt.monthlyCost), label: "Combined position \u00b7 funded charge + wheeled residual + retained Eskom" },
    { value: `${(opt.monthlySaving ?? 0) >= 0 ? "-" : "+"} ${money(Math.abs(opt.monthlySaving ?? 0))}`, label: (opt.monthlySaving ?? 0) >= 0 ? "Kept in the business every month" : "Above today's bill every month", accent: (opt.monthlySaving ?? 0) >= 0 ? KIT_COLORS.green : KIT_COLORS.red },
  ]);
  y += 9;

  const ufmsSaving = report.options.ufms.monthlySaving ?? 0;
  const wheelingSaving = report.options.wheeling.monthlySaving ?? 0;
  const cautionHeight = 26;
  panel(pdf, KIT_PAGE.margin, y, KIT_PAGE.contentWidth, cautionHeight);
  accentBar(pdf, KIT_PAGE.margin, y, cautionHeight, KIT_COLORS.amber);
  monoLabel(pdf, "READ THE COMBINED NUMBER CAREFULLY", KIT_PAGE.margin + 5.6, y + 6.4, {
    size: 6,
    color: blend(KIT_COLORS.amber, 0.85, KIT_COLORS.panel),
    trackingEm: 0.14,
  });
  paragraph(
    pdf,
    `It is deliberately NOT the two savings added together (${money(ufmsSaving)} + ${money(wheelingSaving)}). Once the on-site system is serving the load, far fewer units are left for wheeling to reprice: the combined saving is computed on that honest waterfall.`,
    KIT_PAGE.margin + 5.6,
    y + 11.6,
    { size: 8.2, color: inkTint(KIT_INK.body, KIT_COLORS.panel) },
    KIT_PAGE.contentWidth - 11.2,
    { lineHeight: 4.1 },
  );
}

function tenYearPage(pdf: Pdf, report: FunderReport, context: string) {
  let y = addKitPage(pdf, { eyebrow: "SECTION 05 \u00b7 TEN YEARS SIDE BY SIDE", title: "Cumulative cost of each path.", context });
  const ten = report.clientSavingsData.tenYear;
  if (ten.eskom.length === 0) {
    paragraph(pdf, "The ten-year projection is unavailable without the verified bill audit.", KIT_PAGE.margin, y, { size: 8.8, color: inkTint(KIT_INK.body) }, KIT_PAGE.contentWidth, { lineHeight: 4.6 });
    return;
  }
  y = paragraph(
    pdf,
    "Cumulative cost of each path, lower is better: anchored to the funder-quoted monthly charge and wheeling rate and to the audited bill. Eskom's path follows the escalation the funders themselves apply to the baseline.",
    KIT_PAGE.margin,
    y,
    { size: 8.8, color: inkTint(KIT_INK.body) },
    KIT_PAGE.contentWidth,
    { lineHeight: 4.6 },
  );
  y += 8;

  const chartX = KIT_PAGE.margin;
  const chartH = 52;
  const chartW = KIT_PAGE.contentWidth;
  const seriesDefs = [
    { name: "Eskom", values: ten.eskom, color: KIT_COLORS.ink },
    { name: "UFMS", values: ten.ufms, color: KIT_COLORS.green },
    { name: "Wheeling", values: ten.wheeling, color: KIT_COLORS.cyan },
    { name: "Combined", values: ten.combined, color: KIT_COLORS.amber },
  ].filter((series) => series.values.length === 10);
  const maxValue = ten.chartMaxRands || Math.max(...ten.eskom);
  for (let grid = 0; grid <= 4; grid += 1) {
    const gy = y + (chartH * grid) / 4;
    hairline(pdf, chartX, gy, chartX + chartW, gy, { alpha: KIT_INK.softLine });
    monoLabel(pdf, compactMoney(maxValue * (1 - grid / 4)), chartX, gy - 1.2, { size: 5.4, alpha: KIT_INK.ghost, trackingEm: 0.05 });
  }
  for (const series of seriesDefs) {
    pdf.setDrawColor(series.color[0], series.color[1], series.color[2]);
    pdf.setLineWidth(0.55);
    let previousX: number | null = null;
    let previousY: number | null = null;
    series.values.forEach((value, index) => {
      const px = chartX + (chartW * index) / 9;
      const py = y + chartH - (chartH * value) / maxValue;
      if (previousX !== null && previousY !== null) pdf.line(previousX, previousY, px, py);
      previousX = px;
      previousY = py;
    });
  }
  let legendX = chartX;
  const legendY = y + chartH + 5.4;
  for (const series of seriesDefs) {
    pdf.setFillColor(series.color[0], series.color[1], series.color[2]);
    pdf.rect(legendX, legendY - 2.2, 3.4, 1.1, "F");
    monoLabel(pdf, series.name, legendX + 4.6, legendY - 1, { size: 5.6, alpha: KIT_INK.dim, trackingEm: 0.06 });
    legendX += 34;
  }
  y = legendY + 7;

  const pickYears = [0, 2, 4, 6, 9];
  y = dataTable(pdf, y, pickYears, [
    { label: "Year", width: 34, strong: true, value: (index) => `Year ${index + 1}` },
    ...seriesDefs.map((series, seriesIndex) => ({
      label: series.name,
      width: (KIT_PAGE.contentWidth - 34) / seriesDefs.length,
      align: "right" as const,
      value: (index: number) => money(series.values[index]),
    })),
  ], { fontSize: 7.6 });
  y += 7;

  const eskomTotal = ten.eskom[9];
  const bestSeries = seriesDefs
    .filter((series) => series.name !== "Eskom")
    .sort((a, b) => a.values[9] - b.values[9])[0];
  if (bestSeries) {
    paragraph(
      pdf,
      `Over ten years the ${bestSeries.name} path keeps ${money(eskomTotal - bestSeries.values[9])} in the business relative to staying on Eskom's path${report.funderClaims.ufmsTenYearSavingClaim !== null ? ` (the funder's own paper claims ${money(report.funderClaims.ufmsTenYearSavingClaim)} for the UFMS option on their assumptions)` : ""}.`,
      KIT_PAGE.margin,
      y,
      { size: 8.8, color: inkTint(0.86) },
      KIT_PAGE.contentWidth,
      { lineHeight: 4.6 },
    );
  }
}

function nextStepsPage(pdf: Pdf, report: FunderReport, context: string) {
  let y = addKitPage(pdf, { eyebrow: "SECTION 06 \u00b7 THE JOURNEY FROM HERE", title: "From proposals to savings from day one.", context });
  y = stageJourney(pdf, y + 2, [
    { title: "Screen", state: "done" },
    { title: "Evidence", state: "done" },
    { title: "Foundation-1 Migration Report", state: "done" },
    { title: "Non-binding Expression of Interest", state: "done" },
    { title: "Formal proposals", detail: "This report: both funder proposals read, checked against the audited bills and priced side by side.", state: "current" },
    { title: "Verification", detail: "Foundation-1 confirms the verification documents and hands the case to the chosen funder or funders.", state: "ahead" },
    { title: "Term sheet", detail: "The funder issues formal terms on their own paper. Signing starts the contracting clock.", state: "ahead" },
    { title: "Migration", detail: "Site verification, final contracting, installation or switch-on. Foundation-1 manages the process end to end.", state: "ahead" },
    { title: "Savings from day one", detail: "The new monthly position applies from the first billing cycle after go-live.", state: "final" },
  ]);
  y += 2;
  const contact = report.clientSavingsData.contact;
  darkCallout(pdf, y, 24, {
    eyebrow: "The desk that owns this case",
    title: `${contact.name} \u00b7 Foundation-1 (Pty) Ltd`,
    body: `${contact.email} \u00b7 ${contact.phone} \u00b7 Every number in this report traces to the audited bills or to the funders' own paper.`,
  });
}

export function funderReportPdfFilename(report: FunderReport) {
  const company = sanitizeFileSegment(report.businessName) || "client";
  return `foundation-1-funder-report-${company}-${sanitizeFileSegment(report.caseReference)}.pdf`;
}

/** Render the funder report to PDF bytes (A4, house document design system). */
export function buildFunderReportPdf(report: FunderReport) {
  setPartnerNeutralCopy(false);
  try {
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    pdf.setProperties({
      title: `Foundation-1 Funder Proposal Report: ${report.businessName}`,
      subject: "Returned funder proposals explained against the audited Eskom baseline",
      author: "Foundation-1 (Pty) Ltd",
      creator: "Foundation-1 1-MI",
      keywords: "renewable energy, UFMS, wheeling, funder proposal, savings report",
    });
    const context = `CASE ${report.caseReference}`;
    buildCover(pdf, report);
    billPage(pdf, report, context);
    ufmsPage(pdf, report, context);
    wheelingPage(pdf, report, context);
    combinedPage(pdf, report, context);
    tenYearPage(pdf, report, context);
    nextStepsPage(pdf, report, context);
    footerBand(pdf, "Funder proposal report", context);
    return {
      bytes: new Uint8Array(pdf.output("arraybuffer")),
      filename: funderReportPdfFilename(report),
      pageCount: pdf.getNumberOfPages(),
    };
  } finally {
    setPartnerNeutralCopy(true);
  }
}

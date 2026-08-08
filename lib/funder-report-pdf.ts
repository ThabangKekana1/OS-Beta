/**
 * FOUNDATION-1 FUNDER-REPORT PDF — server-rendered report artifact (v1).
 *
 * jsPDF A4 in the house print style of `lib/migration-proposal-pdf.ts`, so
 * the report ships in production without the presentations worker. The full
 * R3F migration-path deck is generated offline from the same
 * ClientSavingsData JSON (see `lib/funder-report-pipeline.ts` for the three
 * commands).
 *
 * CONFIDENTIALITY: this document is client-facing. It contains ONLY
 * bill-derived and funder-stated figures. No clone-engine constants,
 * cross-check reasoning or prediction internals may be rendered here.
 */
import { jsPDF } from "jspdf";
import { sanitizeFileSegment } from "@/lib/download-utils";
import type { FunderReport } from "@/lib/funder-report";

const PAGE_W = 210;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = 286;
const INK: [number, number, number] = [16, 28, 22];
const MUTED: [number, number, number] = [94, 108, 100];
const GREEN: [number, number, number] = [35, 155, 102];
const PALE: [number, number, number] = [238, 247, 241];
const RULE: [number, number, number] = [216, 226, 220];
const AMBER: [number, number, number] = [176, 122, 30];
const BLUE: [number, number, number] = [52, 96, 160];

type Pdf = jsPDF;

function money(value: number) {
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
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

function paragraph(
  pdf: Pdf,
  text: string,
  x: number,
  y: number,
  width: number,
  options: { size?: number; color?: [number, number, number] } = {},
) {
  const size = options.size ?? 9;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(size);
  pdf.setTextColor(...(options.color ?? MUTED));
  const lines = pdf.splitTextToSize(text, width) as string[];
  pdf.text(lines, x, y, { lineHeightFactor: 1.35 });
  return y + Math.max(1, lines.length) * size * 0.5;
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

type Row = { label: string; detail?: string; amount: string; bold?: boolean };

function chargeTable(pdf: Pdf, y: number, title: string, rows: Row[]) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(...INK);
  pdf.text(title, MARGIN, y);
  y += 4;
  pdf.setFillColor(...INK);
  pdf.rect(MARGIN, y, CONTENT_W, 8, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(7);
  pdf.text("ITEM", MARGIN + 2.5, y + 5.4);
  pdf.text("MONTHLY (R, EX VAT)", PAGE_W - MARGIN - 2.5, y + 5.4, { align: "right" });
  y += 8;
  for (const row of rows) {
    const height = row.detail ? 11 : 8;
    pdf.setDrawColor(...RULE);
    pdf.line(MARGIN, y + height, PAGE_W - MARGIN, y + height);
    pdf.setTextColor(...INK);
    pdf.setFont("helvetica", row.bold ? "bold" : "normal");
    pdf.setFontSize(8.2);
    pdf.text(row.label, MARGIN + 2.5, y + 5.4);
    pdf.text(row.amount, PAGE_W - MARGIN - 2.5, y + 5.4, { align: "right" });
    if (row.detail) {
      pdf.setTextColor(...MUTED);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6.6);
      pdf.text(row.detail, MARGIN + 2.5, y + 9);
    }
    y += height;
  }
  return y + 6;
}

/* ---------------------------------------------------------------- pages */

function coverPage(pdf: Pdf, report: FunderReport) {
  const facts = report.billFacts;
  pdf.setFillColor(...PALE);
  pdf.rect(0, 0, PAGE_W, 92, "F");
  pdf.setTextColor(...GREEN);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("FOUNDATION-1 (PTY) LTD", MARGIN, 24);
  pdf.setTextColor(...INK);
  pdf.setFontSize(26);
  pdf.text("Funder Proposal Report", MARGIN, 40);
  pdf.setFontSize(13);
  pdf.setFont("helvetica", "normal");
  pdf.text(report.businessName, MARGIN, 50);
  pdf.setTextColor(...MUTED);
  pdf.setFontSize(9);
  pdf.text(
    `Case ${report.caseReference} - generated ${report.generatedAt.slice(0, 10)} - built from ${facts.billsCount} audited utility bills and the funder proposals issued for this site.`,
    MARGIN,
    58,
    { maxWidth: CONTENT_W },
  );

  let y = 104;
  y = sectionTitle(pdf, "The one-page answer", "Both proposals, one report", y);
  y = paragraph(
    pdf,
    "The funders have returned their paper for your site. This report reads each proposal, checks it against your own audited Eskom bills, and shows what each option costs you per month and over ten years - individually and combined.",
    MARGIN,
    y,
    CONTENT_W,
  );
  y += 8;

  const cardW = (CONTENT_W - 12) / 4;
  metric(pdf, MARGIN, y, cardW, "Eskom today", money(report.options.eskomMonthly), "Average monthly bill, ex VAT");
  const cards: Array<{ label: string; option: typeof report.options.ufms }> = [
    { label: "Nedbank UFMS", option: report.options.ufms },
    { label: "Green Share wheeling", option: report.options.wheeling },
    { label: "Combined", option: report.options.combined },
  ];
  cards.forEach((card, index) => {
    const x = MARGIN + (cardW + 4) * (index + 1);
    if (card.option.present && card.option.monthlyCost !== null) {
      const saving = card.option.monthlySaving ?? 0;
      metric(
        pdf,
        x,
        y,
        cardW,
        card.label,
        money(card.option.monthlyCost),
        `${saving >= 0 ? "Saves" : "Adds"} ${money(Math.abs(saving))}/month vs Eskom`,
      );
    } else {
      metric(pdf, x, y, cardW, card.label, "-", "No proposal on file for this option yet");
    }
  });
  y += 44;

  y = paragraph(
    pdf,
    "Every figure in this report is either read directly from your utility bills or stated on the funder's own paper. Where a proposal leaves a number out, the gap is filled from your bill audit - never the other way around.",
    MARGIN,
    y,
    CONTENT_W,
    { size: 8.4 },
  );
}

function billPage(pdf: Pdf, report: FunderReport) {
  const facts = report.billFacts;
  addPage(pdf, "Your bill today");
  let y = sectionTitle(pdf, "Section 01", "Your bill today", 30);
  y = paragraph(
    pdf,
    `Averaged across ${facts.billsCount} billing periods on ${facts.provider} (${facts.tariffNames.join(", ") || "tariff on file"}), your site takes ${Math.round(facts.monthlyKwh).toLocaleString("en-ZA")} kWh a month and pays ${money(facts.monthlySpendExVat)} ex VAT. That total is made of three different kinds of charge:`,
    MARGIN,
    y,
    CONTENT_W,
  );
  y += 6;

  const tou = facts.tou;
  const touRows: Row[] = [];
  const touDefs = [
    ["Peak energy", tou.peak, "Weekday mornings and early evenings"],
    ["Standard energy", tou.standard, "The rest of the working day"],
    ["Off-peak energy", tou.offpeak, "Nights and weekends"],
  ] as const;
  for (const [label, period, when] of touDefs) {
    if (period.spend === 0 && period.kwh === 0) continue;
    touRows.push({
      label: `${label} - ${Math.round(period.kwh).toLocaleString("en-ZA")} kWh @ ~R${period.rate.toFixed(2)}/kWh`,
      detail: when,
      amount: money(period.spend),
    });
  }
  const energyTotal = tou.peak.spend + tou.standard.spend + tou.offpeak.spend;
  touRows.push({ label: "Electricity subtotal", amount: money(energyTotal), bold: true });
  y = chargeTable(pdf, y, "1. The electricity itself", touRows);

  const meterRows: Row[] = facts.meterCharges.map((line) => ({
    label: line.label,
    amount: money(line.amount),
  }));
  const meterTotal = facts.meterCharges.reduce((total, line) => total + line.amount, 0);
  meterRows.push({ label: "Meter charges subtotal", amount: money(meterTotal), bold: true });
  y = chargeTable(pdf, y, "2. Charges for pulling power through your Eskom meter", meterRows);

  const connRows: Row[] = facts.connectionCharges.map((line) => ({
    label: line.label,
    amount: money(line.amount),
  }));
  const connTotal = facts.connectionCharges.reduce((total, line) => total + line.amount, 0);
  connRows.push({ label: "Connection subtotal", amount: money(connTotal), bold: true });
  y = chargeTable(pdf, y, "3. Charges for being connected at all", connRows);

  chargeTable(pdf, y, "Total", [
    { label: "Your average monthly bill (ex VAT)", amount: money(report.options.eskomMonthly), bold: true },
  ]);
}

function ufmsPage(pdf: Pdf, report: FunderReport) {
  addPage(pdf, "What Nedbank proposes");
  let y = sectionTitle(pdf, "Section 02", "What Nedbank proposes: UFMS", 30);
  const ex = report.ufmsExtraction;
  const data = report.clientSavingsData;
  const opt = report.options.ufms;
  if (!opt.present || !ex) {
    paragraph(pdf, "No UFMS proposal has been returned for this site yet.", MARGIN, y, CONTENT_W);
    return;
  }
  y = paragraph(
    pdf,
    `Nedbank/Eqstra's Utility Full Maintenance Service puts a ${data.system.solarKwp} kWp solar system with a ${data.system.batteryKwh} kWh battery on your own site, fully maintained and insured, for one monthly charge. Their proposal (${opt.sourceFileName ?? "on file"}) states:`,
    MARGIN,
    y,
    CONTENT_W,
  );
  y += 6;

  const cardW = (CONTENT_W - 8) / 3;
  metric(pdf, MARGIN, y, cardW, "Monthly charge", money(data.ufms.monthlyCharge), `Escalates ${data.ufms.escalationPct}% a year, fixed for ${data.ufms.termYears} years`);
  metric(pdf, MARGIN + cardW + 4, y, cardW, "System", `${data.system.solarKwp} kWp + ${data.system.batteryKwh} kWh`, `Up to ${Math.round(data.system.monthlyGenerationKwh).toLocaleString("en-ZA")} kWh generated per month`);
  metric(pdf, MARGIN + (cardW + 4) * 2, y, cardW, "Your bill after", money(opt.monthlyCost ?? 0), `${(opt.monthlySaving ?? 0) >= 0 ? "Saves" : "Adds"} ${money(Math.abs(opt.monthlySaving ?? 0))}/month vs Eskom today`);
  y += 42;

  const facts = report.billFacts;
  const energyTotal = facts.tou.peak.spend + facts.tou.standard.spend + facts.tou.offpeak.spend;
  const meterTotal = facts.meterCharges.reduce((total, line) => total + line.amount, 0);
  const connTotal = facts.connectionCharges.reduce((total, line) => total + line.amount, 0);
  y = chargeTable(pdf, y, "What stops, what starts", [
    {
      label: "You stop paying Eskom for electricity and meter charges",
      detail: "Units are made on your roof, so they never come through the Eskom meter.",
      amount: `- ${money(energyTotal + meterTotal)}`,
    },
    {
      label: "You start paying the Bank one monthly charge",
      detail: "System, insurance and maintenance included, as stated on the proposal.",
      amount: `+ ${money(data.ufms.monthlyCharge)}`,
    },
    {
      label: "You keep paying Eskom for the connection",
      detail: "Eskom stays as your backup supply.",
      amount: `+ ${money(connTotal)}`,
    },
    { label: "Your new monthly position", amount: money(opt.monthlyCost ?? 0), bold: true },
  ]);

  if (report.funderClaims.ufmsTenYearSavingClaim !== null) {
    y = paragraph(
      pdf,
      `The funder's own paper estimates a ten-year saving of ${money(report.funderClaims.ufmsTenYearSavingClaim)} for this option. Section 05 shows the ten-year picture computed from your audited bills alongside that claim.`,
      MARGIN,
      y + 2,
      CONTENT_W,
      { size: 8.4 },
    );
  }
}

function wheelingPage(pdf: Pdf, report: FunderReport) {
  addPage(pdf, "What Green Share proposes");
  let y = sectionTitle(pdf, "Section 03", "What Green Share proposes: wheeling", 30);
  const data = report.clientSavingsData;
  const opt = report.options.wheeling;
  if (!opt.present) {
    paragraph(pdf, "No wheeling proposal has been returned for this site yet.", MARGIN, y, CONTENT_W);
    return;
  }
  const facts = report.billFacts;
  y = paragraph(
    pdf,
    `Green Share delivers solar energy from their own plant to your existing meter through the grid. No equipment on your site, no capital, no credit check - your electricity units are simply repriced at a fixed R${data.wheeling.ratePerKwh.toFixed(2)}/kWh (escalation capped at ${data.wheeling.escalationPct}% a year for ${data.wheeling.termYears} years, as stated on their proposal).`,
    MARGIN,
    y,
    CONTENT_W,
  );
  y += 6;

  const cardW = (CONTENT_W - 8) / 3;
  metric(pdf, MARGIN, y, cardW, "Wheeled rate", `R${data.wheeling.ratePerKwh.toFixed(2)}/kWh`, `Fixed price, capped at ${data.wheeling.escalationPct}% escalation`);
  metric(pdf, MARGIN + cardW + 4, y, cardW, "What it reprices", money(facts.energyMonthlySpend), "Your monthly electricity lines only");
  metric(pdf, MARGIN + (cardW + 4) * 2, y, cardW, "Your bill after", money(opt.monthlyCost ?? 0), `${(opt.monthlySaving ?? 0) >= 0 ? "Saves" : "Adds"} ${money(Math.abs(opt.monthlySaving ?? 0))}/month vs Eskom today`);
  y += 42;

  chargeTable(pdf, y, "What changes, what stays", [
    {
      label: "Your electricity units, repriced",
      detail: `${Math.round(facts.monthlyKwh).toLocaleString("en-ZA")} kWh x R${data.wheeling.ratePerKwh.toFixed(2)}/kWh instead of ${money(facts.energyMonthlySpend)} on Eskom's energy rates.`,
      amount: money(facts.monthlyKwh * data.wheeling.ratePerKwh),
    },
    {
      label: "Meter and connection charges stay with Eskom",
      detail: "Wheeling reprices energy only; network and connection charges survive on the Eskom bill.",
      amount: `+ ${money(facts.monthlySpendExVat - facts.energyMonthlySpend)}`,
    },
    { label: "Your new monthly position", amount: money(opt.monthlyCost ?? 0), bold: true },
  ]);
}

function combinedPage(pdf: Pdf, report: FunderReport) {
  addPage(pdf, "Both together");
  let y = sectionTitle(pdf, "Section 04", "Both options together", 30);
  const opt = report.options.combined;
  if (!opt.present || opt.monthlyCost === null) {
    paragraph(
      pdf,
      "The combined picture becomes available once both funder proposals are on file for this site.",
      MARGIN,
      y,
      CONTENT_W,
    );
    return;
  }
  y = paragraph(
    pdf,
    "The two options are not rivals - they cover different parts of your bill. The on-site UFMS system serves your load first; wheeling then reprices only the residual units the system cannot reach. The same unit of electricity is never paid for twice.",
    MARGIN,
    y,
    CONTENT_W,
  );
  y += 6;

  const cardW = (CONTENT_W - 8) / 3;
  metric(pdf, MARGIN, y, cardW, "Eskom today", money(report.options.eskomMonthly), "Average monthly bill, ex VAT");
  metric(pdf, MARGIN + cardW + 4, y, cardW, "Combined position", money(opt.monthlyCost), "UFMS charge + wheeled residual + retained Eskom charges");
  metric(pdf, MARGIN + (cardW + 4) * 2, y, cardW, "Monthly movement", `${(opt.monthlySaving ?? 0) >= 0 ? "-" : "+"} ${money(Math.abs(opt.monthlySaving ?? 0))}`, `${(opt.monthlySaving ?? 0) >= 0 ? "Kept in your business" : "Above today's bill"} every month`);
  y += 42;

  const ufmsSaving = report.options.ufms.monthlySaving ?? 0;
  const wheelingSaving = report.options.wheeling.monthlySaving ?? 0;
  paragraph(
    pdf,
    `Read the combined number carefully: it is deliberately NOT the two savings added together (${money(ufmsSaving)} + ${money(wheelingSaving)}). Once the on-site system is serving your load, far fewer units are left for wheeling to reprice - the combined saving is computed on that honest waterfall.`,
    MARGIN,
    y,
    CONTENT_W,
    { size: 8.4, color: AMBER },
  );
}

function tenYearPage(pdf: Pdf, report: FunderReport) {
  addPage(pdf, "Ten years side by side");
  let y = sectionTitle(pdf, "Section 05", "Ten years side by side", 30);
  const ten = report.clientSavingsData.tenYear;
  if (ten.eskom.length === 0) {
    paragraph(pdf, "Ten-year projection unavailable without the verified bill audit.", MARGIN, y, CONTENT_W);
    return;
  }
  y = paragraph(
    pdf,
    "Cumulative cost of each path, anchored to the funder-quoted monthly charge and wheeling rate and to your audited bill. Eskom's path follows the escalation the funders themselves apply to your baseline.",
    MARGIN,
    y,
    CONTENT_W,
  );
  y += 4;

  // Chart.
  const chartX = MARGIN;
  const chartY = y;
  const chartW = CONTENT_W;
  const chartH = 62;
  const seriesDefs = [
    { name: "Eskom", values: ten.eskom, color: INK },
    { name: "UFMS", values: ten.ufms, color: GREEN },
    { name: "Wheeling", values: ten.wheeling, color: BLUE },
    { name: "Combined", values: ten.combined, color: AMBER },
  ].filter((s) => s.values.length === 10);
  const maxValue = ten.chartMaxRands || Math.max(...ten.eskom);
  pdf.setDrawColor(...RULE);
  for (let grid = 0; grid <= 4; grid += 1) {
    const gy = chartY + (chartH * grid) / 4;
    pdf.line(chartX, gy, chartX + chartW, gy);
    pdf.setTextColor(...MUTED);
    pdf.setFontSize(6);
    pdf.text(money(maxValue * (1 - grid / 4)), chartX + 1, gy - 1);
  }
  for (const series of seriesDefs) {
    pdf.setDrawColor(...series.color);
    pdf.setLineWidth(0.7);
    let prevX: number | null = null;
    let prevY: number | null = null;
    series.values.forEach((value, index) => {
      const px = chartX + (chartW * index) / 9;
      const py = chartY + chartH - (chartH * value) / maxValue;
      if (prevX !== null && prevY !== null) pdf.line(prevX, prevY, px, py);
      prevX = px;
      prevY = py;
    });
  }
  pdf.setLineWidth(0.2);
  let legendX = chartX;
  const legendY = chartY + chartH + 6;
  for (const series of seriesDefs) {
    pdf.setFillColor(...series.color);
    pdf.rect(legendX, legendY - 2.4, 3, 3, "F");
    pdf.setTextColor(...INK);
    pdf.setFontSize(7);
    pdf.text(series.name, legendX + 4.5, legendY);
    legendX += pdf.getTextWidth(series.name) + 14;
  }
  y = legendY + 8;

  // Table: years 1, 3, 5, 7, 10 to keep it readable.
  const pickYears = [0, 2, 4, 6, 9];
  pdf.setFillColor(...INK);
  pdf.rect(MARGIN, y, CONTENT_W, 8, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(7);
  const colW = (CONTENT_W - 30) / seriesDefs.length;
  pdf.text("YEAR", MARGIN + 2.5, y + 5.4);
  seriesDefs.forEach((series, index) => {
    pdf.text(series.name.toUpperCase(), MARGIN + 30 + colW * index + colW - 2.5, y + 5.4, { align: "right" });
  });
  y += 8;
  for (const yearIndex of pickYears) {
    pdf.setDrawColor(...RULE);
    pdf.line(MARGIN, y + 8, PAGE_W - MARGIN, y + 8);
    pdf.setTextColor(...INK);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.6);
    pdf.text(`Year ${yearIndex + 1}`, MARGIN + 2.5, y + 5.4);
    seriesDefs.forEach((series, index) => {
      pdf.text(money(series.values[yearIndex]), MARGIN + 30 + colW * index + colW - 2.5, y + 5.4, { align: "right" });
    });
    y += 8;
  }
  y += 6;

  const eskomTotal = ten.eskom[9];
  const bestSeries = seriesDefs
    .filter((series) => series.name !== "Eskom")
    .sort((a, b) => a.values[9] - b.values[9])[0];
  if (bestSeries) {
    paragraph(
      pdf,
      `Over ten years the ${bestSeries.name} path keeps ${money(eskomTotal - bestSeries.values[9])} in your business relative to staying on Eskom's path${report.funderClaims.ufmsTenYearSavingClaim !== null ? ` (the funder's own paper claims ${money(report.funderClaims.ufmsTenYearSavingClaim)} for the UFMS option on their assumptions)` : ""}.`,
      MARGIN,
      y,
      CONTENT_W,
      { size: 8.6, color: INK },
    );
  }
}

function nextStepsPage(pdf: Pdf, report: FunderReport) {
  addPage(pdf, "Next steps");
  let y = sectionTitle(pdf, "Section 06", "Next steps", 30);
  const steps = [
    ["01", "Review this report", "Compare the monthly positions and the ten-year paths. Every number traces to your bills or the funders' own paper."],
    ["02", "Choose your path", "UFMS, wheeling, or both together - your Foundation-1 contact will walk you through the trade-offs for your operation."],
    ["03", "Sign the returned proposal", "The funder's formal proposal is on your dashboard ready for signature. Signing starts the contracting clock."],
    ["04", "Site and contracting", "Site verification, final contracting and installation scheduling follow - Foundation-1 manages the process end to end."],
  ];
  for (const [num, title, body] of steps) {
    pdf.setFillColor(...PALE);
    pdf.roundedRect(MARGIN, y, CONTENT_W, 22, 3, 3, "F");
    pdf.setTextColor(...GREEN);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(num, MARGIN + 5, y + 10);
    pdf.setTextColor(...INK);
    pdf.setFontSize(10);
    pdf.text(title, MARGIN + 18, y + 8);
    pdf.setTextColor(...MUTED);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(pdf.splitTextToSize(body, CONTENT_W - 24) as string[], MARGIN + 18, y + 13.5, { lineHeightFactor: 1.3 });
    y += 26;
  }
  y += 4;
  const contact = report.clientSavingsData.contact;
  pdf.setTextColor(...INK);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(`${contact.name} - Foundation-1 (Pty) Ltd`, MARGIN, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...MUTED);
  pdf.text(`${contact.email} - ${contact.phone}`, MARGIN, y + 6);
}

function addFooters(pdf: Pdf, report: FunderReport) {
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(...RULE);
    pdf.line(MARGIN, FOOTER_Y - 4, PAGE_W - MARGIN, FOOTER_Y - 4);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.6);
    pdf.setTextColor(...MUTED);
    pdf.text("FOUNDATION-1 (PTY) LTD - CONFIDENTIAL CLIENT REPORT", MARGIN, FOOTER_Y);
    pdf.text(`${report.caseReference} - ${page} / ${pages}`, PAGE_W - MARGIN, FOOTER_Y, { align: "right" });
  }
}

export function funderReportPdfFilename(report: FunderReport) {
  const company = sanitizeFileSegment(report.businessName) || "client";
  return `foundation-1-funder-report-${company}-${sanitizeFileSegment(report.caseReference)}.pdf`;
}

/** Render the funder report to PDF bytes (A4, house print style). */
export function buildFunderReportPdf(report: FunderReport) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  pdf.setProperties({
    title: `Foundation-1 Funder Proposal Report: ${report.businessName}`,
    subject: "Returned funder proposals explained against the audited Eskom baseline",
    author: "Foundation-1 (Pty) Ltd",
    creator: "Foundation-1 1OS",
    keywords: "renewable energy, UFMS, wheeling, funder proposal, savings report",
  });
  coverPage(pdf, report);
  billPage(pdf, report);
  ufmsPage(pdf, report);
  wheelingPage(pdf, report);
  combinedPage(pdf, report);
  tenYearPage(pdf, report);
  nextStepsPage(pdf, report);
  addFooters(pdf, report);
  return {
    bytes: new Uint8Array(pdf.output("arraybuffer")),
    filename: funderReportPdfFilename(report),
    pageCount: pdf.getNumberOfPages(),
  };
}

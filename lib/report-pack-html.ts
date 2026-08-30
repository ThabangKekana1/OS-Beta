import { ANALEMMA_PATH, ANALEMMA_SUN } from "@/lib/analemma";
import {
  ESKOM_TRAJECTORY,
  ONSITE_INCLUSIONS,
  VAT_RATE,
  GRID_EMISSION_FACTOR_KG_PER_KWH,
  billAt,
  cumulativeSaving,
  deriveReportPackFigures,
  tenYearSeries,
  type PackFigures,
  type ReportPackContext,
  type ReportPackDocumentId,
} from "@/lib/report-pack-core";
import { htmlToPdf } from "@/lib/html-pdf";

// =============================================================================
// The report-time document pack, rendered by the same engine as the website.
// Design language: NEW F-1 globals.css + the presentation kit theme, dark
// operating canvas, platform grid, tech glow, mono eyebrows, two-tone display
// type, the analemma. State of the art or it does not ship.
// =============================================================================

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const R = (value: number) =>
  `R${Math.round(value).toLocaleString("en-ZA").replace(/[\u00A0,]/g, " ")}`;
const Rc = (value: number) => {
  const [whole, cents] = value.toFixed(2).split(".");
  return `R${Number(whole).toLocaleString("en-ZA").replace(/[\u00A0,]/g, " ")}.${cents}`;
};
const Rk = (value: number) =>
  value >= 1_000_000 ? `R${(value / 1_000_000).toFixed(1)}m` : value >= 1000 ? `R${Math.round(value / 1000)}k` : R(value);
const num = (value: number) => Math.round(value).toLocaleString("en-ZA").replace(/,/g, " ");
const longDate = (date: Date) =>
  date.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });

const FONT_SANS = `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
const FONT_MONO = `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`;

const BASE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #050505; }
  body { font-family: ${FONT_SANS}; color: rgba(255,255,255,0.55);
         -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  .page { position: relative; overflow: hidden; background: #050505; color: rgba(255,255,255,0.55);
          page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .page.landscape { width: 297mm; height: 210mm; }
  .page.portrait { width: 210mm; height: 297mm; }

  .platform-grid { position: absolute; inset: 0; pointer-events: none;
    background-image:
      linear-gradient(rgba(255,255,255,0.05) 0.6px, transparent 0.6px),
      linear-gradient(90deg, rgba(255,255,255,0.05) 0.6px, transparent 0.6px);
    background-size: 17mm 17mm;
    -webkit-mask-image: linear-gradient(to bottom, #000 0%, transparent 92%);
    mask-image: linear-gradient(to bottom, #000 0%, transparent 92%); }
  .tech-glow { position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(circle at 22% 18%, rgba(103,232,249,0.10), transparent 26%),
      radial-gradient(circle at 78% 32%, rgba(167,139,250,0.13), transparent 30%),
      radial-gradient(circle at 50% 92%, rgba(255,255,255,0.05), transparent 28%); }

  .ink { color: #f5f5f5; }
  .dim { color: rgba(255,255,255,0.32); }
  .body-ink { color: rgba(255,255,255,0.55); }
  .gradient { background: linear-gradient(100deg, #fff 8%, #d4d4d8 48%, #a78bfa 82%, #67e8f9 108%);
              -webkit-background-clip: text; background-clip: text; color: transparent; }

  .mono { font-family: ${FONT_MONO}; }
  .eyebrow { font-family: ${FONT_MONO}; font-size: 6.4pt; letter-spacing: 0.2em;
             text-transform: uppercase; color: rgba(255,255,255,0.40); }
  .eyebrow.amber { color: rgba(253,230,138,0.72); }
  .eyebrow.cyan { color: rgba(165,243,252,0.62); }
  .eyebrow.violet { color: rgba(221,214,254,0.62); }
  .display { color: #f5f5f5; font-weight: 500; letter-spacing: -0.05em; line-height: 0.98; }

  .panel { background: #070707; border: 0.35mm solid rgba(255,255,255,0.10); border-radius: 2.6mm; }
  .panel-soft { background: rgba(255,255,255,0.02); }
  .chip { display: inline-flex; align-items: center; gap: 1.6mm; font-family: ${FONT_MONO};
          font-size: 5.6pt; letter-spacing: 0.14em; text-transform: uppercase;
          color: rgba(255,255,255,0.58); border: 0.3mm solid rgba(255,255,255,0.14);
          border-radius: 999px; padding: 1.3mm 3mm; background: rgba(255,255,255,0.035); }
  .chip.amber { color: rgba(253,230,138,0.85); border-color: rgba(253,230,138,0.30); background: rgba(253,230,138,0.06); }
  .chip.cyan { color: rgba(165,243,252,0.85); border-color: rgba(103,232,249,0.30); background: rgba(103,232,249,0.05); }
  .chip.green { color: rgba(187,247,208,0.9); border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.06); }
  .hairline { border: 0; border-top: 0.3mm solid rgba(255,255,255,0.10); }

  .footer-band { position: absolute; left: 0; right: 0; bottom: 0; padding: 0 14mm 7mm;
                 display: flex; justify-content: space-between; align-items: baseline; }
  .footer-band .rule { position: absolute; left: 14mm; right: 14mm; top: -3mm;
                       border-top: 0.3mm solid rgba(255,255,255,0.10); }
  .footer-band span { font-family: ${FONT_MONO}; font-size: 5.4pt; letter-spacing: 0.16em;
                      text-transform: uppercase; color: rgba(255,255,255,0.30); }

  table { border-collapse: collapse; width: 100%; }
  .brand-word { color: #f5f5f5; font-weight: 600; letter-spacing: 0.34em; font-size: 8.6pt;
                text-transform: uppercase; }
`;

function gradientLine(text: string, sizePt: number, options: { align?: "left" | "center"; id?: string } = {}): string {
  const align = options.align ?? "left";
  const gid = options.id ?? `grad${Math.abs(text.length * sizePt) | 0}`;
  const heightMm = (sizePt * 0.3528) * 1.22;
  const anchor = align === "center" ? `x="50%" text-anchor="middle"` : `x="0" text-anchor="start"`;
  return `
  <svg width="100%" height="${heightMm.toFixed(2)}mm" style="display:block; overflow:visible;">
    <defs>
      <linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="6%" stop-color="#ffffff"/>
        <stop offset="42%" stop-color="#d4d4d8"/>
        <stop offset="74%" stop-color="#a78bfa"/>
        <stop offset="100%" stop-color="#67e8f9"/>
      </linearGradient>
    </defs>
    <text ${anchor} y="${(heightMm * 0.82).toFixed(2)}mm" fill="url(#${gid})"
      font-family='${FONT_SANS}' font-weight="500" letter-spacing="-0.05em"
      font-size="${sizePt}pt">${esc(text)}</text>
  </svg>`;
}

function analemmaSvg(widthMm: number, options: { glow?: boolean } = {}): string {
  const height = (widthMm * 120) / 420;
  const glowAttr = options.glow
    ? `filter="drop-shadow(0 0 2.2mm rgba(186,230,253,0.30))"`
    : "";
  return `
  <svg width="${widthMm}mm" height="${height}mm" viewBox="0 0 420 120" fill="none" ${glowAttr}>
    <path d="${ANALEMMA_PATH}" stroke="rgba(248,250,252,0.10)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${ANALEMMA_PATH}" stroke="rgba(248,250,252,0.94)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${ANALEMMA_SUN.x}" cy="${ANALEMMA_SUN.y}" r="16" fill="rgba(186,230,253,0.20)"/>
    <circle cx="${ANALEMMA_SUN.x}" cy="${ANALEMMA_SUN.y}" r="7" fill="#ffffff"/>
  </svg>`;
}

function brandLockup(widthMm = 26): string {
  return `
  <div style="display:flex; align-items:center; gap:3.4mm;">
    ${analemmaSvg(widthMm)}
    <span class="brand-word">Foundation-1</span>
  </div>`;
}

function footerBand(doc: string, reference: string, page: string): string {
  return `
  <div class="footer-band">
    <div class="rule"></div>
    <span>FOUNDATION-1 &nbsp;·&nbsp; ${esc(doc)} &nbsp;·&nbsp; ${esc(reference)}</span>
    <span>${esc(page)}</span>
  </div>`;
}

function docShell(pages: string, orientation: "landscape" | "portrait"): string {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @page { size: A4 ${orientation}; margin: 0; }
  ${BASE_CSS}
</style></head>
<body>${pages}</body></html>`;
}

// ---------------------------------------------------------------- chart

function tenYearChartSvg(f: PackFigures, widthMm: number, heightMm: number): string {
  const s = tenYearSeries(f);
  const max = Math.max(...s.eskom) * 1.06;
  const padL = 13;
  const padR = 24;
  const padT = 4;
  const padB = 9;
  const W = 100;
  const H = 100 * (heightMm / widthMm);
  const x = (year: number) => padL + (year / 10) * (W - padL - padR);
  const y = (value: number) => padT + (1 - value / max) * (H - padT - padB);
  const line = (values: number[]) => values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");

  const gridLines = [0.25, 0.5, 0.75, 1]
    .map((fr) => {
      const gy = y(max * fr).toFixed(2);
      return `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="rgba(255,255,255,0.07)" stroke-width="0.22"/>
      <text x="${padL - 1.6}" y="${(Number(gy) + 1.1).toFixed(2)}" text-anchor="end" font-family='${FONT_MONO}' font-size="2.5" fill="rgba(255,255,255,0.30)">${Rk(max * fr)}</text>`;
    })
    .join("");

  const xLabels = [0, 2, 4, 6, 8, 10]
    .map((year) => `<text x="${x(year).toFixed(2)}" y="${H - 2.2}" text-anchor="middle" font-family='${FONT_MONO}' font-size="2.5" fill="rgba(255,255,255,0.30)">${year === 0 ? "NOW" : `YEAR ${year}`}</text>`)
    .join("");

  const onsiteCoincides = Math.abs(s.onsite[0] - s.blended[0]) < f.currentMonthly * 0.01;
  const series: { key: keyof typeof s; color: string; label: string; width: number }[] = [
    { key: "eskom", color: "rgba(255,255,255,0.50)", label: "ESKOM PATH · 13%", width: 0.5 },
    { key: "wheeled", color: "#22d3ee", label: "WHEELED ENERGY", width: 0.62 },
    ...(onsiteCoincides
      ? []
      : [{ key: "onsite" as const, color: "#fbbf24", label: "SOLAR ON SITE", width: 0.62 }]),
    { key: "blended", color: "#4ade80", label: "YOUR BLENDED PATH", width: 0.85 },
  ];

  const areaTop = line(s.eskom);
  const areaBottom = s.blended.map((v, i) => `${x(10 - i).toFixed(2)},${y(s.blended[10 - i]).toFixed(2)}`).join(" ");

  const paths = series
    .map(({ key, color, width }) =>
      `<polyline points="${line(s[key] as number[])}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`)
    .join("");

  const endDots = series
    .map(({ key, color }) => {
      const v = (s[key] as number[])[10];
      return `<circle cx="${x(10).toFixed(2)}" cy="${y(v).toFixed(2)}" r="0.8" fill="${color}"/>
      <text x="${(x(10) + 1.8).toFixed(2)}" y="${(y(v) + 1).toFixed(2)}" font-family='${FONT_MONO}' font-size="2.6" fill="${color}">${Rk(v)}</text>`;
    })
    .join("");

  return `
  <svg width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${W} ${H}">
    <polygon points="${areaTop} ${areaBottom}" fill="rgba(74,222,128,0.05)"/>
    ${gridLines}
    ${xLabels}
    ${paths}
    ${endDots}
  </svg>`;
}

function chartLegend(f: PackFigures): string {
  const s = tenYearSeries(f);
  const onsiteCoincides = Math.abs(s.onsite[0] - s.blended[0]) < f.currentMonthly * 0.01;
  const item = (color: string, label: string) =>
    `<span style="display:inline-flex; align-items:center; gap:1.8mm; margin-right:6mm;">
      <span style="width:4.6mm; height:0.8mm; border-radius:1mm; background:${color}; display:inline-block;"></span>
      <span class="mono" style="font-size:5.6pt; letter-spacing:0.14em; color:rgba(255,255,255,0.45);">${label}</span>
    </span>`;
  return `<div style="margin-top:3mm;">
    ${item("rgba(255,255,255,0.50)", "ESKOM PATH · 13% A YEAR")}
    ${onsiteCoincides ? "" : item("#fbbf24", "SOLAR ON SITE")}
    ${item("#22d3ee", "WHEELED ENERGY")}
    ${item("#4ade80", onsiteCoincides ? "SOLAR ON SITE · YOUR BLENDED PATH" : "YOUR BLENDED PATH")}
  </div>`;
}

// ---------------------------------------------------------------- report

function statCell(value: string, label: string, tone = ""): string {
  return `
  <div style="padding: 3.3mm 6mm;">
    <p class="display ${tone}" style="font-size: 13pt; ${tone === "green" ? "color:#4ade80;" : ""}">${value}</p>
    <p class="mono" style="margin-top:1.6mm; font-size:5.2pt; letter-spacing:0.14em; text-transform:uppercase; color:rgba(255,255,255,0.34);">${label}</p>
  </div>`;
}

function statStrip(cells: string[]): string {
  return `
  <div class="panel" style="display:grid; grid-template-columns: repeat(${cells.length}, 1fr); overflow:hidden;">
    ${cells.map((cell, index) => `<div style="${index > 0 ? "border-left: 0.3mm solid rgba(255,255,255,0.10);" : ""}">${cell}</div>`).join("")}
  </div>`;
}

function keyValueRow(label: string, value: string, strong = false): string {
  return `
  <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8mm; padding:2.35mm 0; border-bottom: 0.28mm solid rgba(255,255,255,0.08);">
    <span style="font-size:7.6pt; color: rgba(255,255,255,${strong ? "0.85" : "0.45"});">${label}</span>
    <span class="ink" style="font-size:7.6pt; font-weight:${strong ? "600" : "500"}; text-align:right;">${value}</span>
  </div>`;
}

function inclusionRows(compact = false): string {
  return ONSITE_INCLUSIONS.map((inclusion, index) => `
    <div style="display:flex; align-items:baseline; gap:4mm; padding:${compact ? "2.5mm" : "3.1mm"} 0; ${index > 0 ? "border-top: 0.28mm solid rgba(255,255,255,0.08);" : ""}">
      <span class="mono" style="font-size:5.6pt; color: rgba(253,230,138,0.72); letter-spacing:0.12em;">${inclusion.index}</span>
      <span style="flex:1;">
        <span class="ink" style="display:block; font-size:${compact ? "7.2" : "7.8"}pt; font-weight:500;">${esc(inclusion.item)}</span>
        <span style="display:block; margin-top:0.8mm; font-size:${compact ? "6" : "6.4"}pt; color:rgba(255,255,255,0.36);">${esc(inclusion.detail)}</span>
      </span>
    </div>`).join("");
}

function inclusionGridTwoCol(): string {
  const cell = (inclusion: typeof ONSITE_INCLUSIONS[number]) => `
    <div style="display:flex; align-items:baseline; gap:3mm; padding:1.75mm 0;">
      <span class="mono" style="font-size:5.4pt; color: rgba(253,230,138,0.72); letter-spacing:0.12em;">${inclusion.index}</span>
      <span style="flex:1;">
        <span class="ink" style="display:block; font-size:6.9pt; font-weight:500;">${esc(inclusion.item)}</span>
        <span style="display:block; margin-top:0.6mm; font-size:5.8pt; color:rgba(255,255,255,0.36);">${esc(inclusion.detail)}</span>
      </span>
    </div>`;
  return `
  <div style="display:grid; grid-template-columns:1fr 1fr; column-gap:7mm;">
    <div>${ONSITE_INCLUSIONS.slice(0, 4).map(cell).join("")}</div>
    <div>${ONSITE_INCLUSIONS.slice(4).map(cell).join("")}</div>
  </div>`;
}

function buildMigrationReportHtml(f: PackFigures): string {
  const blendedTenYearSaved = cumulativeSaving(f, f.solutionMonthly, f.onsiteEscalation, 10);
  const onsiteTenYearSaved = cumulativeSaving(f, f.onsiteMonthly, f.onsiteEscalation, 10);
  const wheeledYearOne = f.currentMonthly - f.wheelingMonthly;
  const pages: string[] = [];

  // ---- Page 1 · Cover
  pages.push(`
  <div class="page landscape">
    <div class="platform-grid"></div><div class="tech-glow"></div>
    <div style="position:relative; padding: 12mm 14mm 0; display:flex; justify-content:space-between; align-items:center;">
      ${brandLockup()}
      <span class="mono" style="font-size:5.8pt; letter-spacing:0.18em; color:rgba(255,255,255,0.34);">MIGRATION REPORT · ${longDate(f.publishedAt).toUpperCase()}</span>
    </div>
    <div style="position:relative; padding: 20mm 14mm 0;">
      <p class="eyebrow amber">FOUNDATION-1 MIGRATION REPORT · BILL-AUDITED</p>
      <h1 class="display" style="margin-top:7mm; font-size:37pt;">Every charge audited.</h1>
      ${gradientLine("Every pathway compared.", 37)}
      <p style="margin-top:7mm; max-width:150mm; font-size:9pt; line-height:1.7;">Your utility bills, read line by line by Foundation-1's Machine Intelligence and verified by the migration desk. This is your real number, and what each migration pathway does to it.</p>
      <p class="mono" style="margin-top:6mm; font-size:6.6pt; letter-spacing:.16em; text-transform:uppercase; color:rgba(187,247,208,.78);">ABOUT ${'${num(f.annualCo2Tonnes)}'} TONNES OF CARBON OFF THE GRID EVERY YEAR · THE SUN DOING THE WORK</p>
      <div style="margin-top:5mm; display:flex; gap:2.6mm;">
        <span class="chip">${esc(f.businessName.toUpperCase())}</span>
        <span class="chip">${esc(f.caseReference)}</span>
        ${f.city ? `<span class="chip">${esc(`${f.city}${f.province ? " · " + f.province : ""}`.toUpperCase())}</span>` : ""}
      </div>
    </div>
    <div style="position:absolute; left:14mm; right:14mm; bottom:14mm;">
      ${statStrip([
        statCell(R(f.currentMonthly), "Audited monthly bill · ex VAT"),
        statCell(R(f.solutionMonthly), "Complete solution · ex VAT"),
        statCell(R(Math.max(0, f.monthlySaving)), "Back in your pocket, monthly", "green"),
        statCell(Rk(Math.max(0, blendedTenYearSaved)), "Saved over ten years vs Eskom", "green"),
      ])}
    </div>
  </div>`);

  // ---- Page 2 · The audit
  pages.push(`
  <div class="page landscape">
    <div class="tech-glow"></div>
    <div style="position:relative; padding: 14mm 14mm 0;">
      <p class="eyebrow cyan">THE AUDIT · WHAT YOUR BILLS ACTUALLY SAY</p>
      <h2 class="display" style="margin-top:5mm; font-size:26pt;">Your real number.</h2>
    </div>
    <div style="position:relative; padding: 10mm 14mm 0; display:grid; grid-template-columns: 1.05fr 0.95fr; gap: 8mm;">
      <div class="panel" style="padding: 6mm 7mm;">
        ${keyValueRow("Billing periods audited", `${f.billingPeriods}`)}
        ${keyValueRow("Days of evidence covered", `${f.coveredDays}`)}
        ${keyValueRow("Supply and tariff context", esc(f.tariffProvider))}
        ${f.tariffNames.length ? keyValueRow("Tariffs recognised on the bills", esc(f.tariffNames.join(", "))) : ""}
        ${keyValueRow("Blended tariff found", `${Rc(f.blendedTariff)} per kilowatt hour`)}
        ${keyValueRow("Audited consumption", `${num(f.monthlyKwh)} kilowatt hours a month`)}
        ${keyValueRow("Audited monthly bill", `${R(f.currentMonthly)} ex VAT`, true)}
      </div>
      <div style="display:flex; flex-direction:column; gap:6mm;">
        <div class="panel" style="padding: 7mm 7mm 6mm;">
          <p class="eyebrow">IF NOTHING CHANGES · ESKOM TRAJECTORY AT 13 PERCENT</p>
          <p class="display" style="margin-top:4mm; font-size:21pt;">${R(billAt(f.currentMonthly, ESKOM_TRAJECTORY, 120))}<span class="dim" style="font-size:9pt;"> /month by year ten</span></p>
          <p style="margin-top:3.4mm; font-size:7.4pt; line-height:1.65; color:rgba(255,255,255,0.45);">Foundation-1 models the utility path at 13 percent a year, consistent with the published multi-year price determinations. Your ${R(f.currentMonthly)} bill nearly triples if nothing moves.</p>
        </div>
        <div class="panel" style="padding: 7mm 7mm 6mm; border-color: rgba(74,222,128,0.22);">
          <p class="eyebrow" style="color:rgba(187,247,208,0.7);">THE ASSESSMENT SUPPORTS THE CASE</p>
          <p class="display" style="margin-top:4mm; font-size:21pt; color:#4ade80;">${Math.round(f.yearOnePct)}%<span class="dim" style="font-size:9pt; color:rgba(255,255,255,0.4);"> off in year one</span></p>
          <p style="margin-top:3.4mm; font-size:7.4pt; line-height:1.65; color:rgba(255,255,255,0.45);">The complete blended configuration lands at ${R(f.solutionMonthly)} a month against your audited ${R(f.currentMonthly)}, with nothing payable to switch and savings from day one.</p>
        </div>
      </div>
    </div>
    ${footerBand("MIGRATION REPORT", f.caseReference, "02 / 05")}
  </div>`);

  // ---- Page 3 · Ten years, charted
  pages.push(`
  <div class="page landscape">
    <div class="tech-glow"></div>
    <div style="position:relative; padding: 14mm 14mm 0; display:flex; justify-content:space-between; align-items:flex-end;">
      <div>
        <p class="eyebrow amber">TEN YEARS · SAVINGS AGAINST THE ESKOM PATH</p>
        <h2 class="display" style="margin-top:5mm; font-size:26pt;">The cost of staying.</h2>
        ${gradientLine("The value of moving.", 26)}
      </div>
      <p style="max-width:74mm; font-size:7.4pt; line-height:1.65; text-align:right; color:rgba(255,255,255,0.42);">Monthly bill over ten years. The white line is Eskom at 13 percent a year. Every coloured line is a Foundation-1 pathway priced from your audited bills.</p>
    </div>
    <div style="position:relative; padding: 6mm 14mm 0; display:grid; grid-template-columns: 1.55fr 0.85fr; gap: 8mm; align-items:start;">
      <div class="panel" style="padding: 5mm 4mm 3mm;">
        ${tenYearChartSvg(f, 158, 92)}
        <div style="padding: 0 3mm 2mm;">${chartLegend(f)}</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:5mm;">
        <div class="panel" style="padding:6mm 7mm; border-color: rgba(74,222,128,0.24);">
          <p class="eyebrow" style="color:rgba(187,247,208,0.7);">STAYS WITH YOUR BUSINESS OVER TEN YEARS</p>
          <p class="display" style="margin-top:3.6mm; font-size:24pt; color:#4ade80;">${R(Math.max(0, blendedTenYearSaved))}</p>
          <p style="margin-top:2.6mm; font-size:7pt; line-height:1.6; color:rgba(255,255,255,0.42);">Cumulative saving of the blended path against the Eskom trajectory, from your audited baseline.</p>
        </div>
        <div class="panel" style="padding: 2mm 7mm;">
          ${keyValueRow("Year one, monthly", `${R(Math.max(0, f.monthlySaving))} back`)}
          ${keyValueRow("Solar on site, ten years", `${R(Math.max(0, onsiteTenYearSaved))} saved`)}
          ${keyValueRow("Wheeled energy, year one", `${R(Math.max(0, wheeledYearOne * 12))} saved`)}
          ${keyValueRow("Escalation, your agreement", `${Math.round(f.onsiteEscalation * 100)}% fixed`, true)}
        </div>
      </div>
    </div>
    ${footerBand("MIGRATION REPORT", f.caseReference, "03 / 05")}
  </div>`);

  // ---- Page 4 · The pathways
  const pathRow = (name: string, color: string, monthly: number, note: string) => `
    <div style="display:grid; grid-template-columns: 2.4mm 1fr auto auto; gap:5mm; align-items:center; padding:4.2mm 0; border-bottom:0.28mm solid rgba(255,255,255,0.08);">
      <span style="width:2.4mm; height:2.4mm; border-radius:50%; background:${color};"></span>
      <span>
        <span class="ink" style="display:block; font-size:8.6pt; font-weight:500;">${name}</span>
        <span style="display:block; margin-top:1mm; font-size:6.6pt; color:rgba(255,255,255,0.38);">${note}</span>
      </span>
      <span class="ink mono" style="font-size:9pt;">${R(monthly)}</span>
      <span class="mono" style="font-size:6.4pt; color:${monthly < f.currentMonthly ? "#4ade80" : "rgba(255,255,255,0.4)"}; width:20mm; text-align:right;">${monthly < f.currentMonthly ? `-${Math.round(((f.currentMonthly - monthly) / f.currentMonthly) * 100)}%` : "BASELINE"}</span>
    </div>`;

  pages.push(`
  <div class="page landscape">
    <div class="tech-glow"></div>
    <div style="position:relative; padding: 14mm 14mm 0;">
      <p class="eyebrow violet">THE PATHWAYS · MONTHLY BILL, EX VAT</p>
      <h2 class="display" style="margin-top:5mm; font-size:26pt;">Four ways to run the same site.</h2>
    </div>
    <div style="position:relative; padding: 9mm 14mm 0; display:grid; grid-template-columns: 1.05fr 0.95fr; gap: 8mm; align-items:start;">
      <div>
        <div class="panel" style="padding: 1mm 7mm;">
          ${pathRow("Approved current path", "rgba(255,255,255,0.5)", f.currentMonthly, "Modelled to escalate at 13 percent a year")}
          ${pathRow("Solar and storage on your site", "#fbbf24", f.onsiteMonthly, `Fixed ${Math.round(f.onsiteEscalation * 100)} percent escalation, the full service included`)}
          ${pathRow("Wheeled renewable energy", "#22d3ee", f.wheelingMonthly, `Traditional or virtual wheeling, about ${Math.round(f.wheelingShare * 100)} percent at the contracted rate`)}
          ${pathRow("Complete blended solution", "#4ade80", f.solutionMonthly, "The configuration your report recommends")}
        </div>
        <div class="panel" style="margin-top:5mm; padding:5.4mm 7mm; background:#0a0d07; border-color:rgba(74,222,128,0.2);">
          <p class="eyebrow" style="color:rgba(187,247,208,0.7);">BOTH PATHWAYS · MINIMUM TERM</p>
          <p class="ink" style="margin-top:2.4mm; font-size:9pt; font-weight:500;">Power purchase agreement, minimum 10 years. You buy the energy, never the equipment. R0 until it is live.</p>
        </div>
      </div>
      <div class="panel" style="padding: 4mm 7mm 3mm;">
        <p class="eyebrow amber" style="margin-top:2mm;">SOLAR AND STORAGE ON YOUR SITE · WHAT THE ONE AMOUNT INCLUDES</p>
        <div style="margin-top:2mm;">${inclusionRows(true)}</div>
      </div>
    </div>
    ${footerBand("MIGRATION REPORT", f.caseReference, "04 / 05")}
  </div>`);

  // ---- Page 5 · Environmental impact + the journey
  const journeyChip = (index: string, label: string, state: "done" | "here" | "ahead") => `
    <span class="chip ${state === "here" ? "amber" : state === "done" ? "cyan" : ""}" style="${state === "ahead" ? "opacity:0.55;" : ""}">${index} ${label}${state === "here" ? " · YOU ARE HERE" : ""}</span>`;

  pages.push(`
  <div class="page landscape">
    <div class="tech-glow"></div>
    <div style="position:relative; padding: 14mm 14mm 0;">
      <p class="eyebrow" style="color:rgba(187,247,208,0.7);">ENVIRONMENTAL IMPACT · MODELLED FROM YOUR AUDITED CONSUMPTION</p>
      <h2 class="display" style="margin-top:5mm; font-size:26pt;">What your migration gives back.</h2>
    </div>
    <div style="position:relative; padding: 8mm 14mm 0;">
      ${statStrip([
        statCell(`${num(f.annualCo2Tonnes)} t`, "Carbon avoided every year", "green"),
        statCell(`${num(f.tenYearCo2Tonnes)} t`, "Carbon avoided over ten years", "green"),
        statCell(num(f.treesEquivalent), "Trees working year round"),
        statCell(num(f.carsEquivalent), "Cars taken off the road"),
      ])}
      <div style="margin-top:6mm; display:grid; grid-template-columns: 1.2fr 0.8fr; gap:8mm;">
        <p style="font-size:7.8pt; line-height:1.75; color:rgba(255,255,255,0.46);">Your site consumes about ${num(f.monthlyKwh)} kilowatt hours a month. South African grid electricity carries about ${GRID_EMISSION_FACTOR_KG_PER_KWH.toFixed(2)} kilograms of carbon dioxide per kilowatt hour on Eskom's published grid emission factor. Moving that consumption to renewable supply avoids about ${num(f.annualCo2Tonnes)} tonnes of carbon a year. Tree and vehicle equivalents use standard conversion factors: one mature tree absorbs about 21 kilograms a year, an average vehicle emits about 4.6 tonnes a year. The engineered share is confirmed in your formal proposals.</p>
        <div class="panel" style="padding:6mm 7mm; background:#ffffff; border-color:#ffffff;">
          <p class="mono" style="font-size:5.6pt; letter-spacing:0.18em; color:rgba(0,0,0,0.5);">WHAT HAPPENS NEXT</p>
          <p style="margin-top:2.8mm; font-size:10.5pt; font-weight:600; letter-spacing:-0.02em; color:#000;">Sign the non-binding Expression of Interest to open formal proposals.</p>
          <p style="margin-top:2.4mm; font-size:7pt; line-height:1.6; color:rgba(0,0,0,0.55);">Nothing is binding and nothing is payable. It authorises Foundation-1 to bring you formal, signable proposals for the pathways in this report.</p>
        </div>
      </div>
      <div style="margin-top:8mm;">
        <p class="eyebrow">YOUR JOURNEY · STAGE 3 OF 9</p>
        <div style="margin-top:3mm; display:flex; flex-wrap:wrap; gap:2.2mm;">
          ${journeyChip("01", "SCREEN", "done")}
          ${journeyChip("02", "EVIDENCE", "done")}
          ${journeyChip("03", "MIGRATION REPORT", "done")}
          ${journeyChip("04", "EXPRESSION OF INTEREST", "here")}
          ${journeyChip("05", "PROPOSALS", "ahead")}
          ${journeyChip("06", "VERIFICATION", "ahead")}
          ${journeyChip("07", "TERM SHEET", "ahead")}
          ${journeyChip("08", "MIGRATION", "ahead")}
          ${journeyChip("09", "SAVINGS FROM DAY ONE", "ahead")}
        </div>
      </div>
    </div>
    ${footerBand("MIGRATION REPORT", f.caseReference, "05 / 05")}
  </div>`);

  return docShell(pages.join("\n"), "landscape");
}

// ---------------------------------------------------------------- bills

type BillLine = { item: string; detail: string; amount: string };

/** The carbon story, on every bill: unmissable, green, modelled honestly. */
function envStrip(monthlyKwhRenewable: number): string {
  const monthlyT = (monthlyKwhRenewable * GRID_EMISSION_FACTOR_KG_PER_KWH) / 1000;
  const yearlyT = monthlyT * 12;
  const trees = Math.round((yearlyT * 1000) / 21);
  const cell = (v: string, l: string) => `
    <div style="padding:3.4mm 6mm;">
      <p class="display" style="font-size:11.5pt;color:#4ade80;">${v}</p>
      <p class="mono" style="margin-top:1.2mm;font-size:5pt;letter-spacing:.14em;text-transform:uppercase;color:rgba(187,247,208,.55);">${l}</p>
    </div>`;
  return `
  <div class="panel" style="margin-top:3.4mm;display:grid;grid-template-columns:repeat(3,1fr);overflow:hidden;background:#070c08;border-color:rgba(74,222,128,.28);">
    ${cell(`${monthlyT.toFixed(1)} t`, "Carbon off the grid, monthly")}
    ${cell(`${Math.round(yearlyT)} t`, "Carbon off the grid, yearly")}
    ${cell(num(trees), "Trees working for you, modelled")}
  </div>`;
}

function billPeriod(reference: Date): { label: string; issue: Date; due: Date } {
  const start = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 2, 0);
  const issue = new Date(end.getFullYear(), end.getMonth(), Math.min(end.getDate(), 28));
  const due = new Date(end.getFullYear(), end.getMonth() + 1, 15);
  return { label: `${start.getDate()} to ${end.getDate()} ${end.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}`, issue, due };
}

function buildBillHtml(f: PackFigures, spec: {
  eyebrow: string;
  titleTop: string;
  titleBottom: string;
  strapline: string;
  lines: BillLine[];
  subtotal: number;
  total: number;
  /** kWh of the client's consumption served renewably under this pathway. */
  renewableKwh: number;
  punch: string;
  punchBody: string;
  extra: string;
  footer: string;
}): string {
  const period = billPeriod(f.publishedAt);
  const linesHtml = spec.lines.map((line, index) => `
    <div style="display:grid; grid-template-columns: 1fr auto; gap:6mm; align-items:baseline; padding:2.5mm 0; ${index > 0 ? "border-top:0.28mm solid rgba(255,255,255,0.08);" : ""}">
      <span>
        <span class="ink" style="display:block; font-size:8.4pt; font-weight:500;">${esc(line.item)}</span>
        <span style="display:block; margin-top:1mm; font-size:6.6pt; color:rgba(255,255,255,0.38);">${esc(line.detail)}</span>
      </span>
      <span class="ink mono" style="font-size:8.6pt;">${line.amount}</span>
    </div>`).join("");

  const page = `
  <div class="page portrait">
    <div class="platform-grid"></div><div class="tech-glow"></div>
    <div style="position:relative; padding: 7mm 14mm 0; display:flex; justify-content:space-between; align-items:center;">
      ${brandLockup(22)}
      <span class="chip amber">INDICATIVE EXAMPLE · NOT AN INVOICE</span>
    </div>
    <div style="position:relative; padding: 6mm 14mm 0;">
      <p class="eyebrow ${spec.eyebrow.includes("WHEELED") ? "cyan" : "amber"}">${spec.eyebrow}</p>
      <h1 class="display" style="margin-top:3.6mm; font-size:21pt;">${spec.titleTop}</h1>
      ${gradientLine(spec.titleBottom, 21)}
      <p style="margin-top:3mm; max-width:162mm; font-size:7.2pt; line-height:1.58;">${spec.strapline}</p>
    </div>

    <div style="position:relative; padding: 4.4mm 14mm 0;">
      <div class="panel" style="display:grid; grid-template-columns: 1fr 1fr; overflow:hidden;">
        <div style="padding:4mm 6mm;">
          <p class="mono" style="font-size:5.2pt; letter-spacing:0.16em; color:rgba(255,255,255,0.32);">ACCOUNT HOLDER</p>
          <p class="ink" style="margin-top:2mm; font-size:10.5pt; font-weight:600;">${esc(f.businessName)}</p>
          <p class="mono" style="margin-top:2mm; font-size:5.8pt; letter-spacing:0.12em; color:rgba(255,255,255,0.45);">ACCOUNT ${esc(f.caseReference)}</p>
          <p class="mono" style="margin-top:1.4mm; font-size:5.8pt; letter-spacing:0.12em; color:rgba(255,255,255,0.32);">${esc(`${f.city}${f.province ? " · " + f.province : ""}`.toUpperCase() || "SITE ON RECORD")}</p>
        </div>
        <div style="border-left:0.3mm solid rgba(255,255,255,0.10); padding:2mm 6mm;">
          ${keyValueRow("Billing period", period.label)}
          ${keyValueRow("Bill issued", longDate(period.issue))}
          ${keyValueRow("Payment due", longDate(period.due), true)}
        </div>
      </div>

      <div class="panel" style="margin-top:3.4mm; padding: 0.6mm 6mm;">
        <div style="display:grid; grid-template-columns: 1fr auto; padding:3mm 0 1.6mm;">
          <span class="mono" style="font-size:5.2pt; letter-spacing:0.16em; color:rgba(255,255,255,0.30);">ITEM</span>
          <span class="mono" style="font-size:5.2pt; letter-spacing:0.16em; color:rgba(255,255,255,0.30);">AMOUNT</span>
        </div>
        ${linesHtml}
      </div>

      <div style="margin-top:3.4mm; display:grid; grid-template-columns: 1fr 88mm; gap:6mm;">
        <div></div>
        <div class="panel" style="padding:1mm 6mm;">
          ${keyValueRow("Subtotal excluding VAT", Rc(spec.subtotal))}
          ${keyValueRow("VAT at 15 percent", Rc(spec.subtotal * VAT_RATE))}
          ${keyValueRow("Total due", Rc(spec.subtotal * (1 + VAT_RATE)), true)}
        </div>
      </div>

      <div style="margin-top:3.4mm;">
        ${statStrip([
          statCell(R(f.currentMonthly), "Audited current bill · ex VAT"),
          statCell(R(spec.total), "This example bill · ex VAT"),
          statCell(R(Math.max(0, f.currentMonthly - spec.total)), "Yours to keep, every month", "green"),
        ])}
      </div>
      ${envStrip(spec.renewableKwh)}

      ${spec.extra}

      <div class="panel" style="margin-top:3.2mm; padding:3.2mm 6.4mm; background:#ffffff; border-color:#ffffff;">
        <p class="mono" style="font-size:5.4pt; letter-spacing:0.18em; color:rgba(0,0,0,0.5);">THE NUMBER THAT MATTERS</p>
        <p style="margin-top:2.4mm; font-size:10pt; font-weight:600; letter-spacing:-0.02em; color:#000;">${spec.punch}</p>
        <p style="margin-top:1.8mm; font-size:6.8pt; line-height:1.6; color:rgba(0,0,0,0.55);">${spec.punchBody}</p>
      </div>

    </div>
    <p class="mono" style="position:absolute; left:14mm; right:14mm; bottom:11.6mm; font-size:5.2pt; letter-spacing:0.1em; color:rgba(255,255,255,0.30); text-align:left;">INDICATIVE EXAMPLE FROM YOUR AUDITED BILLS AND THE ${esc(f.tariffProvider.toUpperCase())} TARIFF CONTEXT. AMOUNTS ARE CONFIRMED IN YOUR FORMAL PROPOSALS.</p>
    ${footerBand(spec.footer, f.caseReference, "01 / 01")}
  </div>`;
  return docShell(page, "portrait");
}

function buildOnsiteBillHtml(f: PackFigures): string {
  const inclusionsPanel = `
    <div class="panel" style="margin-top:3.4mm; padding: 2.4mm 6mm 1.8mm;">
      <p class="eyebrow amber" style="margin-top:1.6mm;">INCLUDED IN THIS ONE AMOUNT</p>
      <div style="margin-top:1.8mm;">${inclusionGridTwoCol()}</div>
    </div>`;
  return buildBillHtml(f, {
    eyebrow: "PATHWAY · SOLAR AND STORAGE ON YOUR SITE",
    titleTop: "Your electricity bill,",
    titleBottom: "after the migration.",
    strapline: "One fixed monthly amount replaces your utility bill. Everything below lives on your site, funded, installed, insured and owned by Nedbank Corporate and Investment Banking, at no capital outlay from you.",
    lines: [
      { item: "Renewable energy service, solar and storage on your site", detail: "Fixed monthly amount", amount: Rc(f.onsiteMonthly) },
      { item: "Capital outlay, connection and installation", detail: "Nothing payable to switch", amount: "R0.00" },
      { item: "Agreement term", detail: "Power purchase agreement, minimum 10 years", amount: "10 years" },
    ],
    subtotal: f.onsiteMonthly,
    total: f.onsiteMonthly,
    renewableKwh: f.monthlyKwh,
    punch: `This amount escalates at ${Math.round(f.onsiteEscalation * 100)} percent a year, fixed in your agreement.`,
    punchBody: "Eskom's trajectory is modelled at 13 percent a year, Foundation-1's standing assumption.",
    extra: inclusionsPanel,
    footer: "EXAMPLE BILL · SOLAR AND STORAGE ON YOUR SITE",
  });
}

function buildWheelingBillHtml(f: PackFigures): string {
  const wheeledKwh = f.monthlyKwh * f.wheelingShare;
  const remainderKwh = f.monthlyKwh * (1 - f.wheelingShare);
  const routesPanel = `
    <div class="panel" style="margin-top:3.4mm; padding: 2.4mm 6mm 2.4mm;">
      <p class="eyebrow cyan" style="margin-top:1.6mm;">TWO WAYS TO WHEEL · BOTH AVAILABLE TO YOU</p>
      <div style="margin-top:2.4mm; display:grid; grid-template-columns:1fr 1fr; gap:6mm;">
        <div>
          <p class="ink" style="font-size:8pt; font-weight:600;">Traditional wheeling</p>
          <p style="margin-top:1.6mm; font-size:6.8pt; line-height:1.65; color:rgba(255,255,255,0.42);">Energy from a specific generator is delivered to your meter across the grid under a bilateral use-of-system arrangement with your distributor. Best where one site carries the load.</p>
        </div>
        <div>
          <p class="ink" style="font-size:8pt; font-weight:600;">Virtual wheeling</p>
          <p style="margin-top:1.6mm; font-size:6.8pt; line-height:1.65; color:rgba(255,255,255,0.42);">Generation is credited against your consumption financially, across one or many meters, without rerouting the physical connection. Best for portfolios and municipal supply.</p>
        </div>
      </div>
    </div>`;
  return buildBillHtml(f, {
    eyebrow: "PATHWAY · WHEELED RENEWABLE ENERGY",
    titleTop: "Your electricity bill,",
    titleBottom: "with wheeled renewable energy.",
    strapline: "Renewable energy generated elsewhere is delivered to your site across the existing grid, as traditional wheeling or virtual wheeling, whichever fits your metering. You buy the energy at a contracted rate below your blended tariff; your distributor still carries the wires.",
    lines: [
      { item: "Wheeled renewable energy", detail: `${num(wheeledKwh)} kilowatt hours at ${Rc(f.wheeledTariff)}`, amount: Rc(wheeledKwh * f.wheeledTariff) },
      { item: "Distributor supply and network charges", detail: `Remaining ${num(remainderKwh)} kilowatt hours and delivery`, amount: Rc(remainderKwh * f.blendedTariff) },
      { item: "Capital outlay and switching cost", detail: "Nothing payable to switch", amount: "R0.00" },
      { item: "Agreement term", detail: "Power purchase agreement, minimum 10 years", amount: "10 years" },
    ],
    subtotal: f.wheelingMonthly,
    total: f.wheelingMonthly,
    renewableKwh: f.monthlyKwh * f.wheelingShare,
    punch: `Roughly ${Math.round(f.wheelingShare * 100)} percent of your energy moves to the contracted renewable rate.`,
    punchBody: "The remainder stays with your distributor at the audited blended tariff. Eskom's trajectory is modelled at 13 percent a year, Foundation-1's standing assumption.",
    extra: routesPanel,
    footer: "EXAMPLE BILL · WHEELED RENEWABLE ENERGY",
  });
}

// ---------------------------------------------------------------- certificate

function buildCertificateHtml(f: PackFigures): string {
  const serial = `FL-${f.caseReference.replace(/^F1-MC-/, "")}`;
  const page = `
  <div class="page portrait" style="display:flex; align-items:stretch;">
    <div class="tech-glow"></div>
    <div style="position:relative; flex:1; margin:10mm; border:0.5mm solid rgba(255,255,255,0.16); border-radius:1.6mm;">
      <div style="position:absolute; inset:2.6mm; border:0.28mm solid rgba(255,255,255,0.08); border-radius:1mm;"></div>
      <div style="position:relative; height:100%; display:flex; flex-direction:column; align-items:center; text-align:center; padding: 16mm 18mm;">
        <span class="chip amber">SPECIMEN · ISSUED ON YOUR MIGRATION DAY</span>
        <div style="margin-top:17mm;">${analemmaSvg(112, { glow: true })}</div>
        <p class="eyebrow amber" style="margin-top:15mm; font-size:8pt; letter-spacing:0.3em;">THE FIRST LIGHT CERTIFICATE</p>
        <p style="margin-top:11mm; font-size:10pt; color:rgba(255,255,255,0.42);">This certifies that</p>
        <p class="display" style="margin-top:5mm; font-size:${f.businessName.length > 26 ? "20" : "25"}pt;">${esc(f.businessName)}</p>
        <div style="margin-top:4mm; width:100%;">${gradientLine("powers its operations with the sun.", 13, { align: "center" })}</div>
        <p style="margin-top:8mm; max-width:126mm; font-size:7.6pt; line-height:1.8; color:rgba(255,255,255,0.45);">Migrated through the Foundation-1 platform, with savings from day one.</p>
        <div style="margin-top:6mm; display:grid; grid-template-columns:1fr 1fr; gap:10mm; width:110mm;">
          <div style="text-align:center;">
            <p class="display" style="font-size:17pt; color:#4ade80;">${num(f.annualCo2Tonnes)} t</p>
            <p class="mono" style="margin-top:1.6mm; font-size:5.4pt; letter-spacing:.2em; color:rgba(187,247,208,.6);">CARBON OFF THE GRID, EVERY YEAR</p>
          </div>
          <div style="text-align:center;">
            <p class="display" style="font-size:17pt; color:#f5f5f5;">${num(f.annualKwh)}</p>
            <p class="mono" style="margin-top:1.6mm; font-size:5.4pt; letter-spacing:.2em; color:rgba(255,255,255,.4);">KILOWATT HOURS OF SUN, EVERY YEAR</p>
          </div>
        </div>
        <div style="margin-top:9mm; width:34mm; border-top:0.3mm solid rgba(255,255,255,0.24);"></div>
        <p class="mono" style="margin-top:5mm; font-size:6.2pt; letter-spacing:0.22em; color:rgba(255,255,255,0.5);">CERTIFICATE ${serial}</p>
        <p class="mono" style="margin-top:2mm; font-size:5.6pt; letter-spacing:0.2em; color:rgba(255,255,255,0.3);">ISSUED AT FIRST LIGHT ON YOUR MIGRATION DAY</p>
        <div style="margin-top:auto; width:100%; display:flex; justify-content:space-between; gap:14mm; padding: 0 6mm;">
          <div style="flex:1; text-align:center;">
            <div style="border-top:0.3mm solid rgba(255,255,255,0.28); padding-top:2.6mm;">
              <p class="mono" style="font-size:5.6pt; letter-spacing:0.16em; color:rgba(255,255,255,0.5);">FOUNDATION-1 (PTY) LTD</p>
              <p class="mono" style="margin-top:1.2mm; font-size:5pt; letter-spacing:0.14em; color:rgba(255,255,255,0.28);">FOUNDER AND MIGRATION DESK</p>
            </div>
          </div>
          <div style="flex:1; text-align:center;">
            <div style="border-top:0.3mm solid rgba(255,255,255,0.28); padding-top:2.6mm;">
              <p class="mono" style="font-size:5.6pt; letter-spacing:0.16em; color:rgba(255,255,255,0.5);">MIGRATION DAY</p>
              <p class="mono" style="margin-top:1.2mm; font-size:5pt; letter-spacing:0.14em; color:rgba(255,255,255,0.28);">DATE OF FIRST LIGHT</p>
            </div>
          </div>
        </div>
        <p class="mono" style="margin-top:7mm; font-size:5pt; letter-spacing:0.2em; color:rgba(255,255,255,0.26);">FOUNDATION-1 · THE FIRST LIGHT CERTIFICATE · ${esc(f.caseReference)}</p>
      </div>
    </div>
  </div>`;
  return docShell(page, "portrait");
}

// ---------------------------------------------------------------- dispatch

export async function buildReportPackDocument(
  id: ReportPackDocumentId,
  context: ReportPackContext,
): Promise<{ bytes: Uint8Array; filename: string }> {
  const f = deriveReportPackFigures(context);
  const reference = context.caseRow.public_reference.toLowerCase();
  const spec: Record<ReportPackDocumentId, { html: () => string; landscape: boolean; name: string }> = {
    "migration-report": {
      html: () => buildMigrationReportHtml(f),
      landscape: true,
      name: `foundation-1-migration-report-${reference}.pdf`,
    },
    "bill-onsite": {
      html: () => buildOnsiteBillHtml(f),
      landscape: false,
      name: `foundation-1-example-bill-solar-on-site-${reference}.pdf`,
    },
    "bill-wheeling": {
      html: () => buildWheelingBillHtml(f),
      landscape: false,
      name: `foundation-1-example-bill-wheeled-energy-${reference}.pdf`,
    },
    certificate: {
      html: () => buildCertificateHtml(f),
      landscape: false,
      name: `foundation-1-first-light-certificate-${reference}.pdf`,
    },
  };
  const entry = spec[id];
  const bytes = await htmlToPdf(entry.html(), { landscape: entry.landscape });
  return { bytes, filename: entry.name };
}

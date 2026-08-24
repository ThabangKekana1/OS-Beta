import { jsPDF } from "jspdf";
import {
  KIT_COLORS,
  KIT_INK,
  KIT_PAGE,
  addKitPage,
  analemmaMark,
  blend,
  brandLockup,
  coverGridTexture,
  chipRow,
  coverPage,
  darkCallout,
  dataTable,
  drawText,
  eyebrow,
  footerBand,
  hairline,
  inkTint,
  keyValueRows,
  kitLongDate,
  monoLabel,
  paintPaper,
  panel,
  paragraph,
  sourceNote,
  statStrip,
} from "@/lib/document-kit";
import type { IndicativeMigrationReport } from "@/lib/indicative-migration-report";
import type {
  MigrationCaseProposalRow,
  MigrationCaseRow,
} from "@/lib/migration-case-store";

// =============================================================================
// The report-time document pack: what a client receives the moment their
// Migration Report is published. Four artefacts, generated on demand:
//
//   1. migration-report   The Foundation-1 Migration Report with the audit,
//                         the pathway comparison and the environmental impact.
//   2. bill-onsite        An example future electricity bill, solar and
//                         storage on the site. Utility-bill anatomy.
//   3. bill-wheeling      An example future electricity bill, wheeled
//                         renewable energy. Utility-bill anatomy.
//   4. certificate        The First Light Certificate, the artefact issued on
//                         migration day. Presented as a specimen at report
//                         stage.
//
// Every figure is modelled from the audited bills and the case's tariff
// context, and every bill page says so: these are indicative examples, not
// invoices. Client-facing: no funder or partner is ever named.
// =============================================================================

export type ReportPackDocumentId =
  | "migration-report"
  | "bill-onsite"
  | "bill-wheeling"
  | "certificate";

export const REPORT_PACK_DOCUMENTS: {
  id: ReportPackDocumentId;
  title: string;
  description: string;
}[] = [
  {
    id: "migration-report",
    title: "Migration Report",
    description: "The audit of your bills, every pathway compared, and your environmental impact.",
  },
  {
    id: "bill-onsite",
    title: "Example bill · Solar and storage on your site",
    description: "What your monthly electricity bill looks like with generation on your site.",
  },
  {
    id: "bill-wheeling",
    title: "Example bill · Wheeled renewable energy",
    description: "What your monthly electricity bill looks like with renewable energy wheeled to you.",
  },
  {
    id: "certificate",
    title: "The First Light Certificate",
    description: "The certificate issued on your migration day. This is your specimen.",
  },
];

const VAT_RATE = 0.15;
const ESKOM_TRAJECTORY = 0.13; // Foundation-1 modelling assumption, always 13 percent.
const GRID_EMISSION_FACTOR_KG_PER_KWH = 1.04; // Eskom published grid emission factor.
const TREE_KG_PER_YEAR = 21;
const CAR_TONNES_PER_YEAR = 4.6;

export type ReportPackContext = {
  caseRow: MigrationCaseRow;
  proposal: MigrationCaseProposalRow;
};

type PackFigures = {
  businessName: string;
  caseReference: string;
  city: string;
  province: string;
  publishedAt: Date;
  currentMonthly: number;
  solutionMonthly: number;
  monthlySaving: number;
  yearOnePct: number;
  tenYearDifference: number;
  blendedTariff: number;
  tariffProvider: string;
  tariffNames: string[];
  billingPeriods: number;
  coveredDays: number;
  monthlyKwh: number;
  onsiteMonthly: number;
  onsiteEscalation: number;
  wheelingMonthly: number;
  wheelingShare: number;
  wheeledTariff: number;
  annualKwh: number;
  annualCo2Tonnes: number;
  tenYearCo2Tonnes: number;
  treesEquivalent: number;
  carsEquivalent: number;
};

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(parsed) ? (parsed as number) : fallback;
}

function rand(value: number): string {
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

function randCents(value: number): string {
  return `R${value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortDate(date: Date): string {
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}

/** One derivation core so all four documents tell the same story. */
export function deriveReportPackFigures(context: ReportPackContext): PackFigures {
  const { caseRow, proposal } = context;
  const preview = (proposal.preview_snapshot ?? {}) as Record<string, unknown>;
  const indicative = (caseRow.indicative_report ?? null) as IndicativeMigrationReport | null;

  const currentMonthly = asNumber(
    preview.currentMonthlyCostExVat,
    asNumber(indicative?.currentPath?.monthlySpendExVat, asNumber(caseRow.monthly_spend_ex_vat)),
  );
  const solutionMonthly = asNumber(preview.completeSolutionMonthlyCostExVat, currentMonthly);
  const monthlySaving = asNumber(preview.monthlyDifference, currentMonthly - solutionMonthly);
  const yearOnePct = asNumber(
    preview.yearOneDifferencePct,
    currentMonthly > 0 ? (monthlySaving / currentMonthly) * 100 : 0,
  );
  const tenYearDifference = asNumber(preview.tenYearDifference);

  const tariff = (preview.tariff ?? {}) as Record<string, unknown>;
  const anchorTariff = asNumber(indicative?.tariffContext?.anchor?.blendedTariff, 2.8);
  const blendedTariff = asNumber(tariff.blendedTariffExVat, anchorTariff) || anchorTariff;
  const tariffProvider = String(tariff.provider ?? indicative?.tariffContext?.supplierName ?? "your distributor");
  const tariffNames = Array.isArray(tariff.names) ? (tariff.names as string[]) : [];

  const evidence = (preview.evidence ?? {}) as Record<string, unknown>;
  const billingPeriods = Math.round(asNumber(evidence.recognisedBillingPeriods));
  const coveredDays = Math.round(asNumber(evidence.coveredDays));

  const monthlyKwh = asNumber(
    indicative?.input?.monthlyKwh,
    asNumber(caseRow.monthly_kwh_unverified, blendedTariff > 0 ? currentMonthly / blendedTariff : 0),
  ) || (blendedTariff > 0 ? currentMonthly / blendedTariff : 0);

  // Pathway figures: the indicative engine's pathway economics, rescaled onto
  // the audited current bill so the examples and the audit agree.
  const indicativeCurrent = asNumber(indicative?.currentPath?.monthlySpendExVat, currentMonthly);
  const scale = indicativeCurrent > 0 ? currentMonthly / indicativeCurrent : 1;
  const pathway = (id: string) => indicative?.pathways?.find((p) => p.id === id) ?? null;

  const eden = pathway("eden");
  // The example bills must agree with the audited assessment: the published
  // complete solution is the anchor. The indicative on-site pathway is used
  // only when it improves on the audited bill; otherwise the audited solution
  // figure carries the example.
  const edenScaled = eden && eden.available !== false && eden.monthlyCost > 0
    ? eden.monthlyCost * scale
    : 0;
  const onsiteMonthly = edenScaled > 0 && edenScaled < currentMonthly * 0.99
    ? edenScaled
    : Math.min(solutionMonthly, currentMonthly * 0.95);
  const onsiteEscalation = asNumber(eden?.escalation, 0.06);

  const wheelingShare = Math.min(
    0.95,
    Math.max(0.4, asNumber(indicative?.wheelingScreen?.energyShareAssumption, 0.7)),
  );
  const wheeledTariff = asNumber(indicative?.wheelingScreen?.firmEnergyTariff, blendedTariff * 0.75)
    || blendedTariff * 0.75;
  // Wheeling is derived from first principles so the bill lines and the total
  // agree: contracted energy at the wheeled rate, the remainder at the
  // audited blended tariff.
  const wheelingMonthly =
    monthlyKwh * wheelingShare * wheeledTariff + monthlyKwh * (1 - wheelingShare) * blendedTariff;

  const annualKwh = monthlyKwh * 12;
  const annualCo2Tonnes = (annualKwh * GRID_EMISSION_FACTOR_KG_PER_KWH) / 1000;
  const tenYearCo2Tonnes = annualCo2Tonnes * 10;
  const treesEquivalent = Math.round((annualCo2Tonnes * 1000) / TREE_KG_PER_YEAR);
  const carsEquivalent = Math.round(annualCo2Tonnes / CAR_TONNES_PER_YEAR);

  return {
    businessName: caseRow.business_name || "Your business",
    caseReference: caseRow.public_reference,
    city: caseRow.site_city || "",
    province: caseRow.province || "",
    publishedAt: new Date(proposal.created_at ?? Date.now()),
    currentMonthly,
    solutionMonthly,
    monthlySaving,
    yearOnePct,
    tenYearDifference,
    blendedTariff,
    tariffProvider,
    tariffNames,
    billingPeriods,
    coveredDays,
    monthlyKwh,
    onsiteMonthly,
    onsiteEscalation,
    wheelingMonthly,
    wheelingShare,
    wheeledTariff,
    annualKwh,
    annualCo2Tonnes,
    tenYearCo2Tonnes,
    treesEquivalent,
    carsEquivalent,
  };
}

// -----------------------------------------------------------------------------
// The on-site service: everything included in the one monthly amount.
// -----------------------------------------------------------------------------

export const ONSITE_INCLUSIONS: { index: string; item: string; detail: string }[] = [
  { index: "01", item: "Tier 1 solar photovoltaic panels", detail: "25-year product warranty" },
  { index: "02", item: "Commercial battery energy storage, 100 to 3200 kilowatt hours", detail: "10-year warranty" },
  { index: "03", item: "Energy-saving LED lighting and smart metering", detail: "Water and electricity" },
  { index: "04", item: "Solar water heating and borehole filtration", detail: "Integrated water and energy infrastructure" },
  { index: "05", item: "CCTV cameras and small-scale embedded generation registration", detail: "Security and grid-compliance coordination" },
  { index: "06", item: "24/7 electrician and plumber on call", detail: "Operational support when the site needs it" },
  { index: "07", item: "Full insurance, maintenance and operations", detail: "Lifecycle cover for Foundation-1-owned infrastructure" },
];

// -----------------------------------------------------------------------------
// Shared bill scaffolding: the utility-bill anatomy, in the house style.
// -----------------------------------------------------------------------------

type BillLine = { description: string; detail: string; amount: string };

type BillSpec = {
  pathwayEyebrow: string;
  titleLine1: string;
  titleLine2: string;
  strapline: string;
  lines: BillLine[];
  subtotal: number;
  monthlyTotal: number;
  figures: PackFigures;
  escalationNote: string;
  inclusions?: typeof ONSITE_INCLUSIONS;
  routes?: { name: string; detail: string }[];
  footerContext: string;
};

function billPeriod(reference: Date): { label: string; issue: Date; due: Date } {
  const start = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 2, 0);
  const issue = new Date(end.getFullYear(), end.getMonth(), Math.min(end.getDate(), 28));
  const due = new Date(end.getFullYear(), end.getMonth() + 1, 15);
  const label = `${shortDate(start)} to ${shortDate(end)}`;
  return { label, issue, due };
}

function specimenTag(pdf: jsPDF, text = "INDICATIVE EXAMPLE · NOT AN INVOICE") {
  const width = 74;
  const x = KIT_PAGE.width - KIT_PAGE.margin - width;
  const y = 16.4;
  const fill = blend(KIT_COLORS.amber, 0.1);
  pdf.setFillColor(fill[0], fill[1], fill[2]);
  const border = blend(KIT_COLORS.amber, 0.45);
  pdf.setDrawColor(border[0], border[1], border[2]);
  pdf.setLineWidth(0.22);
  pdf.roundedRect(x, y, width, 6.4, 1.1, 1.1, "FD");
  monoLabel(pdf, text, x + width / 2, y + 4.2, {
    size: 6.1,
    color: KIT_COLORS.amber,
    alpha: 1,
    align: "center",
    trackingEm: 0.14,
  });
}

function buildExampleBill(spec: BillSpec): jsPDF {
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const f = spec.figures;
  paintPaper(pdf);
  coverGridTexture(pdf, { fadeBottomY: 90 });
  brandLockup(pdf, KIT_PAGE.margin, 13);
  specimenTag(pdf);

  // Title block.
  eyebrow(pdf, spec.pathwayEyebrow, KIT_PAGE.margin, 33);
  drawText(pdf, spec.titleLine1, KIT_PAGE.margin, 42, { size: 20, weight: "bold" });
  drawText(pdf, spec.titleLine2, KIT_PAGE.margin, 49.4, {
    size: 20,
    weight: "bold",
    color: inkTint(0.36),
  });
  const strapEnd = paragraph(
    pdf,
    spec.strapline,
    KIT_PAGE.margin,
    55.2,
    { size: 8.4, color: inkTint(KIT_INK.body) },
    148,
  );

  // Account panel: the anatomy every utility bill teaches.
  const period = billPeriod(f.publishedAt);
  const accountTop = strapEnd + 4;
  panel(pdf, KIT_PAGE.margin, accountTop, KIT_PAGE.contentWidth, 26);
  const half = KIT_PAGE.contentWidth / 2;
  const leftX = KIT_PAGE.margin + 6;
  const rightX = KIT_PAGE.margin + half + 6;
  monoLabel(pdf, "ACCOUNT HOLDER", leftX, accountTop + 6.4, { size: 6, alpha: 0.42 });
  drawText(pdf, f.businessName, leftX, accountTop + 11.6, { size: 10.5, weight: "bold" });
  monoLabel(pdf, `ACCOUNT ${f.caseReference}`, leftX, accountTop + 16.6, { size: 6.4, alpha: 0.6 });
  monoLabel(
    pdf,
    [f.city, f.province].filter(Boolean).join(" · ").toUpperCase() || "SITE ON RECORD",
    leftX,
    accountTop + 21.4,
    { size: 6.4, alpha: 0.45 },
  );
  hairline(pdf, KIT_PAGE.margin + half, accountTop, KIT_PAGE.margin + half, accountTop + 26);
  keyValueRows(pdf, accountTop + 2.2, [
    { label: "Billing period", value: period.label },
    { label: "Bill issued", value: shortDate(period.issue) },
    { label: "Payment due", value: shortDate(period.due) },
  ], { x: rightX, width: half - 12 });

  // Line items.
  let y = accountTop + 33;
  y = dataTable(pdf, y, spec.lines, [
    { label: "Item", width: 86, value: (row: BillLine) => row.description },
    { label: "Detail", width: 52, value: (row: BillLine) => row.detail },
    { label: "Amount", width: 36, align: "right", strong: true, value: (row: BillLine) => row.amount },
  ]);

  // Totals: right aligned, the way a bill totals.
  const totalsWidth = 88;
  const totalsX = KIT_PAGE.margin + KIT_PAGE.contentWidth - totalsWidth;
  y += 2.4;
  y = keyValueRows(pdf, y, [
    { label: "Subtotal excluding VAT", value: randCents(spec.subtotal) },
    { label: "VAT at 15 percent", value: randCents(spec.subtotal * VAT_RATE) },
    { label: "Total due", value: randCents(spec.subtotal * (1 + VAT_RATE)), strong: true },
  ], { x: totalsX, width: totalsWidth });

  // Comparison strip: the story in three numbers.
  y += 4;
  y = statStrip(pdf, y, 18, [
    { value: rand(f.currentMonthly), label: "Audited current bill · ex VAT" },
    { value: rand(spec.monthlyTotal), label: "This example bill · ex VAT" },
    {
      value: rand(Math.max(0, f.currentMonthly - spec.monthlyTotal)),
      label: "Yours to keep, every month",
      accent: KIT_COLORS.green,
    },
  ], { valueSize: 12 });

  // Inclusions: the on-site service carries the full seven.
  if (spec.inclusions) {
    y += 4.6;
    eyebrow(pdf, "INCLUDED IN THIS ONE AMOUNT", KIT_PAGE.margin, y);
    y += 2.2;
    const rowHeight = 7.1;
    panel(pdf, KIT_PAGE.margin, y, KIT_PAGE.contentWidth, rowHeight * spec.inclusions.length + 2.2);
    spec.inclusions.forEach((inclusion, index) => {
      const rowY = y + 1.1 + index * rowHeight;
      if (index > 0) {
        hairline(pdf, KIT_PAGE.margin + 4, rowY, KIT_PAGE.margin + KIT_PAGE.contentWidth - 4, rowY, { alpha: KIT_INK.softLine, base: KIT_COLORS.panel });
      }
      monoLabel(pdf, inclusion.index, KIT_PAGE.margin + 5.4, rowY + 4.8, { size: 6.2, color: KIT_COLORS.amber, alpha: 0.92, base: KIT_COLORS.panel });
      drawText(pdf, inclusion.item, KIT_PAGE.margin + 14, rowY + 4.9, { size: 7.8, weight: "bold", color: blend(KIT_COLORS.ink, 0.88, KIT_COLORS.panel) });
      drawText(pdf, inclusion.detail, KIT_PAGE.margin + KIT_PAGE.contentWidth - 5.4, rowY + 4.9, { size: 6.9, color: blend(KIT_COLORS.ink, KIT_INK.dim, KIT_COLORS.panel) }, { align: "right" });
    });
    y += rowHeight * spec.inclusions.length + 2.2;
  }

  // The two wheeling routes: the distinction the market misses.
  if (spec.routes) {
    y += 4.6;
    eyebrow(pdf, "TWO WAYS TO WHEEL · BOTH AVAILABLE TO YOU", KIT_PAGE.margin, y);
    y += 2.2;
    const routeHeight = 15.4;
    panel(pdf, KIT_PAGE.margin, y, KIT_PAGE.contentWidth, routeHeight * spec.routes.length + 2.2);
    spec.routes.forEach((route, index) => {
      const rowY = y + 1.1 + index * routeHeight;
      if (index > 0) {
        hairline(pdf, KIT_PAGE.margin + 4, rowY, KIT_PAGE.margin + KIT_PAGE.contentWidth - 4, rowY, { alpha: KIT_INK.softLine, base: KIT_COLORS.panel });
      }
      drawText(pdf, route.name, KIT_PAGE.margin + 5.4, rowY + 5.6, { size: 8.6, weight: "bold", color: blend(KIT_COLORS.ink, 0.9, KIT_COLORS.panel) });
      paragraph(
        pdf,
        route.detail,
        KIT_PAGE.margin + 5.4,
        rowY + 9.8,
        { size: 7.4, color: blend(KIT_COLORS.ink, KIT_INK.body, KIT_COLORS.panel) },
        KIT_PAGE.contentWidth - 11,
      );
    });
    y += routeHeight * spec.routes.length + 2.2;
  }

  // Escalation story.
  y += 4.6;
  y = darkCallout(pdf, y, 22, {
    eyebrow: "THE NUMBER THAT MATTERS",
    title: spec.escalationNote,
    body: "Eskom's trajectory is modelled at 13 percent a year, Foundation-1's standing assumption, consistent with the published multi-year price determinations.",
  });

  sourceNote(
    pdf,
    `Indicative example modelled from your audited utility bills (${f.billingPeriods} billing periods, ${f.coveredDays} days) and the ${f.tariffProvider} tariff context. Amounts are confirmed in your formal proposals, and nothing is payable until your migration is live.`,
    KIT_PAGE.footerRuleY - 7.2,
  );
  footerBand(pdf, spec.footerContext, f.caseReference);
  return pdf;
}

export function buildOnsiteExampleBill(context: ReportPackContext): jsPDF {
  const f = deriveReportPackFigures(context);
  return buildExampleBill({
    pathwayEyebrow: "PATHWAY · SOLAR AND STORAGE ON YOUR SITE",
    titleLine1: "Your electricity bill,",
    titleLine2: "after the migration.",
    strapline: "One fixed monthly amount replaces your utility bill. Everything below lives on your site, owned and carried by Foundation-1's programme, at no capital outlay from you.",
    lines: [
      {
        description: "Renewable energy service, solar and storage on your site",
        detail: "Fixed monthly amount",
        amount: randCents(f.onsiteMonthly),
      },
      {
        description: "Capital outlay, connection and installation",
        detail: "Nothing payable to switch",
        amount: "R0.00",
      },
      {
        description: "Agreement term",
        detail: "Power purchase agreement, minimum 10 years",
        amount: "10 years",
      },
    ],
    subtotal: f.onsiteMonthly,
    monthlyTotal: f.onsiteMonthly,
    figures: f,
    escalationNote: `This amount escalates at ${Math.round(f.onsiteEscalation * 100)} percent a year, fixed in your agreement.`,
    inclusions: ONSITE_INCLUSIONS,
    footerContext: "EXAMPLE BILL · SOLAR AND STORAGE ON YOUR SITE",
  });
}

export function buildWheelingExampleBill(context: ReportPackContext): jsPDF {
  const f = deriveReportPackFigures(context);
  const wheeledKwh = f.monthlyKwh * f.wheelingShare;
  const remainderKwh = f.monthlyKwh * (1 - f.wheelingShare);
  const wheeledCharge = wheeledKwh * f.wheeledTariff;
  const remainderCharge = remainderKwh * f.blendedTariff;
  return buildExampleBill({
    pathwayEyebrow: "PATHWAY · WHEELED RENEWABLE ENERGY",
    titleLine1: "Your electricity bill,",
    titleLine2: "with wheeled renewable energy.",
    strapline: "Renewable energy generated elsewhere is delivered to your site across the existing grid, as traditional wheeling or virtual wheeling, whichever fits your metering. You buy the energy at a contracted rate below your blended tariff; your distributor still carries the wires.",
    lines: [
      {
        description: "Wheeled renewable energy",
        detail: `${Math.round(wheeledKwh).toLocaleString("en-ZA")} kilowatt hours at ${randCents(f.wheeledTariff)}`,
        amount: randCents(wheeledCharge),
      },
      {
        description: "Distributor supply and network charges",
        detail: `Remaining ${Math.round(remainderKwh).toLocaleString("en-ZA")} kilowatt hours and delivery`,
        amount: randCents(remainderCharge),
      },
      {
        description: "Capital outlay and switching cost",
        detail: "Nothing payable to switch",
        amount: "R0.00",
      },
      {
        description: "Agreement term",
        detail: "Power purchase agreement, minimum 10 years",
        amount: "10 years",
      },
    ],
    subtotal: f.wheelingMonthly,
    monthlyTotal: f.wheelingMonthly,
    figures: f,
    escalationNote: `Roughly ${Math.round(f.wheelingShare * 100)} percent of your energy moves to the contracted renewable rate.`,
    routes: [
      {
        name: "Traditional wheeling",
        detail: "Energy from a specific generator is delivered to your meter across the grid under a bilateral use-of-system arrangement with your distributor. Best where one site carries the load.",
      },
      {
        name: "Virtual wheeling",
        detail: "Generation is credited against your consumption financially, across one or many meters, without rerouting the physical connection. Best for portfolios, multiple sites and municipal supply.",
      },
    ],
    footerContext: "EXAMPLE BILL · WHEELED RENEWABLE ENERGY",
  });
}

// -----------------------------------------------------------------------------
// The Migration Report: audit, pathway comparison, environmental impact.
// -----------------------------------------------------------------------------

export function buildMigrationReportDocument(context: ReportPackContext): jsPDF {
  const f = deriveReportPackFigures(context);
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });

  coverPage(pdf, {
    contextRight: kitLongDate(f.publishedAt.toISOString()),
    eyebrow: "FOUNDATION-1 MIGRATION REPORT",
    titleLine1: "Every charge audited.",
    titleLine2: "Every pathway compared.",
    lead: "Your utility bills, read line by line by Foundation-1's Machine Intelligence and verified by the migration desk. This is your real number, and what each migration pathway does to it.",
    subject: f.businessName,
    subjectDetail: `${f.caseReference}${f.city ? ` · ${f.city}` : ""}${f.province ? `, ${f.province}` : ""}`,
    stats: [
      { value: rand(f.currentMonthly), label: "Audited monthly bill · ex VAT" },
      { value: rand(f.solutionMonthly), label: "Complete solution · ex VAT" },
      { value: rand(Math.max(0, f.monthlySaving)), label: "Year-one monthly movement", accent: KIT_COLORS.green },
      { value: rand(Math.max(0, f.tenYearDifference)), label: "Ten-year movement", accent: KIT_COLORS.green },
    ],
  });
  footerBand(pdf, "MIGRATION REPORT", f.caseReference);

  // Page 2: the audit and the pathways.
  addKitPage(pdf, {
    eyebrow: "THE AUDIT",
    title: "What your bills actually say.",
    context: f.caseReference,
  });
  let y = 52;
  y = keyValueRows(pdf, y, [
    { label: "Billing periods audited", value: `${f.billingPeriods}` },
    { label: "Days of evidence covered", value: `${f.coveredDays}` },
    { label: "Supply and tariff context", value: f.tariffProvider },
    ...(f.tariffNames.length
      ? [{ label: "Tariffs recognised on the bills", value: f.tariffNames.join(", ") }]
      : []),
    { label: "Blended tariff found", value: `${randCents(f.blendedTariff)} per kilowatt hour` },
    { label: "Modelled monthly consumption", value: `${Math.round(f.monthlyKwh).toLocaleString("en-ZA")} kilowatt hours` },
  ]);

  y += 8;
  eyebrow(pdf, "THE PATHWAYS · MONTHLY BILL, EX VAT", KIT_PAGE.margin, y);
  y += 3;
  type PathRow = { pathway: string; monthly: string; movement: string; note: string };
  const rows: PathRow[] = [
    {
      pathway: "Approved current path",
      monthly: rand(f.currentMonthly),
      movement: "Baseline",
      note: "Modelled to escalate at 13 percent a year",
    },
    {
      pathway: "Solar and storage on your site",
      monthly: rand(f.onsiteMonthly),
      movement: rand(f.currentMonthly - f.onsiteMonthly),
      note: `Fixed ${Math.round(f.onsiteEscalation * 100)} percent escalation, full service included`,
    },
    {
      pathway: "Wheeled renewable energy",
      monthly: rand(f.wheelingMonthly),
      movement: rand(f.currentMonthly - f.wheelingMonthly),
      note: `Traditional or virtual wheeling, about ${Math.round(f.wheelingShare * 100)} percent of energy at the contracted rate`,
    },
    {
      pathway: "Complete blended solution",
      monthly: rand(f.solutionMonthly),
      movement: rand(f.monthlySaving),
      note: "The configuration your report recommends",
    },
  ];
  y = dataTable(pdf, y, rows, [
    { label: "Pathway", width: 58, strong: true, value: (row: PathRow) => row.pathway },
    { label: "Monthly", width: 30, align: "right", value: (row: PathRow) => row.monthly },
    { label: "Movement", width: 30, align: "right", value: (row: PathRow) => row.movement },
    { label: "Note", width: 56, value: (row: PathRow) => row.note },
  ]);

  y += 7;
  eyebrow(pdf, "SOLAR AND STORAGE ON YOUR SITE · WHAT THE ONE AMOUNT INCLUDES", KIT_PAGE.margin, y);
  y += 3;
  const rowHeight = 8.2;
  panel(pdf, KIT_PAGE.margin, y, KIT_PAGE.contentWidth, rowHeight * ONSITE_INCLUSIONS.length + 2.4);
  ONSITE_INCLUSIONS.forEach((inclusion, index) => {
    const rowY = y + 1.2 + index * rowHeight;
    if (index > 0) {
      hairline(pdf, KIT_PAGE.margin + 4, rowY, KIT_PAGE.margin + KIT_PAGE.contentWidth - 4, rowY, { alpha: KIT_INK.softLine, base: KIT_COLORS.panel });
    }
    monoLabel(pdf, inclusion.index, KIT_PAGE.margin + 5.4, rowY + 5.4, { size: 6.4, color: KIT_COLORS.amber, alpha: 0.92, base: KIT_COLORS.panel });
    drawText(pdf, inclusion.item, KIT_PAGE.margin + 14, rowY + 5.5, { size: 8.1, weight: "bold", color: blend(KIT_COLORS.ink, 0.88, KIT_COLORS.panel) });
    drawText(pdf, inclusion.detail, KIT_PAGE.margin + KIT_PAGE.contentWidth - 5.4, rowY + 5.5, { size: 7.2, color: blend(KIT_COLORS.ink, KIT_INK.dim, KIT_COLORS.panel) }, { align: "right" });
  });
  y += rowHeight * ONSITE_INCLUSIONS.length + 2.4;

  sourceNote(
    pdf,
    "Pathway figures are modelled from your audited bills and the current tariff determinations. Both pathways carry a minimum 10-year power purchase agreement. Formal proposals confirm final amounts. No partner is named before your signed Expression of Interest and mutual confidentiality.",
    KIT_PAGE.footerRuleY - 9,
  );
  footerBand(pdf, "MIGRATION REPORT", f.caseReference);

  // Page 3: environmental impact and what happens next.
  addKitPage(pdf, {
    eyebrow: "ENVIRONMENTAL IMPACT",
    title: "What your migration gives back.",
    context: f.caseReference,
  });
  y = 54;
  y = statStrip(pdf, y, 24, [
    { value: `${Math.round(f.annualCo2Tonnes).toLocaleString("en-ZA")} t`, label: "Carbon avoided every year", accent: KIT_COLORS.green },
    { value: `${Math.round(f.tenYearCo2Tonnes).toLocaleString("en-ZA")} t`, label: "Carbon avoided over ten years", accent: KIT_COLORS.green },
    { value: f.treesEquivalent.toLocaleString("en-ZA"), label: "Trees working year round" },
    { value: f.carsEquivalent.toLocaleString("en-ZA"), label: "Cars taken off the road" },
  ], { valueSize: 13 });

  y += 8;
  y = paragraph(
    pdf,
    `Your site consumes about ${Math.round(f.monthlyKwh).toLocaleString("en-ZA")} kilowatt hours a month. Grid electricity in South Africa carries about ${GRID_EMISSION_FACTOR_KG_PER_KWH.toFixed(2)} kilograms of carbon dioxide per kilowatt hour on Eskom's published grid emission factor. Moving that consumption to renewable supply avoids about ${Math.round(f.annualCo2Tonnes).toLocaleString("en-ZA")} tonnes of carbon a year, modelled on your full audited consumption; the engineered share is confirmed in your formal proposals.`,
    KIT_PAGE.margin,
    y,
    { size: 9, color: inkTint(KIT_INK.body) },
    KIT_PAGE.contentWidth,
  );

  y += 7;
  y = paragraph(
    pdf,
    "Tree and vehicle equivalents use standard conversion factors: one mature tree absorbs about 21 kilograms of carbon dioxide a year, and an average passenger vehicle emits about 4.6 tonnes a year. These figures exist to make the number legible, not to decorate it.",
    KIT_PAGE.margin,
    y,
    { size: 8, color: inkTint(KIT_INK.dim) },
    KIT_PAGE.contentWidth,
  );

  y += 9;
  y = darkCallout(pdf, y, 24, {
    eyebrow: "WHAT HAPPENS NEXT",
    title: "Sign the non-binding Expression of Interest to open formal proposals.",
    body: "Nothing is binding and nothing is payable. The Expression of Interest authorises Foundation-1 to bring you formal, signable proposals for the pathways in this report.",
  });

  y += 7;
  eyebrow(pdf, "YOUR JOURNEY · YOU ARE AT STAGE 3 OF 9", KIT_PAGE.margin, y);
  y += 7;
  chipRow(pdf, y, [
    { text: "01 Screen", tone: "neutral" },
    { text: "02 Evidence", tone: "neutral" },
    { text: "03 Migration Report", tone: "cyan" },
    { text: "04 Expression of Interest", tone: "amber" },
    { text: "05 Proposals", tone: "neutral" },
  ], { align: "left", x: KIT_PAGE.margin });
  y += 8;
  chipRow(pdf, y, [
    { text: "06 Verification", tone: "neutral" },
    { text: "07 Term sheet", tone: "neutral" },
    { text: "08 Migration", tone: "neutral" },
    { text: "09 Savings from day one", tone: "neutral" },
  ], { align: "left", x: KIT_PAGE.margin });

  sourceNote(
    pdf,
    "Environmental figures are modelled estimates for decision support, generated with this report. Certified environmental reporting follows the engineered system in the formal proposals.",
    KIT_PAGE.footerRuleY - 9,
  );
  footerBand(pdf, "MIGRATION REPORT", f.caseReference);
  return pdf;
}

// -----------------------------------------------------------------------------
// The First Light Certificate: issued on migration day. Specimen at report
// stage: what the wall gets when the sun takes over.
// -----------------------------------------------------------------------------

export function buildFirstLightCertificate(context: ReportPackContext): jsPDF {
  const f = deriveReportPackFigures(context);
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  paintPaper(pdf);

  // Engraved frame: two hairlines and a fine inner rule.
  const inset = 11;
  const inner = 13.6;
  pdf.setLineWidth(0.5);
  const frame = inkTint(0.8);
  pdf.setDrawColor(frame[0], frame[1], frame[2]);
  pdf.rect(inset, inset, KIT_PAGE.width - inset * 2, KIT_PAGE.height - inset * 2, "S");
  pdf.setLineWidth(0.2);
  const frameSoft = inkTint(0.3);
  pdf.setDrawColor(frameSoft[0], frameSoft[1], frameSoft[2]);
  pdf.rect(inner, inner, KIT_PAGE.width - inner * 2, KIT_PAGE.height - inner * 2, "S");

  const centerX = KIT_PAGE.width / 2;

  monoLabel(pdf, "SPECIMEN · ISSUED ON YOUR MIGRATION DAY", centerX, 22.4, {
    size: 6.2,
    color: KIT_COLORS.amber,
    alpha: 0.95,
    align: "center",
    trackingEm: 0.22,
  });

  // The sun's year, large: the mark of the house.
  const markScale = 0.31; // viewbox 420x120 -> 130mm wide
  analemmaMark(pdf, centerX - (420 * markScale) / 2, 40, {
    scale: markScale,
    strokeAlpha: 0.85,
    lineWidth: 0.5,
    sunHaloAlpha: 0.5,
  });

  eyebrow(pdf, "THE FIRST LIGHT CERTIFICATE", centerX, 106, { align: "center", size: 8.4 });

  drawText(pdf, "This certifies that", centerX, 122, { size: 10.5, color: inkTint(KIT_INK.dim) }, { align: "center" });

  const nameSize = f.businessName.length > 26 ? 19 : 24;
  drawText(pdf, f.businessName, centerX, 134, { size: nameSize, weight: "bold" }, { align: "center" });

  drawText(pdf, "powers its operations with the sun.", centerX, 146, { size: 12.5, color: inkTint(0.78) }, { align: "center" });

  paragraph(
    pdf,
    `Migrated through the Foundation-1 platform. Renewable supply modelled at ${Math.round(f.annualKwh).toLocaleString("en-ZA")} kilowatt hours a year, avoiding about ${Math.round(f.annualCo2Tonnes).toLocaleString("en-ZA")} tonnes of carbon annually, with savings from day one.`,
    centerX - 66,
    158,
    { size: 8.8, color: inkTint(KIT_INK.body) },
    132,
    { align: "center" },
  );

  // Hairline flourish.
  hairline(pdf, centerX - 34, 178, centerX + 34, 178, { alpha: 0.4 });

  monoLabel(pdf, `CERTIFICATE FL-${f.caseReference.replace(/^F1-MC-/, "")}`, centerX, 186.5, {
    size: 6.6,
    alpha: 0.55,
    align: "center",
    trackingEm: 0.18,
  });
  monoLabel(pdf, "ISSUED AT FIRST LIGHT ON YOUR MIGRATION DAY", centerX, 192.2, {
    size: 6.2,
    alpha: 0.4,
    align: "center",
    trackingEm: 0.16,
  });

  // Signature rules.
  const sigY = 232;
  const sigWidth = 62;
  const leftSigX = 36;
  const rightSigX = KIT_PAGE.width - 36 - sigWidth;
  hairline(pdf, leftSigX, sigY, leftSigX + sigWidth, sigY, { alpha: 0.6 });
  monoLabel(pdf, "FOUNDATION-1 (PTY) LTD", leftSigX + sigWidth / 2, sigY + 5, { size: 6, alpha: 0.5, align: "center", trackingEm: 0.12 });
  monoLabel(pdf, "FOUNDER AND MIGRATION DESK", leftSigX + sigWidth / 2, sigY + 9.6, { size: 5.4, alpha: 0.32, align: "center", trackingEm: 0.12 });
  hairline(pdf, rightSigX, sigY, rightSigX + sigWidth, sigY, { alpha: 0.6 });
  monoLabel(pdf, "MIGRATION DAY", rightSigX + sigWidth / 2, sigY + 5, { size: 6, alpha: 0.5, align: "center", trackingEm: 0.12 });
  monoLabel(pdf, "DATE OF FIRST LIGHT", rightSigX + sigWidth / 2, sigY + 9.6, { size: 5.4, alpha: 0.32, align: "center", trackingEm: 0.12 });

  monoLabel(
    pdf,
    `FOUNDATION-1 · THE FIRST LIGHT CERTIFICATE · ${f.caseReference}`,
    centerX,
    KIT_PAGE.height - inset - 6,
    { size: 5.8, alpha: 0.35, align: "center", trackingEm: 0.14 },
  );

  return pdf;
}

// -----------------------------------------------------------------------------
// The pack, by document identity.
// -----------------------------------------------------------------------------

export function isReportPackDocumentId(value: unknown): value is ReportPackDocumentId {
  return REPORT_PACK_DOCUMENTS.some((doc) => doc.id === value);
}

export function buildReportPackDocument(
  id: ReportPackDocumentId,
  context: ReportPackContext,
): { bytes: Uint8Array; filename: string } {
  const reference = context.caseRow.public_reference.toLowerCase();
  const builders: Record<ReportPackDocumentId, { build: () => jsPDF; name: string }> = {
    "migration-report": {
      build: () => buildMigrationReportDocument(context),
      name: `foundation-1-migration-report-${reference}.pdf`,
    },
    "bill-onsite": {
      build: () => buildOnsiteExampleBill(context),
      name: `foundation-1-example-bill-solar-on-site-${reference}.pdf`,
    },
    "bill-wheeling": {
      build: () => buildWheelingExampleBill(context),
      name: `foundation-1-example-bill-wheeled-energy-${reference}.pdf`,
    },
    certificate: {
      build: () => buildFirstLightCertificate(context),
      name: `foundation-1-first-light-certificate-${reference}.pdf`,
    },
  };
  const entry = builders[id];
  const pdf = entry.build();
  return { bytes: new Uint8Array(pdf.output("arraybuffer")), filename: entry.name };
}

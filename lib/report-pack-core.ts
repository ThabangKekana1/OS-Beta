import type { IndicativeMigrationReport } from "@/lib/indicative-migration-report";
import type {
  MigrationCaseProposalRow,
  MigrationCaseRow,
} from "@/lib/migration-case-store";

// =============================================================================
// Report-pack core: one derivation, one story, four documents.
// Pure data module: no renderer dependencies, safe to import anywhere.
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

export function isReportPackDocumentId(value: unknown): value is ReportPackDocumentId {
  return REPORT_PACK_DOCUMENTS.some((doc) => doc.id === value);
}

export const ONSITE_INCLUSIONS: { index: string; item: string; detail: string }[] = [
  { index: "01", item: "Tier 1 solar photovoltaic panels", detail: "25-year product warranty" },
  { index: "02", item: "Commercial battery energy storage, 100 to 3200 kilowatt hours", detail: "10-year warranty" },
  { index: "03", item: "Energy-saving LED lighting and smart metering", detail: "Water and electricity" },
  { index: "04", item: "Solar water heating and borehole filtration", detail: "Integrated water and energy infrastructure" },
  { index: "05", item: "CCTV cameras and small-scale embedded generation registration", detail: "Security and grid-compliance coordination" },
  { index: "06", item: "24/7 electrician and plumber on call", detail: "Operational support when the site needs it" },
  { index: "07", item: "Full insurance, maintenance and operations", detail: "Infrastructure owned, insured and maintained by Nedbank Corporate and Investment Banking" },
];

export const VAT_RATE = 0.15;
export const ESKOM_TRAJECTORY = 0.13;
export const GRID_EMISSION_FACTOR_KG_PER_KWH = 1.04;
const TREE_KG_PER_YEAR = 21;
const CAR_TONNES_PER_YEAR = 4.6;

export type ReportPackContext = {
  caseRow: MigrationCaseRow;
  proposal: MigrationCaseProposalRow;
};

export type PackFigures = {
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

  const indicativeCurrent = asNumber(indicative?.currentPath?.monthlySpendExVat, currentMonthly);
  const scale = indicativeCurrent > 0 ? currentMonthly / indicativeCurrent : 1;
  const pathway = (id: string) => indicative?.pathways?.find((p) => p.id === id) ?? null;

  const eden = pathway("eden");
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

/** Monthly bill in month m (0-based) under annual escalation. */
export function billAt(base: number, escalation: number, month: number): number {
  return base * Math.pow(1 + escalation, month / 12);
}

/** Yearly series (11 points, year 0..10) for the ten-year chart. */
export function tenYearSeries(figures: PackFigures) {
  const years = Array.from({ length: 11 }, (_, year) => year);
  const eskom = years.map((year) => billAt(figures.currentMonthly, ESKOM_TRAJECTORY, year * 12));
  const onsite = years.map((year) => billAt(figures.onsiteMonthly, figures.onsiteEscalation, year * 12));
  const wheeled = years.map((year) =>
    billAt(figures.monthlyKwh * figures.wheelingShare * figures.wheeledTariff, figures.onsiteEscalation, year * 12)
    + billAt(figures.monthlyKwh * (1 - figures.wheelingShare) * figures.blendedTariff, ESKOM_TRAJECTORY, year * 12));
  const blended = years.map((year) => billAt(figures.solutionMonthly, figures.onsiteEscalation, year * 12));
  return { years, eskom, onsite, wheeled, blended };
}

/** Cumulative rand saved vs the Eskom path over `years` full years. */
export function cumulativeSaving(figures: PackFigures, base: number, escalation: number, years: number): number {
  let saved = 0;
  for (let month = 0; month < years * 12; month += 1) {
    saved += billAt(figures.currentMonthly, ESKOM_TRAJECTORY, month) - billAt(base, escalation, month);
  }
  return saved;
}

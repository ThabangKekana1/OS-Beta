import { createHash } from "node:crypto";

/**
 * Bill-analysis layer for Foundation-1 proposals.
 *
 * The pricing engine remains the verified UFMS commercial model. This module
 * answers the separate question that the generic engine cannot: what did the
 * utility actually bill, which charges move with imported kWh, and which
 * charges remain after on-site generation?
 */

export const BILL_ANALYSIS_VERSION = "2026-07-09.2";
export const REQUIRED_BILLING_PERIODS = 6;
export const MINIMUM_COVERED_DAYS = 168;
export const DFFE_GRID_EMISSIONS_KG_PER_KWH = 0.94;
export const AVERAGE_DAYS_PER_MONTH = 365.2425 / 12;

export type UtilityProviderName = "Eskom" | "Municipal" | "Unknown";
export type UtilityTariffFamily =
  | "Ruraflex"
  | "Nightsave Rural"
  | "Nightsave Urban"
  | "Landrate"
  | "Landlight"
  | "Businessrate"
  | "Homepower"
  | "Homelight"
  | "Megaflex"
  | "Miniflex"
  | "Other"
  | "Unknown";
export type BillReadType = "actual" | "estimate" | "mixed" | "unknown";
export type BillSeason = "high" | "low" | "unspecified";
export type BillAnalysisConfidence = "high" | "medium" | "low" | "manual-review";
export type BillReviewStatus = "analysed" | "manual-review" | "unsupported" | "failed";
export type BillChargeCategory =
  | "energy"
  | "network-volumetric"
  | "ancillary-volumetric"
  | "levy-volumetric"
  | "fixed-service"
  | "fixed-capacity"
  | "demand"
  | "reactive"
  | "adjustment"
  | "other";
export type BillChargeTreatment = "addressable" | "residual" | "conditional" | "excluded" | "unknown";
export type TouBucket = "peak" | "standard" | "off-peak";

export type UtilityBillDocumentAnalysis = {
  version: string;
  status: BillReviewStatus;
  sourceHash: string;
  sourceFileName: string;
  analysedAt: string;
  pageCount: number | null;
  provider: UtilityProviderName;
  accountNumber: string | null;
  premiseId: string | null;
  taxInvoiceNumber: string | null;
  billingDate: string | null;
  accountMonth: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  billingDays: number | null;
  readType: BillReadType;
  season: BillSeason;
  tariffName: string | null;
  tariffFamily: UtilityTariffFamily;
  tariffVariant: string | null;
  monthlyKwh: number | null;
  touKwh: Record<TouBucket, number | null>;
  demandKwKva: number | null;
  notifiedMaxDemandKva: number | null;
  utilisedCapacityKva: number | null;
  totalChargesExVat: number | null;
  vatAmount: number | null;
  totalChargesInclVat: number | null;
  totalAmountDue: number | null;
  arrearsAmount: number | null;
  chargeLines: BillChargeLine[];
  chargeSummary: BillChargeSummary;
  reconciled: boolean;
  reconciliationDifference: number | null;
  hasRebillOrCorrection: boolean;
  canonicalisation?: {
    method: "matched-prior-invoice-cancellation";
    priorSourceHash: string;
    originalPeriodStart: string;
    originalBillingDays: number;
    note: string;
  };
  confidence: BillAnalysisConfidence;
  warnings: string[];
};

export type BillChargeLine = {
  description: string;
  amountExVat: number;
  category: BillChargeCategory;
  treatment: BillChargeTreatment;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  rateUnit: string | null;
  touBucket: TouBucket | null;
};

export type BillChargeSummary = {
  addressableExVat: number;
  residualExVat: number;
  conditionalExVat: number;
  excludedExVat: number;
  unknownExVat: number;
  energyExVat: number;
  fixedAndCapacityExVat: number;
  demandAndReactiveExVat: number;
};

export type CurrentisedBillInput = {
  sourceHash: string;
  effectiveFrom: string;
  effectiveTo: string;
  sourceUrl: string;
  sourceWorkbookSha256: string;
  status: "currentised" | "partial" | "blocked" | "not-required";
  currentisedKnownTotalExVat: number | null;
  currentisedAddressableExVat: number | null;
  currentisedResidualExVat: number | null;
  unpricedHistoricalExVat: number;
  blockers: string[];
  warnings: string[];
};

export type BillDesignBasis = {
  method: "highest-normalised-eligible-bill";
  selectionMetric: "highest-normalised-electricity-charges-ex-vat";
  sourceFileName: string;
  sourceHash: string;
  taxInvoiceNumber: string | null;
  periodStart: string;
  periodEnd: string;
  billingDays: number;
  readType: BillReadType;
  normalisationFactor: number;
  historical: {
    billedSpendExVat: number;
    billedSpendInclVat: number | null;
    billedKwh: number;
    monthlyEquivalentSpendExVat: number;
    monthlyEquivalentSpendInclVat: number | null;
    monthlyEquivalentKwh: number;
    monthlyEquivalentAddressableExVat: number;
    monthlyEquivalentResidualExVat: number;
    monthlyEquivalentConditionalExVat: number;
    monthlyEquivalentUnknownExVat: number;
  };
  approvedCurrent: {
    status: "currentised" | "partial" | "blocked" | "not-required";
    effectiveFrom: string;
    effectiveTo: string;
    monthlyEquivalentSpendExVat: number | null;
    monthlyEquivalentAddressableExVat: number | null;
    monthlyEquivalentResidualExVat: number | null;
    unpricedHistoricalMonthlyEquivalentExVat: number;
  } | null;
  explanation: string;
};

export type BillPortfolio = {
  version: string;
  generatedAt: string;
  sourceDocumentCount: number;
  recognisedDocumentCount: number;
  uniquePeriodCount: number;
  duplicateDocumentCount: number;
  coveredDays: number;
  periodStart: string | null;
  periodEnd: string | null;
  provider: UtilityProviderName;
  accountNumbers: string[];
  premiseIds: string[];
  tariffNames: string[];
  tariffFamilies: UtilityTariffFamily[];
  seasonalTariff: boolean;
  includesHighSeason: boolean;
  includesLowSeason: boolean;
  averageMonthlyKwh: number | null;
  averageMonthlySpendExVat: number | null;
  averageMonthlySpendInclVat: number | null;
  blendedTariffExVat: number | null;
  blendedTariffInclVat: number | null;
  addressableMonthlyExVat: number | null;
  residualMonthlyExVat: number | null;
  conditionalMonthlyExVat: number | null;
  unknownMonthlyExVat: number | null;
  actualReadShare: number;
  confidence: BillAnalysisConfidence;
  formalProposalReady: boolean;
  blockers: string[];
  warnings: string[];
  designBasis: BillDesignBasis | null;
  currentTariff: {
    effectiveFrom: string;
    effectiveTo: string;
    sourceUrl: string;
    sourceWorkbookSha256: string;
    status: "currentised" | "already-current" | "partial" | "blocked";
    matchedPeriodCount: number;
    averageMonthlySpendExVat: number | null;
    addressableMonthlyExVat: number | null;
    residualMonthlyExVat: number | null;
    unpricedHistoricalMonthlyExVat: number | null;
    blockers: string[];
    warnings: string[];
  } | null;
  periods: UtilityBillDocumentAnalysis[];
  esg: {
    gridEmissionFactorKgPerKwh: number;
    annualGridConsumptionKwh: number | null;
    annualScope2EmissionsTonnes: number | null;
    energyDataQualityScore: number;
    energyEsgReadinessScore: number;
    scoreLabel: string;
    scoreScope: string;
  };
};

export type ParseBillTextOptions = {
  fileName?: string;
  sourceHash?: string;
  analysedAt?: string;
  pageCount?: number | null;
};

export function isUtilityBillDocumentAnalysis(
  value: unknown,
): value is UtilityBillDocumentAnalysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.version === "string"
    && typeof record.status === "string"
    && typeof record.sourceHash === "string"
    && typeof record.sourceFileName === "string"
    && Array.isArray(record.warnings)
    && record.chargeSummary !== null
    && typeof record.chargeSummary === "object"
  );
}

const MONEY = "[-+]?(?:R\\s*)?\\(?\\s*[\\d ]{1,3}(?:,?[\\d ]{3})*(?:\\.\\d{1,4})?\\s*\\)?";
const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseNumber(value: string | undefined | null) {
  if (!value) return null;
  const trimmed = value.trim();
  const parenthesised = trimmed.startsWith("(") && trimmed.endsWith(")");
  const normalised = trimmed.replace(/[Rr,()\s]/g, "");
  const parsed = Number(normalised);
  if (!Number.isFinite(parsed)) return null;
  return parenthesised ? -Math.abs(parsed) : parsed;
}

function normaliseText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compactText(text: string) {
  return normaliseText(text).replace(/\s+/g, " ");
}

function firstMatch(text: string, pattern: RegExp) {
  return pattern.exec(text)?.[1]?.trim() ?? null;
}

function firstNumber(text: string, pattern: RegExp) {
  return parseNumber(firstMatch(text, pattern));
}

function allNumbers(text: string, pattern: RegExp) {
  const values: number[] = [];
  for (const match of text.matchAll(pattern)) {
    const value = parseNumber(match[1]);
    if (value !== null) values.push(value);
  }
  return values;
}

function toIsoDate(value: string | null) {
  if (!value) return null;
  const match = /^(\d{4})[/-](\d{2})[/-](\d{2})$/.exec(value.trim());
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : iso;
}

function normaliseAccountMonth(value: string | null) {
  if (!value) return null;
  const match = new RegExp(`(${MONTHS.join("|")})\\s+(20\\d{2})`, "i").exec(value);
  return match ? `${match[1].toUpperCase()} ${match[2]}` : null;
}

function detectProvider(text: string): UtilityProviderName {
  if (/ESKOM HOLDINGS|WWW\.ESKOM\.CO\.ZA|csonline\.co\.za/i.test(text)) return "Eskom";
  if (/municipality|municipal|city of|metro/i.test(text)) return "Municipal";
  return "Unknown";
}

export function classifyTariffFamily(tariffName: string | null): UtilityTariffFamily {
  const value = tariffName?.toLowerCase() ?? "";
  if (/ruraflex/.test(value)) return "Ruraflex";
  if (/nightsave\s*rural/.test(value)) return "Nightsave Rural";
  if (/nightsave\s*(urban|large|small)/.test(value)) return "Nightsave Urban";
  if (/landlight/.test(value)) return "Landlight";
  if (/landrate/.test(value)) return "Landrate";
  if (/businessrate/.test(value)) return "Businessrate";
  if (/homepower/.test(value)) return "Homepower";
  if (/homelight/.test(value)) return "Homelight";
  if (/megaflex/.test(value)) return "Megaflex";
  if (/miniflex/.test(value)) return "Miniflex";
  return tariffName ? "Other" : "Unknown";
}

function detectSeason(text: string): BillSeason {
  if (/high season/i.test(text)) return "high";
  if (/low season/i.test(text)) return "low";
  return "unspecified";
}

function classifyCharge(description: string): {
  category: BillChargeCategory;
  treatment: BillChargeTreatment;
  touBucket: TouBucket | null;
} {
  const value = description.toLowerCase();
  const isVolumetric = /\bkwh\b|\/\s*kwh|c\/kwh/.test(value);
  const touBucket: TouBucket | null = /off[ -]?peak/.test(value)
    ? "off-peak"
    : /standard|\bstd\b/.test(value)
      ? "standard"
      : /peak/.test(value)
        ? "peak"
        : null;

  if (/rebill|correction|cancellation|adjustment|discount|interest|late payment|payment arrangement|deposit|security/.test(value)) {
    return { category: "adjustment", treatment: "excluded", touBucket: null };
  }
  if (/reactive|kvarh/.test(value)) {
    return { category: "reactive", treatment: "conditional", touBucket: null };
  }
  if (/energy charge/.test(value)) {
    return { category: "energy", treatment: "addressable", touBucket };
  }
  if (/network demand/.test(value)) {
    return isVolumetric
      ? { category: "network-volumetric", treatment: "addressable", touBucket: null }
      : { category: "demand", treatment: "conditional", touBucket: null };
  }
  if (/maximum demand|demand charge/.test(value)) {
    return { category: "demand", treatment: "conditional", touBucket: null };
  }
  if (/ancillary/.test(value)) {
    return isVolumetric
      ? { category: "ancillary-volumetric", treatment: "addressable", touBucket: null }
      : { category: "other", treatment: "unknown", touBucket: null };
  }
  if (/legacy|electrification|rural subsidy|environmental levy|levy charge/.test(value)) {
    return isVolumetric
      ? { category: "levy-volumetric", treatment: "addressable", touBucket: null }
      : { category: "other", treatment: "unknown", touBucket: null };
  }
  if (/network capacity|generation capacity|generator capacity|notified maximum|utilised capacity/.test(value)) {
    return { category: "fixed-capacity", treatment: "residual", touBucket: null };
  }
  if (/service|administration|fixed charge/.test(value)) {
    return { category: "fixed-service", treatment: "residual", touBucket: null };
  }
  return { category: "other", treatment: "unknown", touBucket: null };
}

function parseChargeLines(text: string) {
  const startMatch = /(?:PREMISE ID NUMBER|TARIFF NAME:)/i.exec(text);
  if (!startMatch) return [];
  const start = startMatch.index;
  const endCandidates = [
    /TOTAL CHARGES(?: FOR BILLING PERIOD)?/gi,
    /ACCOUNT SUMMARY FOR/gi,
    /--\s*\d+\s*of\s*\d+\s*--/gi,
  ];
  let end = text.length;
  for (const pattern of endCandidates) {
    pattern.lastIndex = start;
    const match = pattern.exec(text);
    if (match && match.index < end) end = match.index;
  }
  const section = text.slice(start, end);
  const linePattern = new RegExp(
    `^([^\\n]{3,240}?(?:Charge|charge|CHARGE|Levy|levy)[^\\n]*?)(?:\\n|\\s)+R\\s*((${MONEY}))\\s*$`,
    "gm",
  );
  const lines: BillChargeLine[] = [];

  for (const match of section.matchAll(linePattern)) {
    const description = match[1].replace(/\s+/g, " ").trim();
    const amount = parseNumber(match[2]);
    if (amount === null) continue;
    const classified = classifyCharge(description);
    const quantityMatch = /([-+]?[\d,.]+)\s*(kWh|kvarh|kW|kVA|days?|day)\b/i.exec(description);
    const rateMatch = /@\s*R\s*([\d,.]+)\s*(?:\/\s*)?(kWh|kvarh|kW|kVA|day)?/i.exec(description);
    lines.push({
      description,
      amountExVat: round(amount),
      category: classified.category,
      treatment: classified.treatment,
      quantity: parseNumber(quantityMatch?.[1]),
      unit: quantityMatch?.[2] ?? null,
      rate: parseNumber(rateMatch?.[1]),
      rateUnit: rateMatch?.[2] ?? null,
      touBucket: classified.touBucket,
    });
  }

  return lines;
}

function emptyChargeSummary(): BillChargeSummary {
  return {
    addressableExVat: 0,
    residualExVat: 0,
    conditionalExVat: 0,
    excludedExVat: 0,
    unknownExVat: 0,
    energyExVat: 0,
    fixedAndCapacityExVat: 0,
    demandAndReactiveExVat: 0,
  };
}

function summariseCharges(lines: BillChargeLine[]): BillChargeSummary {
  const summary = emptyChargeSummary();
  for (const line of lines) {
    if (line.treatment === "addressable") summary.addressableExVat += line.amountExVat;
    else if (line.treatment === "residual") summary.residualExVat += line.amountExVat;
    else if (line.treatment === "conditional") summary.conditionalExVat += line.amountExVat;
    else if (line.treatment === "excluded") summary.excludedExVat += line.amountExVat;
    else summary.unknownExVat += line.amountExVat;

    if (line.category === "energy") summary.energyExVat += line.amountExVat;
    if (line.category === "fixed-service" || line.category === "fixed-capacity") {
      summary.fixedAndCapacityExVat += line.amountExVat;
    }
    if (line.category === "demand" || line.category === "reactive") {
      summary.demandAndReactiveExVat += line.amountExVat;
    }
  }
  return Object.fromEntries(
    Object.entries(summary).map(([key, value]) => [key, round(value)]),
  ) as BillChargeSummary;
}

function deriveReadType(text: string): BillReadType {
  const value = firstMatch(text, /READING\s*TYPE:\s*(ACTUAL|ESTIMATE|MIXED)/i)?.toLowerCase();
  if (value === "actual" || value === "estimate" || value === "mixed") return value;
  if (/ACTUAL READING/i.test(text)) return "actual";
  if (/ESTIMAT(?:E|ED) READING/i.test(text)) return "estimate";
  return "unknown";
}

function deriveTariffVariant(tariffName: string | null) {
  if (!tariffName) return null;
  const interval = /interval/i.test(tariffName) ? "Interval" : null;
  const numbers = tariffName.match(/\b[1-4](?:\s*,\s*[1-4])+/)?.[0] ?? null;
  return [numbers, interval].filter(Boolean).join(" · ") || null;
}

function hashText(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export function analyseUtilityBillText(
  rawText: string,
  options: ParseBillTextOptions = {},
): UtilityBillDocumentAnalysis {
  const text = normaliseText(rawText);
  const compact = compactText(text);
  const analysedAt = options.analysedAt ?? new Date().toISOString();
  const sourceHash = options.sourceHash ?? hashText(rawText);
  const sourceFileName = options.fileName?.trim() || "utility-bill";
  const provider = detectProvider(compact);
  const warnings: string[] = [];

  if (compact.length < 120 || !/(electric|eskom|kwh|tariff|invoice)/i.test(compact)) {
    return {
      version: BILL_ANALYSIS_VERSION,
      status: "manual-review",
      sourceHash,
      sourceFileName,
      analysedAt,
      pageCount: options.pageCount ?? null,
      provider,
      accountNumber: null,
      premiseId: null,
      taxInvoiceNumber: null,
      billingDate: null,
      accountMonth: null,
      periodStart: null,
      periodEnd: null,
      billingDays: null,
      readType: "unknown",
      season: "unspecified",
      tariffName: null,
      tariffFamily: "Unknown",
      tariffVariant: null,
      monthlyKwh: null,
      touKwh: { peak: null, standard: null, "off-peak": null },
      demandKwKva: null,
      notifiedMaxDemandKva: null,
      utilisedCapacityKva: null,
      totalChargesExVat: null,
      vatAmount: null,
      totalChargesInclVat: null,
      totalAmountDue: null,
      arrearsAmount: null,
      chargeLines: [],
      chargeSummary: emptyChargeSummary(),
      reconciled: false,
      reconciliationDifference: null,
      hasRebillOrCorrection: false,
      confidence: "manual-review",
      warnings: [
        "No reliable machine-readable electricity-bill text was found. This may be a scan or photo and needs OCR/manual review.",
      ],
    };
  }

  const accountNumber = firstMatch(compact, /YOUR\s+ACCOUNT\s+NO\s+([0-9][0-9 ]{5,24})/i)?.replace(/\s/g, "") ?? null;
  const premiseId = firstMatch(compact, /PREMISE\s+ID\s+NUMBER\s+([A-Z0-9-]{5,30})/i);
  const invoiceNumbers = [...compact.matchAll(/TAX\s+INVOICE\s+NO(?:\.)?\s+([0-9]{6,24})/gi)].map((match) => match[1]);
  const taxInvoiceNumber = invoiceNumbers[0] ?? null;
  const billingDate = toIsoDate(firstMatch(compact, /BILLING\s+DATE\s+(20\d{2}[/-]\d{2}[/-]\d{2})/i));
  const accountMonth = normaliseAccountMonth(firstMatch(compact, /ACCOUNT\s+M\s*O\s*N\s*T\s*H\s+([A-Z]+\s+20\d{2})/i));
  const periodMatch = /READING\s+DATES:\s*(20\d{2}[/-]\d{2}[/-]\d{2})\s*-\s*(20\d{2}[/-]\d{2}[/-]\d{2})/i.exec(compact)
    ?? /CONSUMPTION\s+DETAILS\s*\(\s*(20\d{2}[/-]\d{2}[/-]\d{2})\s*-\s*(20\d{2}[/-]\d{2}[/-]\d{2})\s*\)/i.exec(compact);
  const periodStart = toIsoDate(periodMatch?.[1] ?? null);
  const periodEnd = toIsoDate(periodMatch?.[2] ?? null);
  const billingDays = firstNumber(compact, /NO\s+OF\s+DAYS:\s*(\d{1,5})/i)
    ?? firstNumber(compact, /(?:Service|Administration)\s+(?:and\s+Administration\s+)?Charge[^.]{0,150}?for\s+(\d{1,3})\s+days?/i);
  const tariffName = firstMatch(compact, /TARIFF\s+NAME:\s*(.+?)(?=\s{2,}|\b(?:STAND|FARM|LOT|REM|GOEDEHOOP|Service|Administration|Network)\b)/i)
    ?? firstMatch(text, /TARIFF\s+NAME:\s*([^\n]{2,80})/i);
  const tariffFamily = classifyTariffFamily(tariffName);
  const readType = deriveReadType(compact);
  const season = detectSeason(compact);
  const totalEnergy = firstNumber(compact, /TOTAL\s+ENERGY\s+CONSUMED\s+FOR\s+BILLING\s+PERIOD\s*\(kWh\)\s*([\d,.]+)/i)
    ?? firstNumber(compact, /ENERGY\s+CONSUMPTION\s+ALL\s+kWh\s*([\d,.]+)/i);
  const touKwh = {
    peak: firstNumber(compact, /ENERGY\s+CONSUMPTION\s+PEAK\s+kWh\s*([\d,.]+)/i),
    standard: firstNumber(compact, /ENERGY\s+CONSUMPTION\s+(?:STD|STANDARD)\s+kWh\s*([\d,.]+)/i),
    "off-peak": firstNumber(compact, /ENERGY\s+CONSUMPTION\s+OFF\s*PEAK\s+kWh\s*([\d,.]+)/i),
  };
  const demandKwKva = firstNumber(compact, /DEMAND\s+READING\s*-\s*KW\/KVA\s*([\d,.]+)/i);
  const notifiedMaxDemandKva = firstNumber(compact, /NOTIFIED\s+MAX\s+DEMAND\s+([\d,.]+)/i);
  const utilisedCapacityKva = firstNumber(compact, /UTILISED\s+CAPACITY\s+([\d,.]+)/i);
  const totalChargeValues = allNumbers(compact, new RegExp(`TOTAL\\s+CHARGES(?:\\s+FOR\\s+BILLING\\s+PERIOD)?\\s+R?\\s*(${MONEY})`, "gi"));
  const totalChargesExVat = totalChargeValues.find((value) => value >= 0) ?? null;
  const vatValues = allNumbers(compact, new RegExp(`VAT\\s+RAISED\\s+ON\\s+ITEMS\\s+AT\\s+15%\\s+R?\\s*(${MONEY})`, "gi"));
  const vatAmount = vatValues.at(-1) ?? null;
  const totalChargesInclVat = totalChargesExVat !== null && vatAmount !== null
    ? round(totalChargesExVat + vatAmount)
    : null;
  const totalAmountDue = firstNumber(compact, new RegExp(`TOTAL\\s+AMOUNT\\s+DUE\\s+(${MONEY})`, "i"));
  const arrearsAmount = firstNumber(compact, new RegExp(`ARREARS\\s+(${MONEY})`, "i"));
  const chargeLines = parseChargeLines(text);
  const chargeSummary = summariseCharges(chargeLines);
  const lineTotal = chargeLines.reduce((sum, line) => sum + line.amountExVat, 0);
  const reconciliationDifference = totalChargesExVat === null ? null : round(lineTotal - totalChargesExVat);
  const hasRebillOrCorrection = /REBILLED\s+ADJUSTMENTS|\bCANCELLATIONS?\b|\bCORRECTIONS?\b/i.test(compact);
  const reconciled = totalChargesExVat !== null
    && chargeLines.length > 0
    && !hasRebillOrCorrection
    && Math.abs(reconciliationDifference ?? Number.POSITIVE_INFINITY) <= Math.max(2, totalChargesExVat * 0.002);

  if (!accountNumber) warnings.push("Account number was not confidently extracted.");
  if (!premiseId) warnings.push("Premise ID was not confidently extracted.");
  if (!taxInvoiceNumber) warnings.push("Tax invoice number was not confidently extracted.");
  if (!periodStart || !periodEnd || !billingDays) warnings.push("The full billing period was not confidently extracted.");
  if (!tariffName) warnings.push("Tariff name was not confidently extracted.");
  if (!totalEnergy || totalEnergy <= 0) warnings.push("Billing-period kWh was not confidently extracted.");
  if (totalChargesExVat === null) warnings.push("Current-period charges were not confidently extracted.");
  if (vatAmount === null) warnings.push("Electricity VAT was not confidently extracted; ex-VAT remains the primary comparison basis.");
  if (readType === "estimate") warnings.push("This statement uses an estimated meter reading.");
  if (hasRebillOrCorrection) warnings.push("Rebills, corrections, or cancellations are present and require canonical manual review before a formal proposal.");
  if (!reconciled) warnings.push("Parsed charge lines do not fully reconcile to the current-period charge control total.");
  if (chargeSummary.unknownExVat !== 0) warnings.push("One or more billed charge lines remain unclassified.");

  const coreFields = [accountNumber, taxInvoiceNumber, periodStart, periodEnd, tariffName, totalEnergy, totalChargesExVat];
  const completeCoreFields = coreFields.filter((value) => value !== null && value !== 0).length;
  const confidence: BillAnalysisConfidence = hasRebillOrCorrection
    ? "low"
    : completeCoreFields === coreFields.length && reconciled
      ? "high"
      : completeCoreFields >= 5
        ? "medium"
        : "low";

  return {
    version: BILL_ANALYSIS_VERSION,
    status: confidence === "low" && completeCoreFields < 4 ? "manual-review" : "analysed",
    sourceHash,
    sourceFileName,
    analysedAt,
    pageCount: options.pageCount ?? null,
    provider,
    accountNumber,
    premiseId,
    taxInvoiceNumber,
    billingDate,
    accountMonth,
    periodStart,
    periodEnd,
    billingDays: billingDays ? Math.round(billingDays) : null,
    readType,
    season,
    tariffName,
    tariffFamily,
    tariffVariant: deriveTariffVariant(tariffName),
    monthlyKwh: totalEnergy === null ? null : round(totalEnergy),
    touKwh,
    demandKwKva,
    notifiedMaxDemandKva,
    utilisedCapacityKva,
    totalChargesExVat,
    vatAmount,
    totalChargesInclVat,
    totalAmountDue,
    arrearsAmount,
    chargeLines,
    chargeSummary,
    reconciled,
    reconciliationDifference,
    hasRebillOrCorrection,
    confidence,
    warnings,
  };
}

function periodKey(period: UtilityBillDocumentAnalysis) {
  if (period.accountNumber && period.taxInvoiceNumber) return `${period.accountNumber}:${period.taxInvoiceNumber}`;
  if (period.accountNumber && period.periodStart && period.periodEnd) {
    return `${period.accountNumber}:${period.premiseId ?? "unknown"}:${period.periodStart}:${period.periodEnd}`;
  }
  return `hash:${period.sourceHash}`;
}

function unique<T>(values: Array<T | null | undefined>) {
  return [...new Set(values.filter((value): value is T => value !== null && value !== undefined))];
}

function continuousCoverage(periods: UtilityBillDocumentAnalysis[]) {
  const ranges = periods
    .filter((period) => period.periodStart && period.periodEnd)
    .map((period) => ({
      start: new Date(`${period.periodStart}T00:00:00Z`).getTime(),
      end: new Date(`${period.periodEnd}T00:00:00Z`).getTime(),
    }))
    .filter((period) => Number.isFinite(period.start) && Number.isFinite(period.end) && period.end > period.start)
    .sort((a, b) => a.start - b.start);
  if (ranges.length === 0) return { days: 0, start: null, end: null, gaps: 0, overlaps: 0 };

  let unionStart = ranges[0].start;
  let unionEnd = ranges[0].end;
  let totalMs = 0;
  let gaps = 0;
  let overlaps = 0;
  for (const range of ranges.slice(1)) {
    if (range.start > unionEnd + 2 * 86_400_000) {
      totalMs += unionEnd - unionStart;
      gaps += 1;
      unionStart = range.start;
      unionEnd = range.end;
    } else {
      if (range.start < unionEnd - 2 * 86_400_000) overlaps += 1;
      unionEnd = Math.max(unionEnd, range.end);
    }
  }
  totalMs += unionEnd - unionStart;
  return {
    days: Math.round(totalMs / 86_400_000),
    start: new Date(ranges[0].start).toISOString().slice(0, 10),
    end: new Date(Math.max(...ranges.map((range) => range.end))).toISOString().slice(0, 10),
    gaps,
    overlaps,
  };
}

function monthNormalisationFactor(coveredDays: number) {
  return coveredDays > 0 ? AVERAGE_DAYS_PER_MONTH / coveredDays : 0;
}

function daysBetween(start: string, end: string) {
  const startMs = new Date(`${start}T00:00:00Z`).getTime();
  const endMs = new Date(`${end}T00:00:00Z`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.round((endMs - startMs) / 86_400_000);
}

function comparableChargeLine(left: BillChargeLine, right: BillChargeLine) {
  return left.category === right.category
    && left.treatment === right.treatment
    && left.touBucket === right.touBucket
    && left.unit === right.unit
    && left.rateUnit === right.rateUnit
    && (
      left.rate === right.rate
      || (left.rate !== null && right.rate !== null && Math.abs(left.rate - right.rate) < 0.0001)
    );
}

/**
 * Resolve the common Eskom pattern where a cumulative rebill repeats the prior
 * service period and then cancels that prior invoice in full. The resulting
 * canonical period retains only the incremental days, kWh, and charge lines.
 * Any non-exact or complex correction remains untouched for manual review.
 */
export function canonicaliseUtilityBillAnalyses(
  analyses: ReadonlyArray<UtilityBillDocumentAnalysis>,
): UtilityBillDocumentAnalysis[] {
  const ordered = [...analyses].sort((left, right) =>
    (left.periodEnd ?? "").localeCompare(right.periodEnd ?? ""),
  );

  return ordered.map((analysis) => {
    if (
      !analysis.hasRebillOrCorrection
      || !analysis.periodStart
      || !analysis.periodEnd
      || !analysis.billingDays
      || !analysis.monthlyKwh
      || analysis.totalChargesExVat === null
      || analysis.reconciliationDifference === null
      || !["Businessrate", "Landrate", "Landlight"].includes(analysis.tariffFamily)
      || analysis.chargeSummary.conditionalExVat !== 0
    ) {
      return analysis;
    }

    const prior = ordered
      .filter((candidate) =>
        candidate.sourceHash !== analysis.sourceHash
        && !candidate.hasRebillOrCorrection
        && candidate.accountNumber === analysis.accountNumber
        && candidate.premiseId === analysis.premiseId
        && candidate.periodStart === analysis.periodStart
        && candidate.periodEnd !== null
        && candidate.periodEnd < analysis.periodEnd!
        && candidate.totalChargesExVat !== null
        && Math.abs(candidate.totalChargesExVat - Math.abs(analysis.reconciliationDifference!)) <= 1,
      )
      .sort((left, right) => (right.periodEnd ?? "").localeCompare(left.periodEnd ?? ""))[0];
    if (!prior?.periodEnd || !prior.billingDays || !prior.monthlyKwh) return analysis;

    const incrementalDays = daysBetween(prior.periodEnd, analysis.periodEnd);
    const incrementalKwh = analysis.monthlyKwh - prior.monthlyKwh;
    if (incrementalDays <= 0 || incrementalKwh <= 0) return analysis;

    const usedPriorLines = new Set<number>();
    const incrementalLines = analysis.chargeLines.map((line) => {
      const priorIndex = prior.chargeLines.findIndex((candidate, index) =>
        !usedPriorLines.has(index) && comparableChargeLine(line, candidate),
      );
      if (priorIndex < 0) return null;
      usedPriorLines.add(priorIndex);
      const priorLine = prior.chargeLines[priorIndex];
      const quantity = line.quantity === null || priorLine.quantity === null
        ? null
        : round(line.quantity - priorLine.quantity, 4);
      const amountExVat = round(line.amountExVat - priorLine.amountExVat);
      if (amountExVat < 0 || (quantity !== null && quantity < 0)) return null;
      const chargeName = line.description.match(/^(.+?charge)\b/i)?.[1] ?? line.description;
      return {
        ...line,
        description: `${chargeName} (canonical incremental rebill period)`,
        quantity,
        amountExVat,
      };
    });
    if (
      incrementalLines.some((line) => line === null)
      || usedPriorLines.size !== prior.chargeLines.length
    ) {
      return analysis;
    }

    const chargeLines = incrementalLines as BillChargeLine[];
    const chargeSummary = summariseCharges(chargeLines);
    const lineTotal = chargeLines.reduce((sum, line) => sum + line.amountExVat, 0);
    const reconciliationDifference = round(lineTotal - analysis.totalChargesExVat);
    if (Math.abs(reconciliationDifference) > 1) return analysis;

    const subtractBucket = (bucket: TouBucket) => {
      const current = analysis.touKwh[bucket];
      const previous = prior.touKwh[bucket];
      return current === null || previous === null ? current : round(current - previous, 4);
    };
    return {
      ...analysis,
      periodStart: prior.periodEnd,
      billingDays: incrementalDays,
      monthlyKwh: round(incrementalKwh, 4),
      touKwh: {
        peak: subtractBucket("peak"),
        standard: subtractBucket("standard"),
        "off-peak": subtractBucket("off-peak"),
      },
      chargeLines,
      chargeSummary,
      reconciled: true,
      reconciliationDifference,
      hasRebillOrCorrection: false,
      canonicalisation: {
        method: "matched-prior-invoice-cancellation",
        priorSourceHash: prior.sourceHash,
        originalPeriodStart: analysis.periodStart,
        originalBillingDays: analysis.billingDays,
        note: `The cumulative rebill exactly cancelled the prior ${prior.periodStart} to ${prior.periodEnd} invoice; only ${prior.periodEnd} to ${analysis.periodEnd} remains in this portfolio.`,
      },
      confidence: prior.confidence === "high" ? "high" : "medium",
      warnings: [
        ...analysis.warnings.filter((warning) =>
          !/rebill|correction|cancellation|reconcile/i.test(warning),
        ),
        `Matched prior-invoice cancellation resolved: ${prior.periodStart} to ${prior.periodEnd} was removed from the cumulative rebill.`,
      ],
    };
  });
}

function buildDesignBasis(
  periods: UtilityBillDocumentAnalysis[],
  currentisedByHash: Map<string, CurrentisedBillInput>,
): BillDesignBasis | null {
  const selected = periods
    .filter((period) =>
      period.reconciled
      && !period.hasRebillOrCorrection
      && period.periodStart
      && period.periodEnd
      && period.billingDays
      && period.billingDays > 0
      && period.monthlyKwh
      && period.monthlyKwh > 0
      && period.totalChargesExVat !== null
      && period.totalChargesExVat > 0,
    )
    .map((period) => ({
      period,
      factor: monthNormalisationFactor(period.billingDays!),
      normalisedSpend: period.totalChargesExVat! * monthNormalisationFactor(period.billingDays!),
    }))
    .sort((left, right) =>
      right.normalisedSpend - left.normalisedSpend
      || (right.period.periodEnd ?? "").localeCompare(left.period.periodEnd ?? ""),
    )[0];
  if (!selected) return null;

  const { period, factor } = selected;
  const current = currentisedByHash.get(period.sourceHash);
  return {
    method: "highest-normalised-eligible-bill",
    selectionMetric: "highest-normalised-electricity-charges-ex-vat",
    sourceFileName: period.sourceFileName,
    sourceHash: period.sourceHash,
    taxInvoiceNumber: period.taxInvoiceNumber,
    periodStart: period.periodStart!,
    periodEnd: period.periodEnd!,
    billingDays: period.billingDays!,
    readType: period.readType,
    normalisationFactor: round(factor, 6),
    historical: {
      billedSpendExVat: period.totalChargesExVat!,
      billedSpendInclVat: period.totalChargesInclVat,
      billedKwh: period.monthlyKwh!,
      monthlyEquivalentSpendExVat: round(period.totalChargesExVat! * factor),
      monthlyEquivalentSpendInclVat: period.totalChargesInclVat === null
        ? null
        : round(period.totalChargesInclVat * factor),
      monthlyEquivalentKwh: round(period.monthlyKwh! * factor),
      monthlyEquivalentAddressableExVat: round(period.chargeSummary.addressableExVat * factor),
      monthlyEquivalentResidualExVat: round(period.chargeSummary.residualExVat * factor),
      monthlyEquivalentConditionalExVat: round(period.chargeSummary.conditionalExVat * factor),
      monthlyEquivalentUnknownExVat: round(
        (period.chargeSummary.unknownExVat + Math.abs(period.reconciliationDifference ?? 0)) * factor,
      ),
    },
    approvedCurrent: current
      ? {
          status: current.status,
          effectiveFrom: current.effectiveFrom,
          effectiveTo: current.effectiveTo,
          monthlyEquivalentSpendExVat: current.currentisedKnownTotalExVat === null
            ? null
            : round(current.currentisedKnownTotalExVat * factor),
          monthlyEquivalentAddressableExVat: current.currentisedAddressableExVat === null
            ? null
            : round(current.currentisedAddressableExVat * factor),
          monthlyEquivalentResidualExVat: current.currentisedResidualExVat === null
            ? null
            : round(current.currentisedResidualExVat * factor),
          unpricedHistoricalMonthlyEquivalentExVat: round(current.unpricedHistoricalExVat * factor),
        }
      : null,
    explanation: `Selected because this is the highest eligible electricity-charge period after normalising ${period.billingDays} service days to ${AVERAGE_DAYS_PER_MONTH.toFixed(2)} days. Spend and kWh come from this same period; amount due, balances, arrears, deposits, and payments are excluded.`,
  };
}

export function aggregateUtilityBills(
  analyses: ReadonlyArray<UtilityBillDocumentAnalysis>,
  generatedAt: string = new Date().toISOString(),
  options: { currentisedBills?: ReadonlyArray<CurrentisedBillInput> } = {},
): BillPortfolio {
  const canonicalAnalyses = canonicaliseUtilityBillAnalyses(analyses);
  const recognised = canonicalAnalyses.filter((analysis) => analysis.status === "analysed" && analysis.monthlyKwh && analysis.totalChargesExVat !== null);
  const byPeriod = new Map<string, UtilityBillDocumentAnalysis>();
  for (const analysis of recognised) {
    const key = periodKey(analysis);
    const prior = byPeriod.get(key);
    if (!prior || analysis.confidence === "high" || prior.confidence === "low") byPeriod.set(key, analysis);
  }
  const periods = [...byPeriod.values()].sort((a, b) => (a.periodStart ?? "").localeCompare(b.periodStart ?? ""));
  const duplicateDocumentCount = Math.max(0, recognised.length - periods.length);
  const coverage = continuousCoverage(periods);
  const sourceDays = periods.reduce((sum, period) => sum + (period.billingDays ?? 0), 0);
  const coveredDays = coverage.days || sourceDays;
  const factor = monthNormalisationFactor(coveredDays);
  const sum = (selector: (period: UtilityBillDocumentAnalysis) => number | null) =>
    periods.reduce((total, period) => total + (selector(period) ?? 0), 0);
  const averageMonthlyKwh = factor > 0 ? sum((period) => period.monthlyKwh) * factor : average(periods.map((period) => period.monthlyKwh!).filter(Boolean));
  const averageMonthlySpendExVat = factor > 0 ? sum((period) => period.totalChargesExVat) * factor : average(periods.map((period) => period.totalChargesExVat!).filter((value) => value !== null));
  const inclVatPeriods = periods.filter((period) => period.totalChargesInclVat !== null);
  const averageMonthlySpendInclVat = inclVatPeriods.length === periods.length && periods.length > 0
    ? (factor > 0
        ? sum((period) => period.totalChargesInclVat) * factor
        : average(inclVatPeriods.map((period) => period.totalChargesInclVat!)))
    : null;
  const addressableMonthlyExVat = factor > 0 ? sum((period) => period.chargeSummary.addressableExVat) * factor : null;
  const residualMonthlyExVat = factor > 0 ? sum((period) => period.chargeSummary.residualExVat) * factor : null;
  const conditionalMonthlyExVat = factor > 0 ? sum((period) => period.chargeSummary.conditionalExVat) * factor : null;
  const unknownMonthlyExVat = factor > 0
    ? sum((period) => period.chargeSummary.unknownExVat + Math.abs(period.reconciliationDifference ?? 0)) * factor
    : null;
  const accountNumbers = unique(periods.map((period) => period.accountNumber));
  const premiseIds = unique(periods.map((period) => period.premiseId));
  const tariffNames = unique(periods.map((period) => period.tariffName));
  const tariffFamilies = unique(periods.map((period) => period.tariffFamily));
  const providerValues = unique(periods.map((period) => period.provider));
  const provider = providerValues.length === 1 ? providerValues[0] : "Unknown";
  const seasonalTariff = tariffFamilies.some((family) => family === "Ruraflex" || family === "Megaflex" || family === "Miniflex");
  const includesHighSeason = periods.some((period) => period.season === "high");
  const includesLowSeason = periods.some((period) => period.season === "low");
  const actualReadShare = periods.length === 0
    ? 0
    : periods.filter((period) => period.readType === "actual").length / periods.length;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (periods.length < REQUIRED_BILLING_PERIODS) blockers.push(`Six recognised billing periods are required; ${periods.length} ${periods.length === 1 ? "period is" : "periods are"} ready.`);
  if (coveredDays < MINIMUM_COVERED_DAYS) blockers.push(`At least ${MINIMUM_COVERED_DAYS} unique covered days are required; ${coveredDays} were recognised.`);
  if (accountNumbers.length !== 1) blockers.push(accountNumbers.length === 0 ? "The bill account number is missing." : "Multiple utility accounts are mixed in this bill pack.");
  if (premiseIds.length > 1) blockers.push("Multiple premises are mixed in this bill pack and must be modelled separately.");
  if (tariffFamilies.length !== 1) blockers.push("Multiple or unknown tariff families are mixed in this bill pack.");
  if (coverage.gaps > 0) blockers.push("The recognised service periods contain an unexplained gap.");
  if (coverage.overlaps > 0) blockers.push("The recognised service periods overlap and require canonical review.");
  if (periods.some((period) => period.hasRebillOrCorrection)) blockers.push("At least one bill contains a rebill, correction, or cancellation requiring manual reconciliation.");
  if (periods.some((period) => !period.reconciled)) blockers.push("At least one bill does not reconcile its parsed charge lines to the statement total.");
  if ((unknownMonthlyExVat ?? 0) > 2) blockers.push("At least one billed amount remains unclassified.");
  if (seasonalTariff && !(includesHighSeason && includesLowSeason)) blockers.push("A seasonal time-of-use tariff needs both high- and low-demand-season bills before annual savings can be issued.");
  if (seasonalTariff && coveredDays < 330) warnings.push("A full 12-month time-of-use history is recommended before treating the annual profile as bankable.");
  if (actualReadShare < 0.5) warnings.push("More than half of the recognised bills use estimated or unknown meter readings.");
  if (duplicateDocumentCount > 0) warnings.push(`${duplicateDocumentCount} duplicate invoice upload${duplicateDocumentCount === 1 ? " was" : "s were"} removed from the portfolio.`);
  if (analyses.some((analysis) => analysis.status !== "analysed")) warnings.push("One or more uploaded files need OCR or manual review and were excluded from the numeric portfolio.");
  if (averageMonthlySpendInclVat === null) warnings.push("Not every recognised bill had attributable VAT; proposal economics use the ex-VAT basis.");

  const confidence: BillAnalysisConfidence = blockers.length === 0 && periods.every((period) => period.confidence === "high")
    ? "high"
    : periods.length >= 3 && averageMonthlyKwh && averageMonthlySpendExVat
      ? "medium"
      : periods.length > 0
        ? "low"
        : "manual-review";
  const energyDataQualityScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (Math.min(periods.length / REQUIRED_BILLING_PERIODS, 1) * 35)
        + (Math.min(coveredDays / MINIMUM_COVERED_DAYS, 1) * 25)
        + (actualReadShare * 20)
        + (periods.length > 0 ? (periods.filter((period) => period.reconciled).length / periods.length) * 20 : 0),
      ),
    ),
  );
  const energyEsgReadinessScore = Math.round(
    energyDataQualityScore * 0.6
    + (averageMonthlyKwh ? 15 : 0)
    + (averageMonthlySpendExVat ? 10 : 0)
    + (addressableMonthlyExVat !== null && residualMonthlyExVat !== null ? 15 : 0),
  );
  const annualGridConsumptionKwh = averageMonthlyKwh === null ? null : averageMonthlyKwh * 12;
  const annualScope2EmissionsTonnes = annualGridConsumptionKwh === null
    ? null
    : annualGridConsumptionKwh * DFFE_GRID_EMISSIONS_KG_PER_KWH / 1_000;
  const currentisedByHash = new Map((options.currentisedBills ?? []).map((bill) => [bill.sourceHash, bill]));
  const designBasis = buildDesignBasis(periods, currentisedByHash);
  const currentisedPeriods = periods.map((period) => currentisedByHash.get(period.sourceHash)).filter((bill) => bill !== undefined);
  const completeCurrentisedPeriods = currentisedPeriods.filter((bill) =>
    (bill.status === "currentised" || bill.status === "not-required")
    && bill.currentisedKnownTotalExVat !== null
    && bill.currentisedAddressableExVat !== null
    && bill.currentisedResidualExVat !== null,
  );
  const currentFactor = completeCurrentisedPeriods.length === periods.length ? factor : 0;
  const currentTariff = currentisedPeriods.length === 0
    ? null
    : {
        effectiveFrom: currentisedPeriods[0].effectiveFrom,
        effectiveTo: currentisedPeriods[0].effectiveTo,
        sourceUrl: currentisedPeriods[0].sourceUrl,
        sourceWorkbookSha256: currentisedPeriods[0].sourceWorkbookSha256,
        status: completeCurrentisedPeriods.length === periods.length
          ? currentisedPeriods.every((bill) => bill.status === "not-required") ? "already-current" as const : "currentised" as const
          : completeCurrentisedPeriods.length > 0 ? "partial" as const : "blocked" as const,
        matchedPeriodCount: completeCurrentisedPeriods.length,
        averageMonthlySpendExVat: currentFactor > 0
          ? round(completeCurrentisedPeriods.reduce((sum, bill) => sum + bill.currentisedKnownTotalExVat!, 0) * currentFactor)
          : null,
        addressableMonthlyExVat: currentFactor > 0
          ? round(completeCurrentisedPeriods.reduce((sum, bill) => sum + bill.currentisedAddressableExVat!, 0) * currentFactor)
          : null,
        residualMonthlyExVat: currentFactor > 0
          ? round(completeCurrentisedPeriods.reduce((sum, bill) => sum + bill.currentisedResidualExVat!, 0) * currentFactor)
          : null,
        unpricedHistoricalMonthlyExVat: currentFactor > 0
          ? round(completeCurrentisedPeriods.reduce((sum, bill) => sum + bill.unpricedHistoricalExVat, 0) * currentFactor)
          : null,
        blockers: unique(currentisedPeriods.flatMap((bill) => bill.blockers)),
        warnings: unique(currentisedPeriods.flatMap((bill) => bill.warnings)),
      };
  if (provider === "Eskom" && periods.length > 0 && currentTariff === null) {
    const family = tariffFamilies.length === 1 ? tariffFamilies[0] : null;
    const catalogueAssisted = family === "Megaflex" || family === "Miniflex" || family === "Nightsave Urban";
    blockers.push(catalogueAssisted
      ? `The ${family} tariff was recognised. Approved-current repricing for ${family} is operator-assisted; Foundation-1 reprices this pack manually against the current Eskom schedule of standard prices before the proposal completes.`
      : "The Eskom bills have not yet been repriced against the approved current tariff schedule.");
  } else if (provider === "Eskom" && currentTariff && currentTariff.status !== "currentised" && currentTariff.status !== "already-current") {
    blockers.push(`Only ${currentTariff.matchedPeriodCount} of ${periods.length} billing periods were safely matched to the approved current Eskom tariff schedule.`);
  }
  if (periods.length > 0 && designBasis === null) {
    blockers.push("No reconciled bill period is eligible to act as the highest-bill design basis.");
  }

  return {
    version: BILL_ANALYSIS_VERSION,
    generatedAt,
    sourceDocumentCount: analyses.length,
    recognisedDocumentCount: recognised.length,
    uniquePeriodCount: periods.length,
    duplicateDocumentCount,
    coveredDays,
    periodStart: coverage.start,
    periodEnd: coverage.end,
    provider,
    accountNumbers,
    premiseIds,
    tariffNames,
    tariffFamilies,
    seasonalTariff,
    includesHighSeason,
    includesLowSeason,
    averageMonthlyKwh: averageMonthlyKwh === null ? null : round(averageMonthlyKwh),
    averageMonthlySpendExVat: averageMonthlySpendExVat === null ? null : round(averageMonthlySpendExVat),
    averageMonthlySpendInclVat: averageMonthlySpendInclVat === null ? null : round(averageMonthlySpendInclVat),
    blendedTariffExVat: averageMonthlyKwh && averageMonthlySpendExVat ? round(averageMonthlySpendExVat / averageMonthlyKwh, 4) : null,
    blendedTariffInclVat: averageMonthlyKwh && averageMonthlySpendInclVat ? round(averageMonthlySpendInclVat / averageMonthlyKwh, 4) : null,
    addressableMonthlyExVat: addressableMonthlyExVat === null ? null : round(addressableMonthlyExVat),
    residualMonthlyExVat: residualMonthlyExVat === null ? null : round(residualMonthlyExVat),
    conditionalMonthlyExVat: conditionalMonthlyExVat === null ? null : round(conditionalMonthlyExVat),
    unknownMonthlyExVat: unknownMonthlyExVat === null ? null : round(unknownMonthlyExVat),
    actualReadShare: round(actualReadShare, 4),
    confidence,
    formalProposalReady: blockers.length === 0,
    blockers,
    warnings,
    designBasis,
    currentTariff,
    periods,
    esg: {
      gridEmissionFactorKgPerKwh: DFFE_GRID_EMISSIONS_KG_PER_KWH,
      annualGridConsumptionKwh: annualGridConsumptionKwh === null ? null : round(annualGridConsumptionKwh),
      annualScope2EmissionsTonnes: annualScope2EmissionsTonnes === null ? null : round(annualScope2EmissionsTonnes),
      energyDataQualityScore,
      energyEsgReadinessScore,
      scoreLabel: energyEsgReadinessScore >= 80 ? "Decision-ready" : energyEsgReadinessScore >= 60 ? "Developing" : "Evidence incomplete",
      scoreScope: "Energy-data readiness only; this is not a corporate ESG rating.",
    },
  };
}

export function proposalReadiness(
  portfolio: BillPortfolio,
  hasSignedEoi: boolean,
  options: {
    requireSignedEoi?: boolean;
    requireEngineeringApproval?: boolean;
    engineeringApproved?: boolean;
  } = {},
) {
  const requireSignedEoi = options.requireSignedEoi ?? true;
  const blockers = [...portfolio.blockers];
  if (requireSignedEoi && !hasSignedEoi) {
    blockers.unshift("A signed post-assessment Foundation-1 Expression of Interest is required for formal-proposal progression.");
  }
  if (options.requireEngineeringApproval && !options.engineeringApproved) {
    blockers.push("Engineering must approve the imported-kWh displacement and battery dispatch model before a formal savings proposal can be issued.");
  }
  return {
    ready:
      (!requireSignedEoi || hasSignedEoi)
      && portfolio.formalProposalReady
      && (!options.requireEngineeringApproval || Boolean(options.engineeringApproved)),
    blockers,
  };
}

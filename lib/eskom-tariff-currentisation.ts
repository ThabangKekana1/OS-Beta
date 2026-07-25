import catalogueJson from "@/lib/tariffs/eskom-2026-27.json" with { type: "json" };
import type {
  BillChargeCategory,
  BillSeason,
  TouBucket,
  UtilityBillDocumentAnalysis,
} from "@/lib/utility-bill-analysis";

export type EskomTariffMatchStatus = "matched" | "ambiguous" | "unsupported";
export type CurrentisationStatus = "currentised" | "partial" | "blocked" | "not-required";

type FlatTariff = (typeof catalogueJson.flatTariffs)[number];
type RuraflexVariant = (typeof catalogueJson.ruraflex.variants)[number];
type NightsaveRuralVariant = (typeof catalogueJson.nightsaveRural.variants)[number];
type CatalogueVariant = FlatTariff | RuraflexVariant | NightsaveRuralVariant;
type HistoricalFlatTariff = (typeof catalogueJson.historicalReference.flatTariffs)[number];
type HistoricalRuraflexVariant = (typeof catalogueJson.historicalReference.ruraflex.variants)[number];

export type EskomTariffContext = {
  billCode?: string | null;
  transmissionZone?: number | null;
  voltageCode?: number | null;
  customerCategory?: string | null;
};

export type EskomTariffMatch = {
  status: EskomTariffMatchStatus;
  variant: CatalogueVariant | null;
  candidates: CatalogueVariant[];
  blockers: string[];
};

export type CurrentisedChargeLine = {
  description: string;
  category: BillChargeCategory;
  quantity: number | null;
  quantityUnit: string | null;
  touBucket: TouBucket | null;
  season: BillSeason;
  historicalAmountExVat: number;
  currentRate: number | null;
  currentRateUnit: string | null;
  currentAmountExVat: number | null;
  status: "currentised" | "preserved" | "unpriced";
  note: string;
};

export type CurrentisedBill = {
  catalogueTitle: string;
  effectiveFrom: string;
  effectiveTo: string;
  sourceUrl: string;
  sourceWorkbookSha256: string;
  status: CurrentisationStatus;
  match: EskomTariffMatch;
  historicalTotalExVat: number | null;
  currentisedKnownTotalExVat: number | null;
  currentisedAddressableExVat: number | null;
  currentisedResidualExVat: number | null;
  unpricedHistoricalExVat: number;
  lines: CurrentisedChargeLine[];
  blockers: string[];
  warnings: string[];
};

const catalogue = catalogueJson;

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalise(value: string | null | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() ?? "";
}

function currentRatePeriod(analysis: UtilityBillDocumentAnalysis) {
  const referenceDate = analysis.periodEnd ?? analysis.billingDate;
  if (!referenceDate) return false;
  return referenceDate >= catalogue.effectiveFrom && referenceDate <= catalogue.effectiveTo;
}

function flatCandidates(analysis: UtilityBillDocumentAnalysis): FlatTariff[] {
  const family = analysis.tariffFamily.toLowerCase();
  const variants = catalogue.flatTariffs.filter((variant) => variant.family === family);
  const tariffText = normalise(`${analysis.tariffName ?? ""} ${analysis.tariffVariant ?? ""}`);
  if (!tariffText) return variants;
  const exact = variants.filter((variant) => {
    const number = variant.tariff.match(/\b([1-4])\b/)?.[1];
    return number ? new RegExp(`\\b${number}\\b`).test(tariffText) && !tariffText.includes("1 2 3") : false;
  });
  return exact.length === 1 ? exact : variants;
}

function matchByContext<T extends CatalogueVariant>(
  candidates: T[],
  context: EskomTariffContext,
): T[] {
  let matches = candidates;
  if (context.billCode) matches = matches.filter((candidate) => candidate.billCode.toLowerCase() === context.billCode!.toLowerCase());
  if (context.transmissionZone !== null && context.transmissionZone !== undefined) {
    matches = matches.filter((candidate) => candidate.transmissionZone === context.transmissionZone);
  }
  if (context.voltageCode !== null && context.voltageCode !== undefined) {
    matches = matches.filter((candidate) => candidate.voltageCode === context.voltageCode);
  }
  return matches;
}

function relativeDifference(actual: number, expected: number) {
  if (actual === 0 && expected === 0) return 0;
  return Math.abs(actual - expected) / Math.max(Math.abs(actual), Math.abs(expected), 0.0001);
}

function billedRate(
  analysis: UtilityBillDocumentAnalysis,
  pattern: RegExp,
) {
  return analysis.chargeLines.find((line) => pattern.test(line.description) && line.rate !== null)?.rate ?? null;
}

function inferFlatBillCode(analysis: UtilityBillDocumentAnalysis, candidates: CatalogueVariant[]) {
  const historical = catalogue.historicalReference.flatTariffs.filter((variant) =>
    candidates.some((candidate) => candidate.billCode === variant.billCode),
  );
  const observations = [
    { actual: billedRate(analysis, /energy charge/i), expected: (variant: HistoricalFlatTariff) => variant.ratesExVat.energyCentsPerKwh === null ? null : variant.ratesExVat.energyCentsPerKwh / 100 },
    { actual: billedRate(analysis, /network capacity/i), expected: (variant: HistoricalFlatTariff) => variant.ratesExVat.networkCapacityRandPerPodDay },
    { actual: billedRate(analysis, /service|administration/i), expected: (variant: HistoricalFlatTariff) => variant.ratesExVat.serviceAndAdministrationRandPerPodDay },
    { actual: billedRate(analysis, /generation|generator/i), expected: (variant: HistoricalFlatTariff) => variant.ratesExVat.generationCapacityRandPerPodDay },
  ].filter((observation) => observation.actual !== null);
  if (observations.length < 2) return null;
  const ranked = historical.map((variant) => {
    const differences = observations.map((observation) => {
      const expected = observation.expected(variant);
      return expected === null ? 1 : relativeDifference(observation.actual!, expected);
    });
    return { billCode: variant.billCode, score: differences.reduce((sum, value) => sum + value, 0) / differences.length };
  }).sort((left, right) => left.score - right.score);
  if (!ranked[0] || ranked[0].score > 0.015 || (ranked[1] && ranked[1].score - ranked[0].score < 0.02)) return null;
  return ranked[0].billCode;
}

function inferRuraflexBillCode(analysis: UtilityBillDocumentAnalysis) {
  const observations = [
    { actual: billedRate(analysis, /high season peak energy/i), path: ["highSeasonCentsPerKwh", "peak"] as const, divisor: 100 },
    { actual: billedRate(analysis, /high season standard energy/i), path: ["highSeasonCentsPerKwh", "standard"] as const, divisor: 100 },
    { actual: billedRate(analysis, /high season off peak energy/i), path: ["highSeasonCentsPerKwh", "offPeak"] as const, divisor: 100 },
    { actual: billedRate(analysis, /low season peak energy/i), path: ["lowSeasonCentsPerKwh", "peak"] as const, divisor: 100 },
    { actual: billedRate(analysis, /network capacity/i), path: ["networkCapacityRandPerKvaMonth"] as const, divisor: 1 },
    { actual: billedRate(analysis, /generation|generator/i), path: ["generationCapacityRandPerKvaMonth"] as const, divisor: 1 },
  ].filter((observation) => observation.actual !== null);
  if (observations.length < 2) return null;
  const ranked = catalogue.historicalReference.ruraflex.variants.map((variant: HistoricalRuraflexVariant) => {
    const differences = observations.map((observation) => {
      const rawExpected = observation.path.length === 1
        ? variant.ratesExVat[observation.path[0] as "networkCapacityRandPerKvaMonth"]
        : variant.ratesExVat[observation.path[0] as "highSeasonCentsPerKwh"][observation.path[1]!];
      return relativeDifference(observation.actual!, rawExpected / observation.divisor);
    });
    const closeMatches = differences.filter((difference) => difference <= 0.015).length;
    return {
      billCode: variant.billCode,
      closeMatches,
      score: differences.filter((difference) => difference <= 0.015).reduce((sum, value) => sum + value, 0) / Math.max(closeMatches, 1),
    };
  }).sort((left, right) => right.closeMatches - left.closeMatches || left.score - right.score);
  if (!ranked[0] || ranked[0].closeMatches < 2 || (ranked[1] && ranked[1].closeMatches === ranked[0].closeMatches && ranked[1].score - ranked[0].score < 0.002)) return null;
  return ranked[0].billCode;
}

export function matchEskomTariff(
  analysis: UtilityBillDocumentAnalysis,
  context: EskomTariffContext = {},
): EskomTariffMatch {
  if (analysis.provider !== "Eskom") {
    return {
      status: "unsupported",
      variant: null,
      candidates: [],
      blockers: ["Only Eskom-direct accounts can use the Eskom tariff catalogue; municipal schedules must be sourced separately."],
    };
  }

  let candidates: CatalogueVariant[];
  if (analysis.tariffFamily === "Businessrate" || analysis.tariffFamily === "Landrate" || analysis.tariffFamily === "Landlight") {
    candidates = flatCandidates(analysis);
  } else if (analysis.tariffFamily === "Ruraflex") {
    candidates = catalogue.ruraflex.variants;
  } else if (analysis.tariffFamily === "Nightsave Rural") {
    candidates = catalogue.nightsaveRural.variants;
  } else {
    return {
      status: "unsupported",
      variant: null,
      candidates: [],
      blockers: [`${analysis.tariffFamily} is not yet supported by the current Eskom catalogue layer.`],
    };
  }

  let matches = matchByContext(candidates, context);
  if (!context.billCode && context.transmissionZone === undefined && context.voltageCode === undefined) {
    const inferredBillCode = analysis.tariffFamily === "Ruraflex"
      ? inferRuraflexBillCode(analysis)
      : analysis.tariffFamily === "Businessrate" || analysis.tariffFamily === "Landrate" || analysis.tariffFamily === "Landlight"
        ? inferFlatBillCode(analysis, candidates)
        : null;
    if (inferredBillCode) matches = candidates.filter((candidate) => candidate.billCode === inferredBillCode);
  }
  if (matches.length === 1) return { status: "matched", variant: matches[0], candidates: matches, blockers: [] };

  const missing: string[] = [];
  if (!context.billCode && candidates.some((candidate) => "transmissionZoneDescription" in candidate)) {
    if (context.transmissionZone === null || context.transmissionZone === undefined) missing.push("transmission zone");
    if (context.voltageCode === null || context.voltageCode === undefined) missing.push("supply voltage");
  } else if (!context.billCode && matches.length > 1) {
    missing.push("exact tariff option or bill code");
  }
  return {
    status: "ambiguous",
    variant: null,
    candidates: matches,
    blockers: [`Current tariff matching needs ${missing.join(" and ") || "a valid bill code"}; ${matches.length} approved variants remain possible.`],
  };
}

function flatRate(
  line: UtilityBillDocumentAnalysis["chargeLines"][number],
  variant: FlatTariff,
): { rate: number; unit: string } | null {
  if (line.category === "energy" && variant.ratesExVat.energyCentsPerKwh !== null) {
    return { rate: variant.ratesExVat.energyCentsPerKwh / 100, unit: "R/kWh" };
  }
  if (line.category === "ancillary-volumetric" && variant.ratesExVat.ancillaryCentsPerKwh !== null) {
    return { rate: variant.ratesExVat.ancillaryCentsPerKwh / 100, unit: "R/kWh" };
  }
  if (line.category === "network-volumetric" && variant.ratesExVat.networkDemandCentsPerKwh !== null) {
    return { rate: variant.ratesExVat.networkDemandCentsPerKwh / 100, unit: "R/kWh" };
  }
  if (line.category === "levy-volumetric" && /electrification|rural subsidy/i.test(line.description) && variant.ratesExVat.electrificationRuralSubsidyCentsPerKwh !== null) {
    return { rate: variant.ratesExVat.electrificationRuralSubsidyCentsPerKwh / 100, unit: "R/kWh" };
  }
  if (line.category === "fixed-capacity" && /network capacity/i.test(line.description) && variant.ratesExVat.networkCapacityRandPerPodDay !== null) {
    return { rate: variant.ratesExVat.networkCapacityRandPerPodDay, unit: "R/day" };
  }
  if (line.category === "fixed-capacity" && /generation|generator/i.test(line.description) && variant.ratesExVat.generationCapacityRandPerPodDay !== null) {
    return { rate: variant.ratesExVat.generationCapacityRandPerPodDay, unit: "R/day" };
  }
  if (line.category === "fixed-service" && variant.ratesExVat.serviceAndAdministrationRandPerPodDay !== null) {
    return { rate: variant.ratesExVat.serviceAndAdministrationRandPerPodDay, unit: "R/day" };
  }
  return null;
}

function ruraflexRate(
  line: UtilityBillDocumentAnalysis["chargeLines"][number],
  variant: RuraflexVariant,
  season: BillSeason,
): { rate: number; unit: string } | null {
  if (line.category === "energy" && line.touBucket && season !== "unspecified") {
    const rates = season === "high" ? variant.ratesExVat.highSeasonCentsPerKwh : variant.ratesExVat.lowSeasonCentsPerKwh;
    const key = line.touBucket === "off-peak" ? "offPeak" : line.touBucket;
    return { rate: rates[key] / 100, unit: "R/kWh" };
  }
  if (line.category === "levy-volumetric" && /legacy/i.test(line.description)) {
    return { rate: variant.ratesExVat.legacyCentsPerKwh / 100, unit: "R/kWh" };
  }
  if (line.category === "fixed-capacity" && /network capacity/i.test(line.description)) {
    return { rate: variant.ratesExVat.networkCapacityRandPerKvaMonth, unit: "R/kVA/month" };
  }
  if (line.category === "fixed-capacity" && /generation|generator/i.test(line.description)) {
    return { rate: variant.ratesExVat.generationCapacityRandPerKvaMonth, unit: "R/kVA/month" };
  }
  const shared = catalogue.ruraflex.sharedCharges;
  if (line.category === "ancillary-volumetric") return { rate: shared.ancillaryCentsPerKwh / 100, unit: "R/kWh" };
  if (line.category === "network-volumetric") {
    const rate = variant.voltageCode === 1
      ? shared.networkDemandCentsPerKwhByVoltage.below500V
      : shared.networkDemandCentsPerKwhByVoltage.atLeast500VTo22kV;
    return { rate: rate / 100, unit: "R/kWh" };
  }
  if (line.category === "reactive" && season !== "unspecified") {
    const rate = season === "high" ? shared.reactiveEnergyCentsPerKvarh.highSeason : shared.reactiveEnergyCentsPerKvarh.lowSeason;
    return { rate: rate / 100, unit: "R/kVArh" };
  }
  return null;
}

function compatibleQuantity(line: UtilityBillDocumentAnalysis["chargeLines"][number], rateUnit: string) {
  if (line.quantity === null) return false;
  const unit = normalise(line.unit);
  if (rateUnit === "R/kWh") return unit === "kwh";
  if (rateUnit === "R/kVArh") return unit === "kvarh";
  if (rateUnit === "R/day") return unit === "day" || unit === "days";
  if (rateUnit === "R/kVA/month") return unit === "kva";
  return false;
}

export function currentiseEskomBill(
  analysis: UtilityBillDocumentAnalysis,
  context: EskomTariffContext = {},
): CurrentisedBill {
  const match = matchEskomTariff(analysis, context);
  const blockers = [...match.blockers];
  const warnings: string[] = [];
  const base = {
    catalogueTitle: catalogue.title,
    effectiveFrom: catalogue.effectiveFrom,
    effectiveTo: catalogue.effectiveTo,
    sourceUrl: catalogue.source.url,
    sourceWorkbookSha256: catalogue.source.sha256,
  };

  if (currentRatePeriod(analysis)) {
    return {
      ...base,
      status: "not-required",
      match,
      historicalTotalExVat: analysis.totalChargesExVat,
      currentisedKnownTotalExVat: analysis.totalChargesExVat,
      currentisedAddressableExVat: analysis.chargeSummary.addressableExVat,
      currentisedResidualExVat: analysis.chargeSummary.residualExVat,
      unpricedHistoricalExVat: 0,
      lines: analysis.chargeLines.map((line) => ({
        description: line.description,
        category: line.category,
        quantity: line.quantity,
        quantityUnit: line.unit,
        touBucket: line.touBucket,
        season: analysis.season,
        historicalAmountExVat: line.amountExVat,
        currentRate: line.rate,
        currentRateUnit: line.rateUnit,
        currentAmountExVat: line.amountExVat,
        status: "preserved",
        note: "The billed service period already falls inside the approved 2026/27 schedule.",
      })),
      blockers,
      warnings,
    };
  }

  if (match.status !== "matched" || !match.variant) {
    return {
      ...base,
      status: "blocked",
      match,
      historicalTotalExVat: analysis.totalChargesExVat,
      currentisedKnownTotalExVat: null,
      currentisedAddressableExVat: null,
      currentisedResidualExVat: null,
      unpricedHistoricalExVat: analysis.totalChargesExVat ?? 0,
      lines: [],
      blockers,
      warnings,
    };
  }

  const matchedVariant = match.variant;
  const lines = analysis.chargeLines.map<CurrentisedChargeLine>((line) => {
    let approvedRate: { rate: number; unit: string } | null = null;
    if ("description" in matchedVariant) approvedRate = flatRate(line, matchedVariant as FlatTariff);
    else if (analysis.tariffFamily === "Ruraflex") approvedRate = ruraflexRate(line, matchedVariant as RuraflexVariant, analysis.season);

    if (approvedRate && compatibleQuantity(line, approvedRate.unit)) {
      return {
        description: line.description,
        category: line.category,
        quantity: line.quantity,
        quantityUnit: line.unit,
        touBucket: line.touBucket,
        season: analysis.season,
        historicalAmountExVat: line.amountExVat,
        currentRate: approvedRate.rate,
        currentRateUnit: approvedRate.unit,
        currentAmountExVat: round(line.quantity! * approvedRate.rate),
        status: "currentised",
        note: "Repriced from the approved 2026/27 Eskom tariff rate using the historical billed determinant.",
      };
    }

    const preserve = line.treatment === "excluded";
    return {
      description: line.description,
      category: line.category,
      quantity: line.quantity,
      quantityUnit: line.unit,
      touBucket: line.touBucket,
      season: analysis.season,
      historicalAmountExVat: line.amountExVat,
      currentRate: null,
      currentRateUnit: null,
      currentAmountExVat: preserve ? 0 : null,
      status: preserve ? "preserved" : "unpriced",
      note: preserve
        ? "Excluded account adjustment is not part of the energy baseline."
        : "No safe approved-rate match was possible for this line; it remains outside the currentised total.",
    };
  });

  const priced = lines.filter((line) => line.currentAmountExVat !== null && line.status !== "preserved");
  const unpriced = lines.filter((line) => line.status === "unpriced");
  const currentisedKnownTotalExVat = priced.reduce((sum, line) => sum + line.currentAmountExVat!, 0);
  const addressableCategories = new Set(["energy", "network-volumetric", "ancillary-volumetric", "levy-volumetric"]);
  const currentisedAddressableExVat = priced
    .filter((line) => addressableCategories.has(line.category))
    .reduce((sum, line) => sum + line.currentAmountExVat!, 0);
  const currentisedResidualExVat = priced
    .filter((line) => line.category === "fixed-service" || line.category === "fixed-capacity")
    .reduce((sum, line) => sum + line.currentAmountExVat!, 0);
  const unpricedHistoricalExVat = unpriced.reduce((sum, line) => sum + line.historicalAmountExVat, 0);
  if (unpriced.length > 0) warnings.push(`${unpriced.length} charge line${unpriced.length === 1 ? " is" : "s are"} not included in the currentised total.`);

  return {
    ...base,
    status: unpriced.length === 0 ? "currentised" : "partial",
    match,
    historicalTotalExVat: analysis.totalChargesExVat,
    currentisedKnownTotalExVat: round(currentisedKnownTotalExVat),
    currentisedAddressableExVat: round(currentisedAddressableExVat),
    currentisedResidualExVat: round(currentisedResidualExVat),
    unpricedHistoricalExVat: round(unpricedHistoricalExVat),
    lines,
    blockers,
    warnings,
  };
}

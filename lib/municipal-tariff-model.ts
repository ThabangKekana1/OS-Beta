import municipalTariffs from "@/data/municipal-tariffs-2026-27.json" with { type: "json" };

/**
 * Per-municipality business tariff model, 2026/27. Direct NERSA-published
 * rates for 165 municipalities (all metros, all major secondaries); province
 * medians of the published set for the remainder, confidence-marked. The
 * six-bill audit replaces every assumption with the exact schedule.
 */

type MunicipalEntry = {
  energy_c_kwh: number | null;
  fixed_monthly_r: number | null;
  demand_r_kva: number | null;
  tou: {
    low_season?: { peak?: number; standard?: number; offpeak?: number };
    high_season?: { peak?: number; standard?: number; offpeak?: number };
  } | null;
  source: string | null;
  confidence: string;
};

type MunicipalDataset = { municipalities: Record<string, MunicipalEntry> };

const DATASET = municipalTariffs as unknown as MunicipalDataset;

const TOU_SHARES = { peak: 0.151, standard: 0.415, offpeak: 0.434 } as const;
const HIGH_MONTHS = 3;
const LOW_MONTHS = 9;

export type MunicipalBlendedResult = {
  municipality: string;
  blendedTariff: number;
  estimatedMonthlyKwh: number;
  confidence: string;
  usedTou: boolean;
};

export function municipalBlendedForMunicipality(
  municipality: string | null,
  monthlySpendExVat: number,
): MunicipalBlendedResult | null {
  if (!municipality) return null;
  const entry = DATASET.municipalities[municipality];
  if (!entry) return null;

  let variableCents: number | null = null;
  let usedTou = false;
  const tou = entry.tou;
  if (tou?.low_season?.standard && tou?.high_season?.standard) {
    const low = (tou.low_season.peak ?? tou.low_season.standard) * TOU_SHARES.peak
      + tou.low_season.standard * TOU_SHARES.standard
      + (tou.low_season.offpeak ?? tou.low_season.standard) * TOU_SHARES.offpeak;
    const high = (tou.high_season.peak ?? tou.high_season.standard) * TOU_SHARES.peak
      + tou.high_season.standard * TOU_SHARES.standard
      + (tou.high_season.offpeak ?? tou.high_season.standard) * TOU_SHARES.offpeak;
    variableCents = (high * HIGH_MONTHS + low * LOW_MONTHS) / 12;
    usedTou = true;
  } else if (entry.energy_c_kwh) {
    variableCents = entry.energy_c_kwh;
  }
  if (!variableCents || variableCents <= 0) return null;

  // Demand-metered municipal bills carry the demand + fixed block as a share
  // of spend (audited business bills run 25-35%); businesses size capacity to
  // load, so absolute kVA guesses mislead. Basic-charge-only tariffs use the
  // published fixed charge directly, capped at a third of the bill.
  const fixedMonthly = entry.demand_r_kva && monthlySpendExVat >= 60_000
    ? monthlySpendExVat * 0.30
    : Math.min(entry.fixed_monthly_r ?? 0, monthlySpendExVat * 0.33);

  const variableRate = variableCents / 100;
  const variableSpend = monthlySpendExVat - fixedMonthly;
  if (variableSpend <= 0) return null;
  const estimatedMonthlyKwh = variableSpend / variableRate;
  let blendedTariff = monthlySpendExVat / estimatedMonthlyKwh;
  // Plausibility clamp: a business blend outside R1.80-R6.00/kWh means the
  // schedule shape does not fit this simple solve; fall back to energy-only.
  if (blendedTariff < 1.8 || blendedTariff > 6) {
    const fallbackKwh = monthlySpendExVat / (variableRate * 1.18);
    blendedTariff = monthlySpendExVat / fallbackKwh;
    return {
      municipality,
      blendedTariff: Math.round(blendedTariff * 10000) / 10000,
      estimatedMonthlyKwh: Math.round(fallbackKwh),
      confidence: `${entry.confidence}-shape-fallback`,
      usedTou,
    };
  }
  return {
    municipality,
    blendedTariff: Math.round(blendedTariff * 10000) / 10000,
    estimatedMonthlyKwh: Math.round(estimatedMonthlyKwh),
    confidence: entry.confidence,
    usedTou,
  };
}

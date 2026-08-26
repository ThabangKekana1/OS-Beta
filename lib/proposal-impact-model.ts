import type { ContractingOption } from "@/lib/pricing-engine";

/**
 * Historical national electricity-price series reproduced from the observed
 * Nedbank/Eqstra UFMS proposal template. Values from 2025 onward were template
 * projections, not approved tariffs, and are kept only as contextual evidence.
 */
export type UtilityTariffHistoryRow = {
  year: number;
  utilityTariffRandPerKwh: number;
  cumulativeIncreasePct: number;
  evidence: "historical-template" | "legacy-template-projection";
};

export const UTILITY_TARIFF_HISTORY: readonly UtilityTariffHistoryRow[] = [
  { year: 2007, utilityTariffRandPerKwh: 0.34, cumulativeIncreasePct: 0, evidence: "historical-template" },
  { year: 2008, utilityTariffRandPerKwh: 0.37, cumulativeIncreasePct: 10, evidence: "historical-template" },
  { year: 2009, utilityTariffRandPerKwh: 0.41, cumulativeIncreasePct: 20, evidence: "historical-template" },
  { year: 2010, utilityTariffRandPerKwh: 0.42, cumulativeIncreasePct: 22, evidence: "historical-template" },
  { year: 2011, utilityTariffRandPerKwh: 0.8, cumulativeIncreasePct: 137, evidence: "historical-template" },
  { year: 2012, utilityTariffRandPerKwh: 0.89, cumulativeIncreasePct: 161, evidence: "historical-template" },
  { year: 2013, utilityTariffRandPerKwh: 0.9, cumulativeIncreasePct: 165, evidence: "historical-template" },
  { year: 2014, utilityTariffRandPerKwh: 0.92, cumulativeIncreasePct: 170, evidence: "historical-template" },
  { year: 2015, utilityTariffRandPerKwh: 0.94, cumulativeIncreasePct: 177, evidence: "historical-template" },
  { year: 2016, utilityTariffRandPerKwh: 1.09, cumulativeIncreasePct: 222, evidence: "historical-template" },
  { year: 2017, utilityTariffRandPerKwh: 1.27, cumulativeIncreasePct: 273, evidence: "historical-template" },
  { year: 2018, utilityTariffRandPerKwh: 1.47, cumulativeIncreasePct: 333, evidence: "historical-template" },
  { year: 2019, utilityTariffRandPerKwh: 1.71, cumulativeIncreasePct: 402, evidence: "historical-template" },
  { year: 2020, utilityTariffRandPerKwh: 1.94, cumulativeIncreasePct: 471, evidence: "historical-template" },
  { year: 2021, utilityTariffRandPerKwh: 2.23, cumulativeIncreasePct: 557, evidence: "historical-template" },
  { year: 2022, utilityTariffRandPerKwh: 2.54, cumulativeIncreasePct: 647, evidence: "historical-template" },
  { year: 2023, utilityTariffRandPerKwh: 2.69, cumulativeIncreasePct: 691, evidence: "historical-template" },
  { year: 2024, utilityTariffRandPerKwh: 2.91, cumulativeIncreasePct: 755, evidence: "historical-template" },
  { year: 2025, utilityTariffRandPerKwh: 3.25, cumulativeIncreasePct: 857, evidence: "legacy-template-projection" },
  { year: 2026, utilityTariffRandPerKwh: 3.65, cumulativeIncreasePct: 972, evidence: "legacy-template-projection" },
  { year: 2027, utilityTariffRandPerKwh: 4.08, cumulativeIncreasePct: 1101, evidence: "legacy-template-projection" },
  { year: 2028, utilityTariffRandPerKwh: 4.57, cumulativeIncreasePct: 1245, evidence: "legacy-template-projection" },
  { year: 2029, utilityTariffRandPerKwh: 5.12, cumulativeIncreasePct: 1406, evidence: "legacy-template-projection" },
  { year: 2030, utilityTariffRandPerKwh: 5.74, cumulativeIncreasePct: 1587, evidence: "legacy-template-projection" },
  { year: 2031, utilityTariffRandPerKwh: 6.42, cumulativeIncreasePct: 1789, evidence: "legacy-template-projection" },
  { year: 2032, utilityTariffRandPerKwh: 7.2, cumulativeIncreasePct: 2016, evidence: "legacy-template-projection" },
  { year: 2033, utilityTariffRandPerKwh: 8.06, cumulativeIncreasePct: 2270, evidence: "legacy-template-projection" },
] as const;

export type ProposalCostScheduleRow = {
  year: number;
  utilityCost: number;
  residualGridCost: number;
  solutionCost: number;
};

export type ProposalTariffProjectionRow = {
  year: number;
  utilityEffectiveTariff: number;
  ufmsEffectiveTariff: number;
  assetFinanceInstalmentTariff: number;
  assetFinanceCompleteTariff: number;
};

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function buildProposalTariffProjection(input: {
  startYear: number;
  monthlyKwh: number;
  assetFinanceMonthly: number;
  rows: readonly ProposalCostScheduleRow[];
}): ProposalTariffProjectionRow[] {
  const annualKwh = Math.max(1, input.monthlyKwh * 12);
  return input.rows.map((row, index) => ({
    year: input.startYear + index,
    utilityEffectiveTariff: round(row.utilityCost / annualKwh),
    ufmsEffectiveTariff: round(row.solutionCost / annualKwh),
    assetFinanceInstalmentTariff: round((input.assetFinanceMonthly * 12) / annualKwh),
    assetFinanceCompleteTariff: round(
      (input.assetFinanceMonthly * 12 + row.residualGridCost) / annualKwh,
    ),
  }));
}

export type ProposalCommercialOption = ContractingOption & {
  annualInterestRate: number | null;
  comparisonNote: string;
};

export type EnvironmentalImpactFactor = {
  key: "co2e" | "nox" | "so2" | "particulate" | "water" | "coal" | "ash";
  label: string;
  factor: number;
  factorUnit: "t/GWh" | "ML/GWh";
  reductionUnit: "t/year" | "ML/year";
  evidence: "current-report-basis" | "legacy-partner-planning-factor";
};

/**
 * CO2e uses the current 1-MI report basis (0.94 kgCO2e/kWh = 940 t/GWh).
 * The broader operational factors reproduce the observed partner proposal and
 * remain illustrative until an authoritative current source is attached.
 */
export const ENVIRONMENTAL_IMPACT_FACTORS: readonly EnvironmentalImpactFactor[] = [
  { key: "co2e", label: "CO2e emissions", factor: 940, factorUnit: "t/GWh", reductionUnit: "t/year", evidence: "current-report-basis" },
  { key: "nox", label: "NOx emissions", factor: 4.18, factorUnit: "t/GWh", reductionUnit: "t/year", evidence: "legacy-partner-planning-factor" },
  { key: "so2", label: "SO2 emissions", factor: 7.75, factorUnit: "t/GWh", reductionUnit: "t/year", evidence: "legacy-partner-planning-factor" },
  { key: "particulate", label: "Particulate emissions", factor: 0.33, factorUnit: "t/GWh", reductionUnit: "t/year", evidence: "legacy-partner-planning-factor" },
  { key: "water", label: "Water usage", factor: 1.4, factorUnit: "ML/GWh", reductionUnit: "ML/year", evidence: "legacy-partner-planning-factor" },
  { key: "coal", label: "Coal usage", factor: 530, factorUnit: "t/GWh", reductionUnit: "t/year", evidence: "legacy-partner-planning-factor" },
  { key: "ash", label: "Ash produced", factor: 155, factorUnit: "t/GWh", reductionUnit: "t/year", evidence: "legacy-partner-planning-factor" },
] as const;

export type EnvironmentalImpactRow = EnvironmentalImpactFactor & {
  annualReduction: number;
};

export function buildEnvironmentalImpactRows(
  annualEnergyReductionGwh: number,
): EnvironmentalImpactRow[] {
  return ENVIRONMENTAL_IMPACT_FACTORS.map((factor) => ({
    ...factor,
    annualReduction: round(Math.max(0, annualEnergyReductionGwh) * factor.factor, 3),
  }));
}

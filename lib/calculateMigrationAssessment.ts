import { MIGRATION_DISCLAIMER } from "@/lib/calculation-config";

export type MigrationBusinessType =
  | "Factory"
  | "Warehouse"
  | "Retail"
  | "Agriculture"
  | "Hospitality"
  | "Mining"
  | "School"
  | "Clinic"
  | "Other";

export type SouthAfricanProvince =
  | "Eastern Cape"
  | "Free State"
  | "Gauteng"
  | "KwaZulu-Natal"
  | "Limpopo"
  | "Mpumalanga"
  | "Northern Cape"
  | "North West"
  | "Western Cape";

export type UtilityProvider =
  | "Eskom"
  | "City Power"
  | "Tshwane"
  | "eThekwini"
  | "Cape Town"
  | "Other";

export type MigrationPainPoint =
  | "High electricity cost"
  | "Loadshedding"
  | "Grid instability"
  | "Eskom tariff increases"
  | "Need solar"
  | "Need wheeling"
  | "Need both solar and wheeling";

export type MigrationAssessmentInput = {
  monthlyElectricitySpend: number;
  /** Legacy localStorage/API alias. New public flow uses monthlyElectricitySpend only. */
  monthlySpend?: number;
};

export type UfmsScenarioResult = {
  label: string;
  currentTariff: number;
  solutionTariff: number;
  savingPercentage: number;
  monthlySaving: number;
  annualSaving: number;
  estimatedMonthlySolutionCost: number;
  tenYearSolutionCost: number;
  tenYearSavingAgainstEskom: number;
};

export type WheelingResult = {
  tariff: number;
  monthlyCost: number;
  monthlySaving: number;
  savingPercentage: number;
  annualSaving: number;
  tenYearCost: number;
  tenYearSavingAgainstEskom: number;
};

export type CombinedScenario = {
  label: string;
  ufmsSavingPercentage: number;
  wheelingSavingPercentage: number;
  combinedMonthlyCost: number;
  combinedMonthlySaving: number;
  combinedSavingPercentage: number;
  combinedAnnualSaving: number;
  combinedTenYearCost: number;
  combinedTenYearSavingAgainstEskom: number;
  warning: string;
};

export type MigrationAssessmentResult = {
  input: {
    monthlyElectricitySpend: number;
  };
  currentUtilityProjection: {
    currentMonthlySpend: number;
    currentAnnualSpend: number;
    tenYearSpend: number;
    tenYearFactorUsed: number;
  };
  ufmsSolar: {
    scenarios: UfmsScenarioResult[];
    lowMonthlySaving: number;
    baseMonthlySaving: number;
    highMonthlySaving: number;
    lowSavingPercentage: number;
    baseSavingPercentage: number;
    highSavingPercentage: number;
  };
  wheeling: {
    estimatedMonthlyKilowattHours: number;
    conservative: WheelingResult;
    photovoltaicOnlyReference: WheelingResult;
  };
  combinedScenarios: CombinedScenario[];
  qualificationStatus: string;
  recommendedPathway: string;
  disclaimer: string;
};

function r(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateMigrationAssessment(
  input: MigrationAssessmentInput,
): MigrationAssessmentResult {
  const MONTHS_PER_YEAR = 12;
  const ESKOM_PROPOSAL_STYLE_TEN_YEAR_FACTOR = 15.0057;
  const FOUNDATION_ONE_TEN_YEAR_FACTOR = 13.1808;
  const WHEELING_CURRENT_BENCHMARK_TARIFF = 2.38;
  const GREENSHARE_CONSERVATIVE_WHEELING_TARIFF = 1.85;
  const GREENSHARE_PV_ONLY_REFERENCE_TARIFF = 0.98;
  const monthlyElectricitySpend = Number(
    input.monthlyElectricitySpend ?? input.monthlySpend,
  );

  if (!Number.isFinite(monthlyElectricitySpend) || monthlyElectricitySpend <= 0) {
    throw new Error("Enter a valid monthly electricity spend greater than zero.");
  }

  const currentAnnualSpend = monthlyElectricitySpend * MONTHS_PER_YEAR;
  const currentUtilityTenYearSpend =
    currentAnnualSpend * ESKOM_PROPOSAL_STYLE_TEN_YEAR_FACTOR;

  const ufmsScenarioInputs = [
    { label: "Low UFMS estimate", currentTariff: 2.69, savingPercentage: 0.74 },
    { label: "Base UFMS estimate", currentTariff: 2.46, savingPercentage: 11 },
    { label: "High UFMS estimate", currentTariff: 3.33, savingPercentage: 35 },
  ];

  const ufmsScenarios = ufmsScenarioInputs.map((scenario) => {
    const savingPercentage = scenario.savingPercentage;
    const solutionTariff = scenario.currentTariff * (1 - savingPercentage / 100);
    const monthlySaving = monthlyElectricitySpend * (savingPercentage / 100);
    const annualSaving = monthlySaving * MONTHS_PER_YEAR;
    const estimatedMonthlySolutionCost = monthlyElectricitySpend - monthlySaving;
    const tenYearSolutionCost =
      estimatedMonthlySolutionCost * MONTHS_PER_YEAR * FOUNDATION_ONE_TEN_YEAR_FACTOR;
    const tenYearSavingAgainstEskom = currentUtilityTenYearSpend - tenYearSolutionCost;

    return {
      label: scenario.label,
      currentTariff: scenario.currentTariff,
      solutionTariff: r(solutionTariff),
      savingPercentage: r(savingPercentage),
      monthlySaving: r(monthlySaving),
      annualSaving: r(annualSaving),
      estimatedMonthlySolutionCost: r(estimatedMonthlySolutionCost),
      tenYearSolutionCost: r(tenYearSolutionCost),
      tenYearSavingAgainstEskom: r(tenYearSavingAgainstEskom),
    };
  });

  const estimatedMonthlyKilowattHours =
    monthlyElectricitySpend / WHEELING_CURRENT_BENCHMARK_TARIFF;

  function buildWheelingResult(tariff: number): WheelingResult {
    const monthlyCost = estimatedMonthlyKilowattHours * tariff;
    const monthlySaving = monthlyElectricitySpend - monthlyCost;
    const savingPercentage = (monthlySaving / monthlyElectricitySpend) * 100;
    const annualSaving = monthlySaving * MONTHS_PER_YEAR;
    const tenYearCost = monthlyCost * MONTHS_PER_YEAR * FOUNDATION_ONE_TEN_YEAR_FACTOR;
    const tenYearSavingAgainstEskom = currentUtilityTenYearSpend - tenYearCost;

    return {
      tariff: r(tariff),
      monthlyCost: r(monthlyCost),
      monthlySaving: r(monthlySaving),
      savingPercentage: r(savingPercentage),
      annualSaving: r(annualSaving),
      tenYearCost: r(tenYearCost),
      tenYearSavingAgainstEskom: r(tenYearSavingAgainstEskom),
    };
  }

  const conservative = buildWheelingResult(GREENSHARE_CONSERVATIVE_WHEELING_TARIFF);
  const photovoltaicOnlyReference = buildWheelingResult(GREENSHARE_PV_ONLY_REFERENCE_TARIFF);

  // Both products are independent: UFMS saves X on the full bill, wheeling saves Y on the
  // full bill. Combined saving = X + Y (additive, capped at full spend).
  const combinedScenarioInputs = [
    { ufms: ufmsScenarios[1], wheeling: conservative, label: "Base UFMS + Wheeling" },
    { ufms: ufmsScenarios[2], wheeling: conservative, label: "High UFMS + Wheeling" },
  ];

  const combinedScenarios: CombinedScenario[] = combinedScenarioInputs.map(
    ({ ufms, wheeling: wh, label }) => {
      const combinedMonthlySaving = Math.min(
        ufms.monthlySaving + wh.monthlySaving,
        monthlyElectricitySpend,
      );
      const combinedMonthlyCost = monthlyElectricitySpend - combinedMonthlySaving;
      const combinedSavingPercentage = (combinedMonthlySaving / monthlyElectricitySpend) * 100;
      const combinedAnnualSaving = combinedMonthlySaving * MONTHS_PER_YEAR;
      const combinedTenYearCost =
        combinedMonthlyCost * MONTHS_PER_YEAR * FOUNDATION_ONE_TEN_YEAR_FACTOR;
      const combinedTenYearSavingAgainstEskom = currentUtilityTenYearSpend - combinedTenYearCost;

      return {
        label,
        ufmsSavingPercentage: ufms.savingPercentage,
        wheelingSavingPercentage: wh.savingPercentage,
        combinedMonthlyCost: r(combinedMonthlyCost),
        combinedMonthlySaving: r(combinedMonthlySaving),
        combinedSavingPercentage: r(combinedSavingPercentage),
        combinedAnnualSaving: r(combinedAnnualSaving),
        combinedTenYearCost: r(combinedTenYearCost),
        combinedTenYearSavingAgainstEskom: r(combinedTenYearSavingAgainstEskom),
        warning:
          "Illustrative scenario only. Final combined savings require utility-bill review, site assessment, network assessment, and formal partner proposal.",
      };
    },
  );

  return {
    input: {
      monthlyElectricitySpend: r(monthlyElectricitySpend),
    },
    currentUtilityProjection: {
      currentMonthlySpend: r(monthlyElectricitySpend),
      currentAnnualSpend: r(currentAnnualSpend),
      tenYearSpend: r(currentUtilityTenYearSpend),
      tenYearFactorUsed: ESKOM_PROPOSAL_STYLE_TEN_YEAR_FACTOR,
    },
    ufmsSolar: {
      scenarios: ufmsScenarios,
      lowMonthlySaving: ufmsScenarios[0].monthlySaving,
      baseMonthlySaving: ufmsScenarios[1].monthlySaving,
      highMonthlySaving: ufmsScenarios[2].monthlySaving,
      lowSavingPercentage: ufmsScenarios[0].savingPercentage,
      baseSavingPercentage: ufmsScenarios[1].savingPercentage,
      highSavingPercentage: ufmsScenarios[2].savingPercentage,
    },
    wheeling: {
      estimatedMonthlyKilowattHours: r(estimatedMonthlyKilowattHours),
      conservative,
      photovoltaicOnlyReference,
    },
    combinedScenarios,
    qualificationStatus: "Preliminary estimate generated",
    recommendedPathway: "Upload utility bills and signed Expression of Interest",
    disclaimer: MIGRATION_DISCLAIMER,
  };
}

export const migrationBusinessTypes: MigrationBusinessType[] = [
  "Factory",
  "Warehouse",
  "Retail",
  "Agriculture",
  "Hospitality",
  "Mining",
  "School",
  "Clinic",
  "Other",
];

export const southAfricanProvinces: SouthAfricanProvince[] = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape",
];

export const utilityProviders: UtilityProvider[] = [
  "Eskom",
  "City Power",
  "Tshwane",
  "eThekwini",
  "Cape Town",
  "Other",
];

export const migrationPainPoints: MigrationPainPoint[] = [
  "High electricity cost",
  "Loadshedding",
  "Grid instability",
  "Eskom tariff increases",
  "Need solar",
  "Need wheeling",
  "Need both solar and wheeling",
];

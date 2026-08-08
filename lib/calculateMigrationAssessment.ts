import { CALCULATION_CONFIG, MIGRATION_DISCLAIMER } from "@/lib/calculation-config";
import {
  predictCombined,
  predictFunderQuote,
  predictWheelingQuote,
  runPricingEngine,
  round2,
  tenYearSeries,
  type BillChargeBreakdown,
  type BusinessLoadProfile,
  type CombinedPrediction,
  type EngineResult,
  type FunderQuote,
  type IntervalLoadPoint,
  type TariffStructure,
  type TenYearSeries,
  type WheelingDistributor,
  type WheelingPrediction,
  type WheelingQuote,
} from "@/lib/pricing-engine";

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
  monthlySpend?: number;
  monthlyKwh?: number;
  sizingMonthlyKwh?: number;
  monthlyKwhSource?: "bills" | "assumed";
  blendedTariff?: number;
  minimumPvKwp?: number;
  annualSolarYieldKwhPerKwp?: number;
  solarYieldSource?: "site-pvgis" | "partner-template" | "engineering";
  targetOnsiteEnergyShare?: number;
  businessLoadProfile?: BusinessLoadProfile;
  operatingHoursPerDay?: number;
  tariffStructure?: TariffStructure;
  peakShiftHours?: number;
  requestedBessKwh?: number;
  billBreakdown?: Partial<BillChargeBreakdown>;
  intervalProfile?: IntervalLoadPoint[];
  allowIntervalDemandSavings?: boolean;
  wheelingEligibleShare?: number;
  wheelingLossFactor?: number;
  /** Distributor gate for wheeling predictions ('other-municipal' is ineligible). */
  distributor?: WheelingDistributor;
  /** Energy lines as a share of the total bill; default 0.60. */
  billEnergyShare?: number;
  /** Sum of the bill's commodity-energy lines, R (overrides billEnergyShare). */
  energyMonthlySpend?: number;
  /** Residual grid spend share of the bill under UFMS; funder band [0.03, 0.14]. */
  residualBillShare?: number;
};

/** Predicted funder paper: what Nedbank/Eqstra and Green Share will most
 * likely quote for this load. These are the headline proposal numbers. */
export type FunderPrediction = {
  /** Predicted Nedbank/Eqstra UFMS quote (headline sizing, capex, charge). */
  quote: FunderQuote;
  /** Predicted Green Share wheeling quote with distributor eligibility. */
  wheeling: WheelingPrediction;
  /** Non-additive combined path (UFMS onsite + wheeled residual energy). */
  combined: CombinedPrediction;
  /** Ten-year cumulative cost series in the funder presentation format. */
  tenYearSeries: TenYearSeries;
};

export type UfmsScenarioResult = {
  label: string;
  confidence?: "P10" | "P50" | "P90";
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
  input: { monthlyElectricitySpend: number };
  currentUtilityProjection: {
    currentMonthlySpend: number;
    currentAnnualSpend: number;
    tenYearSpend: number;
    tenYearFactorUsed: number;
    annualTariffEscalationPercentage: number;
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
  proposal: EngineResult;
  /** Additive: predicted funder quotes (UFMS, wheeling, combined, 10-year
   * series). Headline proposal numbers come from funderPrediction.quote. */
  funderPrediction: FunderPrediction;
};

function compoundedAnnualSpendFactor(years: number, annualEscalationRate: number) {
  return Array.from({ length: years }).reduce<number>(
    (factor, _unused, yearIndex) => factor + (1 + annualEscalationRate) ** yearIndex,
    0,
  );
}

function wheelingResult(quote: WheelingQuote): WheelingResult {
  return {
    tariff: round2(quote.firmTariff),
    monthlyCost: quote.monthlyCostAtFirmTariff,
    monthlySaving: quote.monthlySaving,
    savingPercentage: round2(quote.savingPctOfBill * 100),
    annualSaving: quote.annualSaving,
    tenYearCost: quote.tenYearCost,
    tenYearSavingAgainstEskom: quote.tenYearSaving,
  };
}

/**
 * Business migration assessment built only from the canonical energy and
 * charge waterfall in pricing-engine.ts. No savings percentage is hardcoded.
 */
export function calculateMigrationAssessment(
  input: MigrationAssessmentInput,
): MigrationAssessmentResult {
  const monthlyElectricitySpend = Number(
    input.monthlyElectricitySpend ?? input.monthlySpend,
  );
  if (!Number.isFinite(monthlyElectricitySpend) || monthlyElectricitySpend <= 0) {
    throw new Error("Enter a valid monthly electricity spend greater than zero.");
  }

  const utilityEscalation = CALCULATION_CONFIG.eskom_annual_tariff_escalation_percent / 100;
  const engine = runPricingEngine({
    monthlySpend: monthlyElectricitySpend,
    monthlyKwh: input.monthlyKwh,
    sizingMonthlyKwh: input.sizingMonthlyKwh,
    monthlyKwhSource: input.monthlyKwhSource,
    blendedTariff: input.blendedTariff,
    utilityEscalation,
    minimumPvKwp: input.minimumPvKwp,
    annualSolarYieldKwhPerKwp: input.annualSolarYieldKwhPerKwp,
    solarYieldSource: input.solarYieldSource,
    targetOnsiteEnergyShare: input.targetOnsiteEnergyShare,
    businessLoadProfile: input.businessLoadProfile,
    operatingHoursPerDay: input.operatingHoursPerDay,
    tariffStructure: input.tariffStructure,
    peakShiftHours: input.peakShiftHours,
    requestedBessKwh: input.requestedBessKwh,
    billBreakdown: input.billBreakdown,
    intervalProfile: input.intervalProfile,
    allowIntervalDemandSavings: input.allowIntervalDemandSavings,
    wheelingEligibleShare: input.wheelingEligibleShare,
    wheelingLossFactor: input.wheelingLossFactor,
  });

  // Predicted funder paper. The client-facing estimate must match what the
  // funders will most likely produce, so the headline proposal numbers
  // (sizing, capex, monthly charge) come from predictFunderQuote.
  const funderShared = {
    monthlySpend: monthlyElectricitySpend,
    monthlyKwh: engine.input.monthlyKwh,
    tariffStructure: input.tariffStructure,
    billEnergyShare: input.billEnergyShare,
    energyMonthlySpend: input.energyMonthlySpend,
    distributor: input.distributor,
  };
  const funderPrediction: FunderPrediction = {
    quote: predictFunderQuote({
      monthlyKwh: engine.input.monthlyKwh,
      tariffStructure: input.tariffStructure,
    }),
    wheeling: predictWheelingQuote(funderShared),
    combined: predictCombined({ ...funderShared, residualBillShare: input.residualBillShare }),
    tenYearSeries: tenYearSeries({ ...funderShared, residualBillShare: input.residualBillShare }),
  };

  const currentAnnualSpend = monthlyElectricitySpend * 12;
  const tenYearFactor = compoundedAnnualSpendFactor(
    CALCULATION_CONFIG.minimum_term_years,
    utilityEscalation,
  );
  const currentUtilityTenYearSpend = currentAnnualSpend * tenYearFactor;
  const ufmsScenarios: UfmsScenarioResult[] = engine.bands.map((band) => {
    const monthlySolutionCost = monthlyElectricitySpend - band.monthlySaving;
    return {
      label: band.label,
      confidence: band.confidence,
      currentTariff: engine.input.blendedTariff,
      solutionTariff: round2(monthlySolutionCost / engine.input.monthlyKwh),
      savingPercentage: round2(band.yearOneSavingPct * 100),
      monthlySaving: band.monthlySaving,
      annualSaving: round2(band.monthlySaving * 12),
      estimatedMonthlySolutionCost: round2(monthlySolutionCost),
      tenYearSolutionCost: band.tenYearSolutionCost,
      tenYearSavingAgainstEskom: band.tenYearSaving,
    };
  });
  const combined = engine.lumenCombined;
  const combinedScenarios: CombinedScenario[] = [
    {
      label: combined.eligible
        ? "Combined onsite + residual wheeling"
        : "Combined waterfall planning view",
      ufmsSavingPercentage: round2(combined.ufmsSavingPct * 100),
      wheelingSavingPercentage: round2(combined.wheelingSavingPct * 100),
      combinedMonthlyCost: combined.monthlyCost,
      combinedMonthlySaving: combined.monthlySaving,
      combinedSavingPercentage: round2(combined.combinedSavingPct * 100),
      combinedAnnualSaving: combined.annualSaving,
      combinedTenYearCost: combined.tenYearCost,
      combinedTenYearSavingAgainstEskom: combined.tenYearSaving,
      warning: combined.note,
    },
  ];
  const qualificationStatus =
    engine.qualification.band === "below-minimum"
      ? "Below programme minimum"
      : engine.qualification.band === "unlikely"
        ? "Model completed — current configuration is not economically supported"
        : engine.input.evidenceLevel === "interval-validated"
          ? "Interval-validated migration case"
          : engine.input.evidenceLevel === "bill-audited"
            ? "Bill-audited pre-engineering case"
            : "Indicative prequalification generated";

  return {
    input: { monthlyElectricitySpend: round2(monthlyElectricitySpend) },
    currentUtilityProjection: {
      currentMonthlySpend: round2(monthlyElectricitySpend),
      currentAnnualSpend: round2(currentAnnualSpend),
      tenYearSpend: round2(currentUtilityTenYearSpend),
      tenYearFactorUsed: round2(tenYearFactor),
      annualTariffEscalationPercentage:
        CALCULATION_CONFIG.eskom_annual_tariff_escalation_percent,
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
      estimatedMonthlyKilowattHours: engine.input.monthlyKwh,
      conservative: wheelingResult(engine.wheeling),
      photovoltaicOnlyReference: wheelingResult(engine.wheelingPvOnly),
    },
    combinedScenarios,
    qualificationStatus,
    recommendedPathway:
      engine.input.evidenceLevel === "interval-validated"
        ? "Engineering review and formal partner pricing"
        : "Upload utility bills and interval data where available",
    disclaimer: MIGRATION_DISCLAIMER,
    proposal: engine,
    funderPrediction,
  };
}

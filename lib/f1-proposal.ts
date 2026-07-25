import {
  calculateMigrationAssessment,
  type MigrationAssessmentResult,
} from "@/lib/calculateMigrationAssessment";
import { buildMandateSigningToken } from "@/lib/client-registration";
import { countDocumentsByType } from "@/lib/document-taxonomy";
import {
  buildEnvironmentalImpactRows,
  buildProposalTariffProjection,
  UTILITY_TARIFF_HISTORY,
  type EnvironmentalImpactRow,
  type ProposalCommercialOption,
  type ProposalTariffProjectionRow,
  type UtilityTariffHistoryRow,
} from "@/lib/proposal-impact-model";
import {
  buildPreEngineeringSolarYield,
  provinceSolarYieldAssumption,
} from "@/lib/solar-yield-assumptions";
import {
  ENGINE_CONSTANTS,
  type BillChargeBreakdown,
  type BusinessLoadProfile,
  type ChargeWaterfall,
  type CommercialSizeFit,
  type EnergyDispatch,
  type TariffStructure,
  type UfmsQuote,
} from "@/lib/pricing-engine";
import type { BillPortfolio } from "@/lib/utility-bill-analysis";

/**
 * Foundation-1 Migration Proposal — the structured, client-facing document
 * generated from the verified pricing engine. Pure builders only: the API
 * routes handle auth/persistence, this module handles the numbers so the
 * proposal content is unit-testable without any network.
 */

export type F1ProposalLeadInput = {
  businessName: string;
  contactName?: string | null;
  clientProfileId?: string | null;
  siteCity?: string | null;
  province?: string | null;
  utilityProvider?: string | null;
  monthlySpend: number;
  /** Monthly kWh fallback when no audited bill portfolio is available. */
  monthlyKwh?: number | null;
  /** Commercial product floor. Migration-case v2 uses the smallest system
   * evidenced by the observed partner rate card (35 kWp). */
  minimumPvKwp?: number;
  businessLoadProfile?: BusinessLoadProfile;
  operatingHoursPerDay?: number;
  intervalProfile?: Array<{
    loadKwh: number;
    durationHours?: number;
    solarCapacityFactor?: number;
    energyRateMultiplier?: number;
  }>;
  allowIntervalDemandSavings?: boolean;
  wheelingEligibleShare?: number;
  wheelingLossFactor?: number;
  generatedAt?: string;
  /** Audited six-period portfolio. Formal proposal generation must use this
   * instead of registration estimates whenever available. */
  billPortfolio?: BillPortfolio | null;
};

export type F1ProposalBand = {
  label: string;
  blendedTariff: number;
  yearOneSavingPct: number;
  monthlySaving: number;
  pvKwp: number;
  pcsKw: number;
  bessKwh: number;
  ufmsMonthly: number;
};

export type F1Proposal = {
  documentTitle: string;
  businessName: string;
  contactName: string | null;
  clientProfileId: string | null;
  generatedAt: string;
  site: {
    city: string | null;
    province: string | null;
    registeredUtilityProvider: string | null;
  };
  profile: {
    monthlySpend: number;
    estimatedMonthlyKwh: number;
    blendedTariff: number;
    tariffSource: "bills" | "assumed";
  };
  commercialFit: CommercialSizeFit;
  calculationBasis: BillPortfolio["designBasis"];
  qualification: {
    status: string;
    band: string;
    qualifies: boolean;
    recommendedPathway: string;
    reasons: string[];
  };
  ufmsOption: {
    sizing: { pvKwp: number; pcsKw: number; bessKwh: number };
    monthlyCharge: number;
    solutionTariff: number;
    monthlySaving: number;
    yearOneSavingPct: number;
    tenYearSaving: number;
    evidenceLevel: "spend-only" | "bill-audited" | "interval-validated";
    dispatch: EnergyDispatch;
    chargeWaterfall: ChargeWaterfall;
    /** Honest low/base/high bands when the tariff is assumed (spend-only). */
    bands: F1ProposalBand[];
  };
  commercial: {
    capitalCostInclVat: {
      total: number;
      generation: number;
      powerCubeBess: number;
      engineering: number;
      softCosts: number;
    };
    assetFinanceAnnualRate: number;
    structures: ProposalCommercialOption[];
  };
  wheelingOption: {
    available: boolean;
    firmTariff: number;
    monthlyCost: number;
    monthlySaving: number;
    savingPctOfBill: number;
    annualSaving: number;
    wheeledMonthlyKwh: number;
    note: string;
  };
  lumenCombined: {
    combinedSavingPct: number;
    monthlySaving: number;
    monthlyCost: number;
    annualSaving: number;
    tenYearSaving: number;
    onsiteLoadShare: number;
    residualGridKwh: number;
    wheeledResidualKwh: number;
    eskomResidualKwh: number;
    ufmsMonthlyCharge: number;
    wheelingMonthlyCharge: number;
    retainedGridMonthly: number;
    note: string;
  } | null;
  tenYearComparison: {
    currentUtilityCost: number;
    ufmsSolutionCost: number;
    ufmsSaving: number;
  };
  billAudit: {
    sourceDocumentCount: number;
    uniquePeriodCount: number;
    coveredDays: number;
    periodStart: string | null;
    periodEnd: string | null;
    provider: string;
    tariffNames: string[];
    tariffFamilies: string[];
    confidence: string;
    actualReadShare: number;
    averageMonthlySpendExVat: number;
    averageMonthlySpendInclVat: number | null;
    averageMonthlyKwh: number;
    blendedTariffExVat: number;
    addressableMonthlyExVat: number;
    residualMonthlyExVat: number;
    conditionalMonthlyExVat: number;
    unknownMonthlyExVat: number;
    warnings: string[];
    currentTariff: BillPortfolio["currentTariff"];
  } | null;
  billAwareEconomics: {
    comparisonBasis: "ex-vat";
    methodology: string;
    utilityEscalationSchedule: number[];
    ufmsEscalation: number;
    yearOne: {
      currentUtilityCost: number;
      ufmsCharge: number;
      residualGridCost: number;
      solutionCost: number;
      saving: number;
      savingPercentage: number;
    };
    tenYear: {
      rows: Array<{
        year: number;
        utilityCost: number;
        ufmsCharge: number;
        residualGridCost: number;
        solutionCost: number;
        annualSaving: number;
        cumulativeSaving: number;
      }>;
      currentUtilityCost: number;
      solutionCost: number;
      saving: number;
    };
    limitations: string[];
  } | null;
  energyAndEsg: {
    annualGridConsumptionKwh: number | null;
    annualScope2EmissionsTonnes: number | null;
    gridEmissionFactorKgPerKwh: number;
    maximumAddressableAnnualEmissionsTonnes: number | null;
    energyDataQualityScore: number;
    energyEsgReadinessScore: number;
    scoreLabel: string;
    scoreScope: string;
    annualPlanningEnergyReductionGwh: number | null;
    impactRows: EnvironmentalImpactRow[];
  } | null;
  tariffComparison: {
    startYear: number;
    annualKwhAssumed: number;
    projectionRows: ProposalTariffProjectionRow[];
    historicalContext: readonly UtilityTariffHistoryRow[];
    historicalContextNote: string;
  } | null;
  solarYield: ReturnType<typeof buildPreEngineeringSolarYield>;
  explainer: string[];
  disclaimer: string;
};

/**
 * One entry per report year. The year-one 8.76% entry describes the approved
 * 2026/27 increase already embedded in the currentised monthly baseline; it is
 * not compounded a second time. Year two therefore applies the approved
 * 2027/28 increase (8.83%), followed by the disclosed 6% planning assumption.
 * These are scenario inputs, not a promise of future tariffs.
 */
export const FORMAL_UTILITY_ESCALATION_SCHEDULE = [
  0.0876,
  0.0883,
  0.06,
  0.06,
  0.06,
  0.06,
  0.06,
  0.06,
  0.06,
  0.06,
] as const;

export type TenYearCostScheduleInput = {
  monthlyUtilityCost: number;
  monthlyUfmsCharge: number;
  monthlyResidualGridCost: number;
  utilityEscalationSchedule: ReadonlyArray<number>;
  ufmsEscalation?: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildTenYearCostSchedule(input: TenYearCostScheduleInput) {
  let utilityAnnual = input.monthlyUtilityCost * 12;
  let ufmsAnnual = input.monthlyUfmsCharge * 12;
  let residualAnnual = input.monthlyResidualGridCost * 12;
  let cumulativeSaving = 0;
  const ufmsEscalation = input.ufmsEscalation ?? 0.06;
  const rows = input.utilityEscalationSchedule.map((escalation, index) => {
    // Row one is the supplied baseline. Each later row uses the escalation
    // attached to that report year, so formal year two applies schedule[1].
    if (index > 0) {
      utilityAnnual *= 1 + escalation;
      residualAnnual *= 1 + escalation;
      ufmsAnnual *= 1 + ufmsEscalation;
    }
    const solutionCost = ufmsAnnual + residualAnnual;
    const annualSaving = utilityAnnual - solutionCost;
    cumulativeSaving += annualSaving;
    return {
      year: index + 1,
      utilityCost: Math.round(utilityAnnual),
      ufmsCharge: Math.round(ufmsAnnual),
      residualGridCost: Math.round(residualAnnual),
      solutionCost: Math.round(solutionCost),
      annualSaving: Math.round(annualSaving),
      cumulativeSaving: Math.round(cumulativeSaving),
    };
  });
  const currentUtilityCost = rows.reduce((sum, row) => sum + row.utilityCost, 0);
  const solutionCost = rows.reduce((sum, row) => sum + row.solutionCost, 0);
  return {
    rows,
    currentUtilityCost,
    solutionCost,
    saving: currentUtilityCost - solutionCost,
  };
}

const ADDRESSABLE_CATEGORIES = new Set([
  "energy",
  "network-volumetric",
  "ancillary-volumetric",
  "levy-volumetric",
]);

function tariffStructureForPortfolio(portfolio: BillPortfolio | null): TariffStructure {
  if (!portfolio) return "unknown";
  return portfolio.tariffFamilies.some((family) =>
    family === "Ruraflex"
    || family === "Nightsave Rural"
    || family === "Megaflex"
    || family === "Miniflex")
    ? "time-of-use"
    : portfolio.tariffFamilies.some((family) => family !== "Unknown")
      ? "flat"
      : "unknown";
}

function billChargeBreakdown(
  portfolio: BillPortfolio | null,
  baselineMonthlySpend: number,
): BillChargeBreakdown | undefined {
  const basis = portfolio?.designBasis;
  if (!portfolio || !basis) return undefined;
  const period = portfolio.periods.find((candidate) => candidate.sourceHash === basis.sourceHash);
  if (!period) return undefined;
  const normalisation = basis.normalisationFactor;
  const historicalAddressable = period.chargeLines
    .filter((line) => ADDRESSABLE_CATEGORIES.has(line.category))
    .reduce((total, line) => total + line.amountExVat, 0) * normalisation;
  const approvedAddressable = basis.approvedCurrent
    && (basis.approvedCurrent.status === "currentised" || basis.approvedCurrent.status === "not-required")
    ? basis.approvedCurrent.monthlyEquivalentAddressableExVat
    : null;
  const addressableScale = approvedAddressable !== null && historicalAddressable > 0
    ? approvedAddressable / historicalAddressable
    : 1;
  const categoryAmount = (categories: string[], scale = 1) => period.chargeLines
    .filter((line) => line.treatment !== "excluded" && categories.includes(line.category))
    .reduce((total, line) => total + line.amountExVat, 0) * normalisation * scale;
  const energy = categoryAmount(["energy"], addressableScale);
  const networkVolumetric = categoryAmount(
    ["network-volumetric", "ancillary-volumetric", "levy-volumetric"],
    addressableScale,
  );
  const fixed = categoryAmount(["fixed-service", "fixed-capacity"]);
  const demand = categoryAmount(["demand"]);
  const reactive = categoryAmount(["reactive"]);
  const classified = energy + networkVolumetric + fixed + demand + reactive;
  const other = Math.max(0, baselineMonthlySpend - classified);
  return {
    energy: roundMoney(energy),
    networkVolumetric: roundMoney(networkVolumetric),
    fixed: roundMoney(fixed),
    demand: roundMoney(demand),
    reactive: roundMoney(reactive),
    other: roundMoney(other),
    source: "bill-lines",
  };
}

function buildBillAwareEconomics(portfolio: BillPortfolio, ufms: UfmsQuote) {
  const designBasis = portfolio.designBasis;
  if (!designBasis) return null;
  const approvedCurrent = designBasis.approvedCurrent;
  const useApprovedCurrent = approvedCurrent
    && (approvedCurrent.status === "currentised" || approvedCurrent.status === "not-required")
    && approvedCurrent.monthlyEquivalentSpendExVat !== null
    && approvedCurrent.monthlyEquivalentAddressableExVat !== null;
  const baselineMonthlySpend = useApprovedCurrent
    ? approvedCurrent.monthlyEquivalentSpendExVat
    : designBasis.historical.monthlyEquivalentSpendExVat;
  const baselineAddressableMonthly = useApprovedCurrent
    ? approvedCurrent.monthlyEquivalentAddressableExVat
    : designBasis.historical.monthlyEquivalentAddressableExVat;
  if (
    baselineMonthlySpend === null
    || baselineAddressableMonthly === null
  ) {
    return null;
  }
  const residualGridMonthly = ufms.residualGridMonthly;
  const tenYear = buildTenYearCostSchedule({
    monthlyUtilityCost: baselineMonthlySpend,
    monthlyUfmsCharge: ufms.ufmsMonthly,
    monthlyResidualGridCost: residualGridMonthly,
    utilityEscalationSchedule: FORMAL_UTILITY_ESCALATION_SCHEDULE,
  });
  const yearOneSolution = roundMoney(ufms.ufmsMonthly + residualGridMonthly);
  const yearOneSaving = roundMoney(baselineMonthlySpend - yearOneSolution);
  return {
    comparisonBasis: "ex-vat" as const,
    methodology:
      "Highest-bill design path: the selected period is normalised and currentised, then passed through the P50 load-to-solar-to-battery dispatch model. Energy and volumetric network charges reduce only with modelled grid-import displacement. Fixed, capacity, reactive, and unsupported demand charges remain.",
    utilityEscalationSchedule: [...FORMAL_UTILITY_ESCALATION_SCHEDULE],
    ufmsEscalation: 0.06,
    yearOne: {
      currentUtilityCost: baselineMonthlySpend,
      ufmsCharge: ufms.ufmsMonthly,
      residualGridCost: residualGridMonthly,
      solutionCost: yearOneSolution,
      saving: yearOneSaving,
      savingPercentage: yearOneSaving / baselineMonthlySpend,
    },
    tenYear,
    limitations: [
      `This is a ${ufms.evidenceLevel} P50 pre-engineering case, not an engineering guarantee.`,
      "Export revenue is zero unless a signed export tariff is supplied.",
      "Demand, capacity, and reactive savings are zero unless interval data and an approved dispatch study support them.",
      "Year 1 is the already-current 2026/27 baseline, so its approved 8.76% increase is embedded and not compounded twice. Year 2 applies the approved 2027/28 8.83% increase; later years use a disclosed 6% planning assumption.",
      useApprovedCurrent
        ? "The selected historical bill determinants were repriced at the approved 2026/27 Eskom direct-customer schedule; historical bill spend and the six-period average remain in the audit section."
        : "Approved-rate currentisation was incomplete, so historical billed spend remains the baseline.",
    ],
  };
}

/** A Foundation-1 proposal requires at least one utility bill on file. */
export function hasRequiredUtilityBills(
  documents: Array<{ title: string }>,
): boolean {
  return (countDocumentsByType(documents).utility_bills ?? 0) >= 1;
}

export function buildF1Proposal(
  input: F1ProposalLeadInput,
  precomputed?: MigrationAssessmentResult,
): F1Proposal {
  const portfolio = input.billPortfolio ?? null;
  const designBasis = portfolio?.designBasis ?? null;
  const approvedDesignSpend = designBasis?.approvedCurrent
    && (designBasis.approvedCurrent.status === "currentised" || designBasis.approvedCurrent.status === "not-required")
    ? designBasis.approvedCurrent.monthlyEquivalentSpendExVat
    : null;
  const monthlySpend = approvedDesignSpend
    ?? designBasis?.historical.monthlyEquivalentSpendExVat
    ?? input.monthlySpend;
  const monthlyKwh = designBasis?.historical.monthlyEquivalentKwh ?? input.monthlyKwh;
  const siteSolarAssumption = provinceSolarYieldAssumption(input.province);
  const chargeBreakdown = billChargeBreakdown(portfolio, monthlySpend);
  const assessmentInput = {
      monthlyElectricitySpend: monthlySpend,
      monthlyKwh: monthlyKwh ?? undefined,
      sizingMonthlyKwh: portfolio?.averageMonthlyKwh ?? monthlyKwh ?? undefined,
      monthlyKwhSource: portfolio ? "bills" as const : input.monthlyKwh ? "assumed" as const : undefined,
      minimumPvKwp: input.minimumPvKwp ?? ENGINE_CONSTANTS.verifiedCommercialMinimumPvKwp,
      annualSolarYieldKwhPerKwp: siteSolarAssumption?.annualKwhPerKwp,
      solarYieldSource: siteSolarAssumption ? "site-pvgis" as const : undefined,
      businessLoadProfile: input.businessLoadProfile,
      operatingHoursPerDay: input.operatingHoursPerDay,
      tariffStructure: tariffStructureForPortfolio(portfolio),
      billBreakdown: chargeBreakdown,
      intervalProfile: input.intervalProfile,
      allowIntervalDemandSavings: input.allowIntervalDemandSavings,
      wheelingEligibleShare: input.wheelingEligibleShare,
      wheelingLossFactor: input.wheelingLossFactor,
    };
  // A bill portfolio changes the charge and tariff model, so a precomputed
  // spend-only result must never override the formal bill-audited calculation.
  const result = portfolio
    ? calculateMigrationAssessment(assessmentInput)
    : precomputed ?? calculateMigrationAssessment(assessmentInput);
  const engine = result.proposal;
  const billAwareEconomics = portfolio
    ? buildBillAwareEconomics(portfolio, engine.ufms)
    : null;
  const annualAddressableKwh = portfolio?.averageMonthlyKwh
    && portfolio.averageMonthlySpendExVat
    && portfolio.addressableMonthlyExVat !== null
      ? portfolio.averageMonthlyKwh * 12
        * Math.min(1, portfolio.addressableMonthlyExVat / portfolio.averageMonthlySpendExVat)
      : null;
  const solarYield = buildPreEngineeringSolarYield({
    province: input.province,
    siteCity: input.siteCity,
    pvKwp: engine.ufms.sizing.pvKwp,
  });
  const explainer = designBasis && portfolio
    ? [
        designBasis.explanation,
        `The six-period audit average is R${Math.round(portfolio.averageMonthlySpendExVat ?? 0).toLocaleString("en-ZA")} and ${Math.round(portfolio.averageMonthlyKwh ?? 0).toLocaleString("en-ZA")} kWh per month. It remains the representative consumption and ESG baseline; it does not replace the selected high-load design period.`,
        solarYield
          ? `System sizing: the preliminary commercial archetype is ${engine.ufms.sizing.pvKwp} kWp PV, ${engine.ufms.sizing.pcsKw} kW PCS and ${engine.ufms.sizing.bessKwh} kWh storage. The separate PVGIS pre-engineering resource model gives approximately ${Math.round(solarYield.averageMonthlyGenerationKwh).toLocaleString("en-ZA")} kWh/month at the provincial reference; actual-coordinate engineering replaces this planning yield.`
          : `System sizing: the preliminary commercial archetype is ${engine.ufms.sizing.pvKwp} kWp PV, ${engine.ufms.sizing.pcsKw} kW PCS and ${engine.ufms.sizing.bessKwh} kWh storage. No site-resource generation yield is stated until a location reference is available; actual-coordinate engineering supplies the final yield.`,
        engine.commercialFit.message,
        engine.explainer[2],
        engine.explainer[3],
        billAwareEconomics
          ? `The total year-one solution path combines the UFMS charge with R${Math.round(billAwareEconomics.yearOne.residualGridCost).toLocaleString("en-ZA")} per month of retained grid charges. Fixed, capacity, demand, reactive, and unclassified items are not silently treated as savings.`
          : "The utility remains connected as backup, so fixed and non-addressable grid charges remain.",
        billAwareEconomics
          ? `The year-one percentage compares the complete solution cost with the complete approved-current design-month baseline. The ten-year comparison escalates the UFMS charge at 6% and uses the disclosed utility assumptions shown in the schedule.`
          : engine.explainer[5],
        "The report is bill-audited, not engineering-final. Site coordinates, roof geometry, shading, interval load, battery dispatch, and network approvals can change the final design and price.",
      ].filter((line): line is string => Boolean(line))
    : engine.explainer;
  const assetFinanceAnnualRate = 0.1475;
  const commercialStructures: ProposalCommercialOption[] = engine.ufms.options.map((option) => ({
    ...option,
    annualInterestRate: option.label === "Asset Finance" ? assetFinanceAnnualRate : null,
    comparisonNote: option.label === "Eden"
      ? "Zero-capex service structure; maintenance, insurance and monitoring are included for the term."
      : option.label === "Asset Finance"
        ? "Indicative credit-finance instalment on the same turnkey capital value. Residual grid charges, maintenance and insurance remain separate. Subject to credit approval and final bank pricing."
        : "Indicative outright turnkey purchase value, including VAT; payment terms and final engineering remain subject to the formal offer.",
  }));
  const assetFinanceMonthly = engine.ufms.assetFinanceMonthly;
  const tariffComparison = billAwareEconomics
    ? {
        startYear: 2026,
        annualKwhAssumed: engine.input.monthlyKwh * 12,
        projectionRows: buildProposalTariffProjection({
          startYear: 2026,
          monthlyKwh: engine.input.monthlyKwh,
          assetFinanceMonthly,
          rows: billAwareEconomics.tenYear.rows,
        }),
        historicalContext: UTILITY_TARIFF_HISTORY,
        historicalContextNote:
          "The 2007-2024 blue series reproduces the national context table in the observed Nedbank/Eqstra template. Its 2025-2033 blue values were legacy template projections, not this client's tariff forecast. The client-specific lines use the audited design basis and the disclosed current report assumptions.",
      }
    : null;
  const annualPlanningEnergyReductionGwh = engine.ufms.dispatch
    ? engine.ufms.dispatch.onsiteToLoadKwh * 12 / 1_000_000
    : solarYield
      ? solarYield.annualGenerationKwh / 1_000_000
    : annualAddressableKwh === null
      ? null
      : annualAddressableKwh / 1_000_000;

  return {
    documentTitle: "Foundation-1 Bill-Audited Pre-Engineering Report",
    businessName: input.businessName,
    contactName: input.contactName?.trim() || null,
    clientProfileId: input.clientProfileId ?? null,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    site: {
      city: input.siteCity?.trim() || null,
      province: input.province?.trim() || null,
      registeredUtilityProvider: input.utilityProvider?.trim() || null,
    },
    profile: {
      monthlySpend: engine.input.monthlySpend,
      estimatedMonthlyKwh: engine.input.monthlyKwh,
      blendedTariff: engine.input.blendedTariff,
      tariffSource: engine.input.tariffSource,
    },
    commercialFit: engine.commercialFit,
    calculationBasis: designBasis,
    qualification: {
      status: result.qualificationStatus,
      band: engine.qualification.band,
      qualifies: engine.qualification.qualifies,
      recommendedPathway: portfolio
        ? "Engineering validation and formal partner offer"
        : result.recommendedPathway,
      reasons: engine.qualification.reasons,
    },
    ufmsOption: {
      sizing: {
        pvKwp: engine.ufms.sizing.pvKwp,
        pcsKw: engine.ufms.sizing.pcsKw,
        bessKwh: engine.ufms.sizing.bessKwh,
      },
      monthlyCharge: engine.ufms.ufmsMonthly,
      solutionTariff: engine.ufms.solutionTariff,
      monthlySaving: engine.ufms.monthlySaving,
      yearOneSavingPct: engine.ufms.yearOneSavingPct,
      tenYearSaving: engine.ufms.tenYearSaving,
      evidenceLevel: engine.ufms.evidenceLevel,
      dispatch: engine.ufms.dispatch,
      chargeWaterfall: engine.ufms.chargeWaterfall,
      bands: engine.bands.map((band) => ({
        label: band.label,
        blendedTariff: band.blendedTariff,
        yearOneSavingPct: band.yearOneSavingPct,
        monthlySaving: band.monthlySaving,
        pvKwp: band.pvKwp,
        pcsKw: band.pcsKw,
        bessKwh: band.bessKwh,
        ufmsMonthly: band.ufmsMonthly,
      })),
    },
    commercial: {
      capitalCostInclVat: {
        total: engine.ufms.capex.total,
        generation: engine.ufms.capex.generation,
        powerCubeBess: engine.ufms.capex.powerCubeBess,
        engineering: engine.ufms.capex.engineering,
        softCosts: engine.ufms.capex.softCosts,
      },
      assetFinanceAnnualRate,
      structures: commercialStructures,
    },
    wheelingOption: {
      available: engine.wheeling.available,
      firmTariff: engine.wheeling.firmTariff,
      monthlyCost: engine.wheeling.monthlyCostAtFirmTariff,
      monthlySaving: engine.wheeling.monthlySaving,
      savingPctOfBill: engine.wheeling.savingPctOfBill,
      annualSaving: engine.wheeling.annualSaving,
      wheeledMonthlyKwh: engine.wheeling.wheeledMonthlyKwh,
      note: engine.wheeling.note,
    },
    lumenCombined: engine.lumenCombined.eligible
      ? {
          combinedSavingPct: engine.lumenCombined.combinedSavingPct,
          monthlySaving: engine.lumenCombined.monthlySaving,
          monthlyCost: engine.lumenCombined.monthlyCost,
          annualSaving: engine.lumenCombined.annualSaving,
          tenYearSaving: engine.lumenCombined.tenYearSaving,
          onsiteLoadShare: engine.lumenCombined.onsiteLoadShare,
          residualGridKwh: engine.lumenCombined.residualGridKwh,
          wheeledResidualKwh: engine.lumenCombined.wheeledResidualKwh,
          eskomResidualKwh: engine.lumenCombined.eskomResidualKwh,
          ufmsMonthlyCharge: engine.lumenCombined.ufmsMonthlyCharge,
          wheelingMonthlyCharge: engine.lumenCombined.wheelingMonthlyCharge,
          retainedGridMonthly: engine.lumenCombined.retainedGridMonthly,
          note: engine.lumenCombined.note,
        }
      : null,
    tenYearComparison: {
      currentUtilityCost:
        billAwareEconomics?.tenYear.currentUtilityCost ?? engine.ufms.tenYearClientCostCurrent,
      ufmsSolutionCost:
        billAwareEconomics?.tenYear.solutionCost ?? engine.ufms.tenYearClientCostSolution,
      ufmsSaving: billAwareEconomics?.tenYear.saving ?? engine.ufms.tenYearSaving,
    },
    billAudit: portfolio?.averageMonthlySpendExVat && portfolio.averageMonthlyKwh && portfolio.blendedTariffExVat
      ? {
          sourceDocumentCount: portfolio.sourceDocumentCount,
          uniquePeriodCount: portfolio.uniquePeriodCount,
          coveredDays: portfolio.coveredDays,
          periodStart: portfolio.periodStart,
          periodEnd: portfolio.periodEnd,
          provider: portfolio.provider,
          tariffNames: portfolio.tariffNames,
          tariffFamilies: portfolio.tariffFamilies,
          confidence: portfolio.confidence,
          actualReadShare: portfolio.actualReadShare,
          averageMonthlySpendExVat: portfolio.averageMonthlySpendExVat,
          averageMonthlySpendInclVat: portfolio.averageMonthlySpendInclVat,
          averageMonthlyKwh: portfolio.averageMonthlyKwh,
          blendedTariffExVat: portfolio.blendedTariffExVat,
          addressableMonthlyExVat: portfolio.addressableMonthlyExVat ?? 0,
          residualMonthlyExVat: portfolio.residualMonthlyExVat ?? 0,
          conditionalMonthlyExVat: portfolio.conditionalMonthlyExVat ?? 0,
          unknownMonthlyExVat: portfolio.unknownMonthlyExVat ?? 0,
          warnings: portfolio.warnings,
          currentTariff: portfolio.currentTariff,
        }
      : null,
    billAwareEconomics,
    energyAndEsg: portfolio
      ? {
          annualGridConsumptionKwh: portfolio.esg.annualGridConsumptionKwh,
          annualScope2EmissionsTonnes: portfolio.esg.annualScope2EmissionsTonnes,
          gridEmissionFactorKgPerKwh: portfolio.esg.gridEmissionFactorKgPerKwh,
          maximumAddressableAnnualEmissionsTonnes: annualAddressableKwh === null
            ? null
            : annualAddressableKwh * portfolio.esg.gridEmissionFactorKgPerKwh / 1_000,
          energyDataQualityScore: portfolio.esg.energyDataQualityScore,
          energyEsgReadinessScore: portfolio.esg.energyEsgReadinessScore,
          scoreLabel: portfolio.esg.scoreLabel,
          scoreScope: portfolio.esg.scoreScope,
          annualPlanningEnergyReductionGwh,
          impactRows: annualPlanningEnergyReductionGwh === null
            ? []
            : buildEnvironmentalImpactRows(annualPlanningEnergyReductionGwh),
        }
      : null,
    tariffComparison,
    solarYield,
    explainer,
    disclaimer: portfolio
      ? "This bill-audited report uses the supplied utility statements and approved-current tariff matching where shown. It remains a pre-engineering assessment: final pricing, yield, dispatch, savings and contract terms require site engineering and a formal partner offer."
      : result.disclaimer,
  };
}

export type ProposalAcceptancePayload = {
  proposalAcceptedAt?: string | null;
  mandateSigningToken?: string | null;
};

export type ProposalAcceptanceState = {
  alreadyAccepted: boolean;
  proposalAcceptedAt: string;
  mandateSigningToken: string;
};

/**
 * Idempotency guard for proposal acceptance: re-accepting returns the
 * original timestamp and mandate token unchanged, so no duplicate stamps,
 * notifications, or writes are produced.
 */
export function resolveProposalAcceptance(
  payload: ProposalAcceptancePayload,
  businessName: string,
  now: string = new Date().toISOString(),
): ProposalAcceptanceState {
  const existingAcceptedAt =
    typeof payload.proposalAcceptedAt === "string" && payload.proposalAcceptedAt.trim()
      ? payload.proposalAcceptedAt
      : null;
  const existingToken =
    typeof payload.mandateSigningToken === "string" && payload.mandateSigningToken.trim()
      ? payload.mandateSigningToken
      : null;

  return {
    alreadyAccepted: Boolean(existingAcceptedAt),
    proposalAcceptedAt: existingAcceptedAt ?? now,
    mandateSigningToken: existingToken ?? buildMandateSigningToken(businessName),
  };
}

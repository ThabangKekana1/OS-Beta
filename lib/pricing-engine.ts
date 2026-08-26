/**
 * FOUNDATION-1 BUSINESS MIGRATION ENGINE
 *
 * Pure, deterministic proposal maths shared with the public website. The
 * model separates load, onsite generation, storage, residual grid imports and
 * wheeling so the same kWh can never be claimed twice.
 */

export const ENGINE_CONSTANTS = {
  ufmsMonthlyRateFactor: 0.015969,
  termMonths: 120,
  ufmsEscalation: 0.06,
  assetFinanceRate: 0.1475,
  utilityEscalation: 0.125,
  partnerAnnualYieldKwhPerKwp: 173.375 * 12,
  kwhPerKwpPerMonth: 173.375,
  storageIncrementalRandPerKwhInclVat: 3_755,
  batteryRoundTripEfficiency: 0.9,
  batteryUsableDepth: 0.85,
  defaultTargetOnsiteEnergyShare: 0.9,
  defaultTouPeakShiftHours: 6,
  minMonthlySpend: 10_000,
  strongTariff: 2.8,
  marginalTariff: 2.6,
  wheelingFirmTariff: 1.85,
  wheelingPvOnlyTariff: 0.98,
  wheelingEscalation: 0.07,
  wheelingEnergyShareOfBill: 0.6,
  defaultBlendedTariff: 2.75,
  verifiedCommercialMinimumPvKwp: 35,
  abortFee: 75_000,
  lumenMinMonthlySpend: 50_000,
  lumenGuaranteeActive: true,
  // Kept as commercial metadata only. These percentages are never used to
  // manufacture savings; the energy and charge waterfall determines savings.
  lumenUfmsSavingPct: 0.3,
  lumenWheelingSavingPct: 0.3,
} as const;

const CAPEX_POINTS: ReadonlyArray<readonly [number, number]> = [
  [35, 27_290],
  [75, 27_804],
  [300, 20_554],
];

export const CAPEX_STACK = {
  generation: 0.23,
  powerCubeBess: 0.33,
  engineering: 0.14,
  softCosts: 0.3,
} as const;

const STANDARD_SIZES = [25, 35, 50, 75, 100, 150, 200, 250, 300, 400, 500] as const;
const DAYS_PER_MONTH = 365.2425 / 12;

export type BusinessLoadProfile = "daytime" | "extended-day" | "continuous" | "unknown";
export type TariffStructure = "flat" | "time-of-use" | "unknown";
export type ProposalEvidenceLevel = "spend-only" | "bill-audited" | "interval-validated";

export type BillChargeBreakdown = {
  energy: number;
  networkVolumetric: number;
  fixed: number;
  demand: number;
  reactive: number;
  other: number;
  source?: "bill-lines" | "assumed";
};

export type IntervalLoadPoint = {
  loadKwh: number;
  durationHours?: number;
  solarCapacityFactor?: number;
  energyRateMultiplier?: number;
};

export type EngineInput = {
  monthlySpend: number;
  monthlyKwh?: number;
  /** Representative monthly consumption used for equipment sizing. The
   * dispatch month may be higher so the report can expose seasonal residuals. */
  sizingMonthlyKwh?: number;
  monthlyKwhSource?: "bills" | "assumed";
  blendedTariff?: number;
  utilityEscalation?: number;
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
};

export type SystemSizing = {
  panelCount: number;
  actualPvKwp: number;
  pvKwp: number;
  pcsKw: number;
  bessKwh: number;
  baselineBessKwh: number;
  estimatedMonthlyGenerationKwh: number;
  annualSolarYieldKwhPerKwp: number;
  solarYieldSource: "site-pvgis" | "partner-template" | "engineering";
  targetOnsiteEnergyShare: number;
  batterySizingReason: string;
};

export type CapexBreakdown = {
  total: number;
  generation: number;
  powerCubeBess: number;
  engineering: number;
  softCosts: number;
  randPerKwp: number;
  basePackageTotal: number;
  incrementalStorageCost: number;
};

export type EnergyDispatch = {
  source: "synthetic-business-profile" | "actual-interval-profile";
  monthlyLoadKwh: number;
  solarGenerationKwh: number;
  directSolarToLoadKwh: number;
  batteryToLoadKwh: number;
  onsiteToLoadKwh: number;
  residualGridKwh: number;
  exportedOrCurtailedKwh: number;
  batteryLossKwh: number;
  onsiteCoveragePct: number;
  solarSelfConsumptionPct: number;
  gridImportShare: number;
  energyCostShareAfterUfms: number;
  baselinePeakKw: number;
  postUfmsPeakKw: number;
  modelledPeakReductionPct: number;
  creditedDemandReductionPct: number;
};

export type ChargeWaterfall = {
  baseline: BillChargeBreakdown & { total: number };
  avoidedByOnsite: BillChargeBreakdown & { total: number };
  retainedAfterUfms: BillChargeBreakdown & { total: number };
};

export type ContractingOption = {
  label: "Eden" | "Asset Finance" | "Capital Purchase";
  monthlyCharge: number | null;
  escalation: number | null;
  termMonths: number | null;
  upfront: number | null;
  ownership: string;
  tenYearTotal: number;
};

export type UfmsQuote = {
  sizing: SystemSizing;
  capex: CapexBreakdown;
  dispatch: EnergyDispatch;
  chargeWaterfall: ChargeWaterfall;
  evidenceLevel: ProposalEvidenceLevel;
  ufmsMonthly: number;
  assetFinanceMonthly: number;
  solutionTariff: number;
  residualGridMonthly: number;
  yearOneSavingPct: number;
  monthlySaving: number;
  tenYearClientCostCurrent: number;
  tenYearClientCostSolution: number;
  tenYearSaving: number;
  options: ContractingOption[];
};

export type WheelingQuote = {
  available: boolean;
  note: string;
  energyShareOfBill: number;
  displaceableMonthlySpend: number;
  estimatedMonthlyKwh: number;
  wheeledMonthlyKwh: number;
  firmTariff: number;
  wheeledEnergyCost: number;
  retainedNonEnergyMonthly: number;
  retainedUtilityMonthly: number;
  monthlyCostAtFirmTariff: number;
  monthlySaving: number;
  savingPctOfBill: number;
  annualSaving: number;
  tenYearCost: number;
  tenYearSaving: number;
};

export type LumenCombinedQuote = {
  eligible: boolean;
  guaranteeActive: boolean;
  ufmsSavingPct: number;
  wheelingSavingPct: number;
  combinedSavingPct: number;
  onsiteLoadShare: number;
  residualGridKwh: number;
  wheeledResidualKwh: number;
  eskomResidualKwh: number;
  ufmsMonthlyCharge: number;
  wheelingMonthlyCharge: number;
  retainedGridMonthly: number;
  monthlySaving: number;
  monthlyCost: number;
  annualSaving: number;
  tenYearCost: number;
  tenYearSaving: number;
  note: string;
};

export type QualificationVerdict = {
  qualifies: boolean;
  band: "strong" | "marginal" | "unlikely" | "below-minimum";
  blendedTariffUsed: number;
  tariffSource: "bills" | "assumed";
  reasons: string[];
};

export type CommercialSizeFit = {
  status: "below-commercial-minimum" | "within-commercial-range" | "above-standard-maximum";
  requiredPvKwp: number;
  minimumCommercialPvKwp: number;
  maximumStandardPvKwp: number;
  selectedPvKwp: number;
  monthlyConsumptionKwh: number;
  selectedMonthlyGenerationKwh: number;
  generationGapKwh: number;
  generationCoveragePct: number;
  sizeVarianceKwp: number;
  sizeVariancePct: number;
  belowCommercialMinimum: boolean;
  aboveStandardMaximum: boolean;
  message: string;
};

export type EngineScenarioBand = {
  label: string;
  confidence: "P10" | "P50" | "P90";
  blendedTariff: number;
  yearOneSavingPct: number;
  monthlySaving: number;
  pvKwp: number;
  pcsKw: number;
  bessKwh: number;
  ufmsMonthly: number;
  residualGridMonthly: number;
  completeMonthlySolutionCost: number;
  residualGridKwh: number;
  onsiteCoveragePct: number;
  tenYearSolutionCost: number;
  tenYearSaving: number;
};

export type EngineResult = {
  input: Required<Pick<EngineInput, "monthlySpend">> & {
    monthlyKwh: number;
    sizingMonthlyKwh: number;
    blendedTariff: number;
    tariffSource: "bills" | "assumed";
    utilityEscalation: number;
    evidenceLevel: ProposalEvidenceLevel;
    businessLoadProfile: BusinessLoadProfile;
    tariffStructure: TariffStructure;
    annualSolarYieldKwhPerKwp: number;
    solarYieldSource: "site-pvgis" | "partner-template" | "engineering";
    billBreakdown: BillChargeBreakdown;
  };
  commercialFit: CommercialSizeFit;
  qualification: QualificationVerdict;
  ufms: UfmsQuote;
  wheeling: WheelingQuote;
  wheelingPvOnly: WheelingQuote;
  lumenCombined: LumenCombinedQuote;
  bands: EngineScenarioBand[];
  explainer: string[];
};

type ResolvedInput = {
  monthlySpend: number;
  monthlyKwh: number;
  sizingMonthlyKwh: number;
  blendedTariff: number;
  tariffSource: "bills" | "assumed";
  utilityEscalation: number;
  minimumPvKwp: number;
  annualSolarYieldKwhPerKwp: number;
  solarYieldSource: "site-pvgis" | "partner-template" | "engineering";
  targetOnsiteEnergyShare: number;
  businessLoadProfile: BusinessLoadProfile;
  tariffStructure: TariffStructure;
  peakShiftHours: number;
  requestedBessKwh: number | null;
  billBreakdown: BillChargeBreakdown;
  intervalProfile: IntervalLoadPoint[] | null;
  allowIntervalDemandSavings: boolean;
  wheelingEligibleShare: number;
  wheelingLossFactor: number;
  evidenceLevel: ProposalEvidenceLevel;
};

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function sum(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function roundToIncrement(value: number, increment: number) {
  return Math.max(increment, Math.round(value / increment) * increment);
}

export function pmt(annualRate: number, nMonths: number, presentValue: number) {
  const i = annualRate / 12;
  return (presentValue * i) / (1 - (1 + i) ** -nMonths);
}

/** Observed partner asset-finance tables use payments at the start of month. */
export function pmtDue(annualRate: number, nMonths: number, presentValue: number) {
  const i = annualRate / 12;
  return pmt(annualRate, nMonths, presentValue) / (1 + i);
}

export function escalatingTotal(yearOneAnnual: number, escalation: number, years: number) {
  let total = 0;
  for (let year = 0; year < years; year += 1) {
    total += yearOneAnnual * (1 + escalation) ** year;
  }
  return total;
}

export function capexPerKwp(kwp: number): number {
  if (kwp <= CAPEX_POINTS[0][0]) return CAPEX_POINTS[0][1];
  if (kwp >= CAPEX_POINTS[CAPEX_POINTS.length - 1][0]) {
    return CAPEX_POINTS[CAPEX_POINTS.length - 1][1];
  }
  for (let index = 0; index < CAPEX_POINTS.length - 1; index += 1) {
    const [x1, y1] = CAPEX_POINTS[index];
    const [x2, y2] = CAPEX_POINTS[index + 1];
    if (kwp >= x1 && kwp <= x2) {
      return y1 + ((y2 - y1) * (kwp - x1)) / (x2 - x1);
    }
  }
  return CAPEX_POINTS[CAPEX_POINTS.length - 1][1];
}

function snapSystemSize(rawKwp: number, minimumPvKwp: number) {
  const eligible = STANDARD_SIZES.filter((size) => size >= minimumPvKwp);
  const available = eligible.length > 0 ? eligible : [STANDARD_SIZES[STANDARD_SIZES.length - 1]];
  let selected: number = available[0];
  let distance = Number.POSITIVE_INFINITY;
  for (const size of available) {
    const nextDistance = Math.abs(size - rawKwp);
    if (nextDistance < distance) {
      distance = nextDistance;
      selected = size;
    }
  }
  return selected;
}

export type SystemSizingAssumptions = {
  annualSolarYieldKwhPerKwp?: number;
  solarYieldSource?: "site-pvgis" | "partner-template" | "engineering";
  targetOnsiteEnergyShare?: number;
  tariffStructure?: TariffStructure;
  peakShiftHours?: number;
  requestedBessKwh?: number | null;
};

export function sizeSystem(
  monthlyKwh: number,
  minimumPvKwp: number = STANDARD_SIZES[0],
  assumptions: SystemSizingAssumptions = {},
): SystemSizing {
  const C = ENGINE_CONSTANTS;
  const hasSiteYield = finitePositive(assumptions.annualSolarYieldKwhPerKwp);
  const annualSolarYieldKwhPerKwp = hasSiteYield
    ? Number(assumptions.annualSolarYieldKwhPerKwp)
    : C.partnerAnnualYieldKwhPerKwp;
  const targetOnsiteEnergyShare = clamp(
    assumptions.targetOnsiteEnergyShare ?? (hasSiteYield ? C.defaultTargetOnsiteEnergyShare : 1),
    0.5,
    1,
  );
  const rawKwp = (monthlyKwh * 12 * targetOnsiteEnergyShare) / annualSolarYieldKwhPerKwp;
  const pvKwp = snapSystemSize(rawKwp, minimumPvKwp);
  const pcsKw = Math.max(50, Math.ceil(pvKwp / 50) * 50);
  const baselineBessKwh = Math.max(50, Math.ceil(pvKwp / 50) * 50);
  const dischargeEfficiency = Math.sqrt(C.batteryRoundTripEfficiency);
  const averageLoadKw = monthlyKwh / (DAYS_PER_MONTH * 24);
  const touBessKwh = assumptions.tariffStructure === "time-of-use"
    ? roundToIncrement(
        (averageLoadKw * (assumptions.peakShiftHours ?? C.defaultTouPeakShiftHours)) /
          (C.batteryUsableDepth * dischargeEfficiency),
        50,
      )
    : baselineBessKwh;
  const requestedBessKwh = finitePositive(assumptions.requestedBessKwh)
    ? roundToIncrement(assumptions.requestedBessKwh, 50)
    : 0;
  const bessKwh = Math.max(baselineBessKwh, touBessKwh, requestedBessKwh);
  const panelCount = Math.max(1, Math.round(pvKwp / 0.62));
  const batterySizingReason = bessKwh > baselineBessKwh
    ? `Storage increased from the ${baselineBessKwh} kWh base package to ${bessKwh} kWh to cover the modelled time-of-use peak-shift window.`
    : `Storage uses the ${baselineBessKwh} kWh commercial base package; interval engineering may increase it.`;
  return {
    panelCount,
    actualPvKwp: round2(panelCount * 0.62),
    pvKwp,
    pcsKw,
    bessKwh,
    baselineBessKwh,
    estimatedMonthlyGenerationKwh: round2((pvKwp * annualSolarYieldKwhPerKwp) / 12),
    annualSolarYieldKwhPerKwp: round2(annualSolarYieldKwhPerKwp),
    solarYieldSource: assumptions.solarYieldSource ?? (hasSiteYield ? "site-pvgis" : "partner-template"),
    targetOnsiteEnergyShare,
    batterySizingReason,
  };
}

export function buildCapex(sizing: SystemSizing, adjustmentFactor = 1): CapexBreakdown {
  const basePackageTotal = sizing.pvKwp * capexPerKwp(sizing.pvKwp);
  const additionalStorageKwh = Math.max(0, sizing.bessKwh - sizing.baselineBessKwh);
  const incrementalStorageCost =
    additionalStorageKwh * ENGINE_CONSTANTS.storageIncrementalRandPerKwhInclVat;
  const adjustedBase = basePackageTotal * adjustmentFactor;
  const adjustedStorage = incrementalStorageCost * adjustmentFactor;
  const total = adjustedBase + adjustedStorage;
  return {
    total: Math.round(total),
    generation: Math.round(adjustedBase * CAPEX_STACK.generation),
    powerCubeBess: Math.round(adjustedBase * CAPEX_STACK.powerCubeBess + adjustedStorage),
    engineering: Math.round(adjustedBase * CAPEX_STACK.engineering),
    softCosts: Math.round(adjustedBase * CAPEX_STACK.softCosts),
    randPerKwp: Math.round(total / sizing.pvKwp),
    basePackageTotal: Math.round(adjustedBase),
    incrementalStorageCost: Math.round(adjustedStorage),
  };
}

function inferLoadProfile(profile: BusinessLoadProfile | undefined, operatingHours: number | undefined) {
  if (profile) return profile;
  if (!finitePositive(operatingHours)) return "unknown" as const;
  if (operatingHours >= 20) return "continuous" as const;
  if (operatingHours >= 11) return "extended-day" as const;
  return "daytime" as const;
}

function tariffMultiplier(hour: number, tariffStructure: TariffStructure) {
  if (tariffStructure !== "time-of-use") return 1;
  if ((hour >= 7 && hour < 10) || (hour >= 18 && hour < 20)) return 1.7;
  if (hour < 6 || hour >= 22) return 0.65;
  return 1;
}

function loadWeight(hour: number, profile: BusinessLoadProfile) {
  if (profile === "continuous") {
    if ((hour >= 7 && hour < 10) || (hour >= 18 && hour < 20)) return 1.25;
    return hour >= 6 && hour < 22 ? 1.05 : 0.82;
  }
  if (profile === "extended-day") {
    if ((hour >= 7 && hour < 10) || (hour >= 18 && hour < 20)) return 1.4;
    return hour >= 6 && hour < 22 ? 1.15 : 0.22;
  }
  if (profile === "daytime") {
    return hour >= 7 && hour < 18 ? 1.45 : hour >= 18 && hour < 21 ? 0.35 : 0.08;
  }
  return hour >= 6 && hour < 22 ? 1.12 : 0.58;
}

function solarWeight(hour: number) {
  if (hour < 5.5 || hour >= 18.5) return 0;
  const position = (hour - 5.5) / 13;
  return Math.sin(Math.PI * position) ** 1.5;
}

type DispatchPoint = {
  loadKwh: number;
  solarKwh: number;
  durationHours: number;
  energyRateMultiplier: number;
};

type DispatchMetrics = {
  direct: number;
  batteryOutput: number;
  grid: number;
  export: number;
  chargeInput: number;
  baselineEnergyIndex: number;
  gridEnergyIndex: number;
  baselinePeakKw: number;
  postPeakKw: number;
};

function emptyDispatchMetrics(): DispatchMetrics {
  return {
    direct: 0,
    batteryOutput: 0,
    grid: 0,
    export: 0,
    chargeInput: 0,
    baselineEnergyIndex: 0,
    gridEnergyIndex: 0,
    baselinePeakKw: 0,
    postPeakKw: 0,
  };
}

function runDispatchSequence(
  points: readonly DispatchPoint[],
  initialSoc: number,
  sizing: SystemSizing,
  tariffStructure: TariffStructure,
) {
  const C = ENGINE_CONSTANTS;
  const chargeEfficiency = Math.sqrt(C.batteryRoundTripEfficiency);
  const dischargeEfficiency = chargeEfficiency;
  const usableCapacity = sizing.bessKwh * C.batteryUsableDepth;
  const batteryPowerKw = Math.min(sizing.pcsKw, sizing.bessKwh);
  let soc = clamp(initialSoc, 0, usableCapacity);
  const metrics = emptyDispatchMetrics();
  for (const point of points) {
    const direct = Math.min(point.loadKwh, point.solarKwh);
    let loadRemaining = Math.max(0, point.loadKwh - direct);
    const excessSolar = Math.max(0, point.solarKwh - direct);
    const chargeInput = Math.min(
      excessSolar,
      batteryPowerKw * point.durationHours,
      (usableCapacity - soc) / chargeEfficiency,
    );
    soc += chargeInput * chargeEfficiency;
    const shouldDischarge = tariffStructure !== "time-of-use" || point.energyRateMultiplier >= 1.2;
    const batteryOutput = shouldDischarge
      ? Math.min(loadRemaining, batteryPowerKw * point.durationHours, soc * dischargeEfficiency)
      : 0;
    soc -= batteryOutput / dischargeEfficiency;
    loadRemaining -= batteryOutput;
    const grid = Math.max(0, loadRemaining);
    metrics.direct += direct;
    metrics.batteryOutput += batteryOutput;
    metrics.grid += grid;
    metrics.export += Math.max(0, excessSolar - chargeInput);
    metrics.chargeInput += chargeInput;
    metrics.baselineEnergyIndex += point.loadKwh * point.energyRateMultiplier;
    metrics.gridEnergyIndex += grid * point.energyRateMultiplier;
    metrics.baselinePeakKw = Math.max(metrics.baselinePeakKw, point.loadKwh / point.durationHours);
    metrics.postPeakKw = Math.max(metrics.postPeakKw, grid / point.durationHours);
  }
  return { soc, metrics };
}

function scaleDispatchMetrics(metrics: DispatchMetrics, factor: number) {
  return {
    ...metrics,
    direct: metrics.direct * factor,
    batteryOutput: metrics.batteryOutput * factor,
    grid: metrics.grid * factor,
    export: metrics.export * factor,
    chargeInput: metrics.chargeInput * factor,
    baselineEnergyIndex: metrics.baselineEnergyIndex * factor,
    gridEnergyIndex: metrics.gridEnergyIndex * factor,
  };
}

export function simulateEnergyDispatch(input: {
  monthlyKwh: number;
  sizing: SystemSizing;
  businessLoadProfile: BusinessLoadProfile;
  tariffStructure: TariffStructure;
  intervalProfile?: IntervalLoadPoint[] | null;
  generationFactor?: number;
  allowIntervalDemandSavings?: boolean;
}): EnergyDispatch {
  const monthlyGeneration =
    input.sizing.estimatedMonthlyGenerationKwh * (input.generationFactor ?? 1);
  let metrics: DispatchMetrics;
  let source: EnergyDispatch["source"];
  if (input.intervalProfile && input.intervalProfile.length >= 24) {
    source = "actual-interval-profile";
    const loadTotal = sum(input.intervalProfile.map((point) => Math.max(0, point.loadKwh)));
    const loadScale = input.monthlyKwh / Math.max(loadTotal, 1);
    const solarWeights = input.intervalProfile.map((point, index) => {
      if (finitePositive(point.solarCapacityFactor) || point.solarCapacityFactor === 0) {
        return Math.max(0, point.solarCapacityFactor);
      }
      const duration = finitePositive(point.durationHours) ? point.durationHours : 0.5;
      const hour = ((index * duration) % 24) + duration / 2;
      return solarWeight(hour);
    });
    const solarTotal = sum(solarWeights);
    const points = input.intervalProfile.map((point, index): DispatchPoint => {
      const durationHours = finitePositive(point.durationHours) ? point.durationHours : 0.5;
      const hour = ((index * durationHours) % 24) + durationHours / 2;
      return {
        loadKwh: Math.max(0, point.loadKwh) * loadScale,
        solarKwh: solarTotal > 0 ? (solarWeights[index] / solarTotal) * monthlyGeneration : 0,
        durationHours,
        energyRateMultiplier: finitePositive(point.energyRateMultiplier)
          ? point.energyRateMultiplier
          : tariffMultiplier(hour, input.tariffStructure),
      };
    });
    const usableCapacity = input.sizing.bessKwh * ENGINE_CONSTANTS.batteryUsableDepth;
    const warmup = runDispatchSequence(points, usableCapacity / 2, input.sizing, input.tariffStructure);
    metrics = runDispatchSequence(points, warmup.soc, input.sizing, input.tariffStructure).metrics;
  } else {
    source = "synthetic-business-profile";
    const rawLoadWeights = Array.from({ length: 48 }, (_, index) =>
      loadWeight(index / 2 + 0.25, input.businessLoadProfile));
    const rawSolarWeights = Array.from({ length: 48 }, (_, index) => solarWeight(index / 2 + 0.25));
    const totalLoadWeight = sum(rawLoadWeights);
    const totalSolarWeight = sum(rawSolarWeights);
    const dailyLoad = input.monthlyKwh / DAYS_PER_MONTH;
    const dailySolar = monthlyGeneration / DAYS_PER_MONTH;
    const points = rawLoadWeights.map((weight, index): DispatchPoint => {
      const hour = index / 2 + 0.25;
      return {
        loadKwh: (weight / totalLoadWeight) * dailyLoad,
        solarKwh: (rawSolarWeights[index] / totalSolarWeight) * dailySolar,
        durationHours: 0.5,
        energyRateMultiplier: tariffMultiplier(hour, input.tariffStructure),
      };
    });
    const usableCapacity = input.sizing.bessKwh * ENGINE_CONSTANTS.batteryUsableDepth;
    let soc = usableCapacity / 2;
    for (let day = 0; day < 14; day += 1) {
      soc = runDispatchSequence(points, soc, input.sizing, input.tariffStructure).soc;
    }
    metrics = scaleDispatchMetrics(
      runDispatchSequence(points, soc, input.sizing, input.tariffStructure).metrics,
      DAYS_PER_MONTH,
    );
  }
  const onsiteToLoad = metrics.direct + metrics.batteryOutput;
  const modelledPeakReductionPct = metrics.baselinePeakKw > 0
    ? clamp(1 - metrics.postPeakKw / metrics.baselinePeakKw, 0, 1) * 100
    : 0;
  const creditedDemandReductionPct =
    source === "actual-interval-profile" && input.allowIntervalDemandSavings
      ? modelledPeakReductionPct
      : 0;
  const batteryLossKwh = Math.max(0, metrics.chargeInput - metrics.batteryOutput);
  return {
    source,
    monthlyLoadKwh: round2(input.monthlyKwh),
    solarGenerationKwh: round2(monthlyGeneration),
    directSolarToLoadKwh: round2(metrics.direct),
    batteryToLoadKwh: round2(metrics.batteryOutput),
    onsiteToLoadKwh: round2(onsiteToLoad),
    residualGridKwh: round2(metrics.grid),
    exportedOrCurtailedKwh: round2(metrics.export),
    batteryLossKwh: round2(batteryLossKwh),
    onsiteCoveragePct: round2((onsiteToLoad / Math.max(input.monthlyKwh, 1)) * 100),
    solarSelfConsumptionPct: round2(
      ((metrics.direct + metrics.chargeInput) / Math.max(monthlyGeneration, 1)) * 100,
    ),
    gridImportShare: round2(metrics.grid / Math.max(input.monthlyKwh, 1)),
    energyCostShareAfterUfms: round2(
      metrics.gridEnergyIndex / Math.max(metrics.baselineEnergyIndex, 1),
    ),
    baselinePeakKw: round2(metrics.baselinePeakKw),
    postUfmsPeakKw: round2(metrics.postPeakKw),
    modelledPeakReductionPct: round2(modelledPeakReductionPct),
    creditedDemandReductionPct: round2(creditedDemandReductionPct),
  };
}

function normalizeBreakdown(monthlySpend: number, supplied?: Partial<BillChargeBreakdown>) {
  const source = supplied?.source === "bill-lines" ? "bill-lines" : "assumed";
  const initial: BillChargeBreakdown = supplied
    ? {
        energy: Math.max(0, Number(supplied.energy) || 0),
        networkVolumetric: Math.max(0, Number(supplied.networkVolumetric) || 0),
        fixed: Math.max(0, Number(supplied.fixed) || 0),
        demand: Math.max(0, Number(supplied.demand) || 0),
        reactive: Math.max(0, Number(supplied.reactive) || 0),
        other: Math.max(0, Number(supplied.other) || 0),
        source,
      }
    : {
        energy: monthlySpend * 0.6,
        networkVolumetric: monthlySpend * 0.2,
        fixed: monthlySpend * 0.14,
        demand: monthlySpend * 0.03,
        reactive: monthlySpend * 0.01,
        other: monthlySpend * 0.02,
        source,
      };
  const values = [
    initial.energy,
    initial.networkVolumetric,
    initial.fixed,
    initial.demand,
    initial.reactive,
    initial.other,
  ];
  const total = sum(values);
  if (total <= monthlySpend) {
    initial.other += monthlySpend - total;
  } else if (total > 0) {
    const scale = monthlySpend / total;
    initial.energy *= scale;
    initial.networkVolumetric *= scale;
    initial.fixed *= scale;
    initial.demand *= scale;
    initial.reactive *= scale;
    initial.other *= scale;
  }
  return {
    energy: round2(initial.energy),
    networkVolumetric: round2(initial.networkVolumetric),
    fixed: round2(initial.fixed),
    demand: round2(initial.demand),
    reactive: round2(initial.reactive),
    other: round2(initial.other),
    source,
  } satisfies BillChargeBreakdown;
}

function breakdownTotal(breakdown: BillChargeBreakdown) {
  return sum([
    breakdown.energy,
    breakdown.networkVolumetric,
    breakdown.fixed,
    breakdown.demand,
    breakdown.reactive,
    breakdown.other,
  ]);
}

function withTotal(breakdown: BillChargeBreakdown) {
  return { ...breakdown, total: round2(breakdownTotal(breakdown)) };
}

function resolveInput(input: EngineInput): ResolvedInput {
  const monthlySpend = Number(input.monthlySpend);
  if (!Number.isFinite(monthlySpend) || monthlySpend <= 0) {
    throw new Error("Enter a valid monthly electricity spend greater than zero.");
  }
  let monthlyKwh: number;
  let tariffSource: "bills" | "assumed";
  if (finitePositive(input.monthlyKwh)) {
    monthlyKwh = input.monthlyKwh;
    tariffSource = input.monthlyKwhSource ?? "bills";
  } else if (finitePositive(input.blendedTariff)) {
    monthlyKwh = monthlySpend / input.blendedTariff;
    tariffSource = "assumed";
  } else {
    monthlyKwh = monthlySpend / ENGINE_CONSTANTS.defaultBlendedTariff;
    tariffSource = "assumed";
  }
  const blendedTariff = monthlySpend / monthlyKwh;
  const intervalProfile = input.intervalProfile && input.intervalProfile.length >= 24
    ? input.intervalProfile
    : null;
  const evidenceLevel: ProposalEvidenceLevel = intervalProfile
    ? "interval-validated"
    : tariffSource === "bills"
      ? "bill-audited"
      : "spend-only";
  const hasSiteYield = finitePositive(input.annualSolarYieldKwhPerKwp);
  return {
    monthlySpend,
    monthlyKwh,
    sizingMonthlyKwh: finitePositive(input.sizingMonthlyKwh)
      ? input.sizingMonthlyKwh
      : monthlyKwh,
    blendedTariff,
    tariffSource,
    utilityEscalation: input.utilityEscalation ?? ENGINE_CONSTANTS.utilityEscalation,
    minimumPvKwp: finitePositive(input.minimumPvKwp) ? input.minimumPvKwp : STANDARD_SIZES[0],
    annualSolarYieldKwhPerKwp: hasSiteYield
      ? Number(input.annualSolarYieldKwhPerKwp)
      : ENGINE_CONSTANTS.partnerAnnualYieldKwhPerKwp,
    solarYieldSource: input.solarYieldSource ?? (hasSiteYield ? "site-pvgis" : "partner-template"),
    targetOnsiteEnergyShare: clamp(
      input.targetOnsiteEnergyShare ?? (hasSiteYield
        ? ENGINE_CONSTANTS.defaultTargetOnsiteEnergyShare
        : 1),
      0.5,
      1,
    ),
    businessLoadProfile: inferLoadProfile(input.businessLoadProfile, input.operatingHoursPerDay),
    tariffStructure: input.tariffStructure ?? "unknown",
    peakShiftHours: input.peakShiftHours ?? ENGINE_CONSTANTS.defaultTouPeakShiftHours,
    requestedBessKwh: finitePositive(input.requestedBessKwh) ? input.requestedBessKwh : null,
    billBreakdown: normalizeBreakdown(monthlySpend, input.billBreakdown),
    intervalProfile,
    allowIntervalDemandSavings: Boolean(input.allowIntervalDemandSavings),
    wheelingEligibleShare: clamp(input.wheelingEligibleShare ?? 1, 0, 1),
    wheelingLossFactor: clamp(input.wheelingLossFactor ?? 0, 0, 0.25),
    evidenceLevel,
  };
}

function buildCommercialSizeFit(
  resolved: ResolvedInput,
  sizing: SystemSizing,
): CommercialSizeFit {
  const requiredPvKwp =
    (resolved.sizingMonthlyKwh * 12 * resolved.targetOnsiteEnergyShare) /
    resolved.annualSolarYieldKwhPerKwp;
  const minimumCommercialPvKwp = STANDARD_SIZES.find((size) => size >= resolved.minimumPvKwp)
    ?? STANDARD_SIZES[STANDARD_SIZES.length - 1];
  const maximumStandardPvKwp = STANDARD_SIZES[STANDARD_SIZES.length - 1];
  const belowCommercialMinimum = requiredPvKwp < minimumCommercialPvKwp;
  const aboveStandardMaximum = requiredPvKwp > maximumStandardPvKwp;
  const sizeVarianceKwp = sizing.pvKwp - requiredPvKwp;
  const sizeVariancePct = (sizeVarianceKwp / Math.max(requiredPvKwp, 1)) * 100;
  const generationGapKwh = sizing.estimatedMonthlyGenerationKwh - resolved.monthlyKwh;
  const generationCoveragePct =
    (sizing.estimatedMonthlyGenerationKwh / resolved.monthlyKwh) * 100;
  const status: CommercialSizeFit["status"] = belowCommercialMinimum
    ? "below-commercial-minimum"
    : aboveStandardMaximum
      ? "above-standard-maximum"
      : "within-commercial-range";
  const message = belowCommercialMinimum
    ? `Commercial-size gap: the load supports ${requiredPvKwp.toFixed(1)} kWp before package rounding, below the ${minimumCommercialPvKwp} kWp evidenced minimum.`
    : aboveStandardMaximum
      ? `Commercial-size gap: the load supports ${requiredPvKwp.toFixed(1)} kWp, above the ${maximumStandardPvKwp} kWp standard model range; a multi-system design is required.`
      : `Commercial-size fit: the load supports ${requiredPvKwp.toFixed(1)} kWp before package rounding. The selected ${sizing.pvKwp} kWp package uses ${sizing.solarYieldSource === "partner-template" ? "the partner-template yield pending a site reference" : "the site-resource yield"}.`;
  return {
    status,
    requiredPvKwp: round2(requiredPvKwp),
    minimumCommercialPvKwp,
    maximumStandardPvKwp,
    selectedPvKwp: sizing.pvKwp,
    monthlyConsumptionKwh: round2(resolved.sizingMonthlyKwh),
    selectedMonthlyGenerationKwh: sizing.estimatedMonthlyGenerationKwh,
    generationGapKwh: round2(generationGapKwh),
    generationCoveragePct: round2(generationCoveragePct),
    sizeVarianceKwp: round2(sizeVarianceKwp),
    sizeVariancePct: round2(sizeVariancePct),
    belowCommercialMinimum,
    aboveStandardMaximum,
    message,
  };
}

function buildUfmsQuote(
  resolved: ResolvedInput,
  sizing: SystemSizing,
  generationFactor = 1,
  capexAdjustmentFactor = 1,
): UfmsQuote {
  const C = ENGINE_CONSTANTS;
  const capex = buildCapex(sizing, capexAdjustmentFactor);
  const dispatch = simulateEnergyDispatch({
    monthlyKwh: resolved.monthlyKwh,
    sizing,
    businessLoadProfile: resolved.businessLoadProfile,
    tariffStructure: resolved.tariffStructure,
    intervalProfile: resolved.intervalProfile,
    generationFactor,
    allowIntervalDemandSavings: resolved.allowIntervalDemandSavings,
  });
  const baseline = resolved.billBreakdown;
  const retained: BillChargeBreakdown = {
    energy: baseline.energy * dispatch.energyCostShareAfterUfms,
    networkVolumetric: baseline.networkVolumetric * dispatch.gridImportShare,
    fixed: baseline.fixed,
    demand: baseline.demand * (1 - dispatch.creditedDemandReductionPct / 100),
    reactive: baseline.reactive,
    other: baseline.other,
    source: baseline.source,
  };
  const avoided: BillChargeBreakdown = {
    energy: baseline.energy - retained.energy,
    networkVolumetric: baseline.networkVolumetric - retained.networkVolumetric,
    fixed: 0,
    demand: baseline.demand - retained.demand,
    reactive: 0,
    other: 0,
    source: baseline.source,
  };
  const residualGridMonthly = breakdownTotal(retained);
  const ufmsMonthly = capex.total * C.ufmsMonthlyRateFactor;
  const assetFinanceMonthly = pmtDue(C.assetFinanceRate, C.termMonths, capex.total);
  const completeMonthlyCost = ufmsMonthly + residualGridMonthly;
  const monthlySaving = resolved.monthlySpend - completeMonthlyCost;
  const yearOneSavingPct = monthlySaving / resolved.monthlySpend;
  const tenYearClientCostCurrent = escalatingTotal(
    resolved.monthlySpend * 12,
    resolved.utilityEscalation,
    10,
  );
  const tenYearUfms = escalatingTotal(ufmsMonthly * 12, C.ufmsEscalation, 10);
  const tenYearResidual = escalatingTotal(
    residualGridMonthly * 12,
    resolved.utilityEscalation,
    10,
  );
  const tenYearClientCostSolution = tenYearUfms + tenYearResidual;
  const options: ContractingOption[] = [
    {
      label: "Eden",
      monthlyCharge: round2(ufmsMonthly),
      escalation: C.ufmsEscalation,
      termMonths: C.termMonths,
      upfront: 0,
      ownership: "Funder-owned for the term; maintenance, insurance and monitoring included.",
      tenYearTotal: Math.round(tenYearUfms),
    },
    {
      label: "Asset Finance",
      monthlyCharge: round2(assetFinanceMonthly),
      escalation: 0,
      termMonths: C.termMonths,
      upfront: 0,
      ownership: "Indicative annuity-due credit finance; maintenance and insurance remain separate.",
      tenYearTotal: Math.round(assetFinanceMonthly * C.termMonths),
    },
    {
      label: "Capital Purchase",
      monthlyCharge: null,
      escalation: null,
      termMonths: null,
      upfront: capex.total,
      ownership: "Client owns the system outright from day one.",
      tenYearTotal: capex.total,
    },
  ];
  return {
    sizing,
    capex,
    dispatch,
    chargeWaterfall: {
      baseline: withTotal(baseline),
      avoidedByOnsite: withTotal(avoided),
      retainedAfterUfms: withTotal(retained),
    },
    evidenceLevel: resolved.evidenceLevel,
    ufmsMonthly: round2(ufmsMonthly),
    assetFinanceMonthly: round2(assetFinanceMonthly),
    solutionTariff: round2(completeMonthlyCost / resolved.monthlyKwh),
    residualGridMonthly: round2(residualGridMonthly),
    yearOneSavingPct: round2(yearOneSavingPct),
    monthlySaving: round2(monthlySaving),
    tenYearClientCostCurrent: Math.round(tenYearClientCostCurrent),
    tenYearClientCostSolution: Math.round(tenYearClientCostSolution),
    tenYearSaving: Math.round(tenYearClientCostCurrent - tenYearClientCostSolution),
    options,
  };
}

function buildWheelingQuote(resolved: ResolvedInput, tariff: number): WheelingQuote {
  const eligibleShare = resolved.wheelingEligibleShare;
  const wheeledMonthlyKwh = resolved.monthlyKwh * eligibleShare;
  const displacedEnergySpend = resolved.billBreakdown.energy * eligibleShare;
  const retainedEnergySpend = resolved.billBreakdown.energy - displacedEnergySpend;
  const retainedNonEnergyMonthly = resolved.monthlySpend - resolved.billBreakdown.energy;
  const wheeledEnergyCost =
    wheeledMonthlyKwh * tariff * (1 + resolved.wheelingLossFactor);
  const completeMonthlyCost = retainedNonEnergyMonthly + retainedEnergySpend + wheeledEnergyCost;
  const monthlySaving = resolved.monthlySpend - completeMonthlyCost;
  const retainedUtilityMonthly = retainedNonEnergyMonthly + retainedEnergySpend;
  const tenYearCurrent = escalatingTotal(
    resolved.monthlySpend * 12,
    resolved.utilityEscalation,
    10,
  );
  const tenYearCost =
    escalatingTotal(retainedUtilityMonthly * 12, resolved.utilityEscalation, 10) +
    escalatingTotal(wheeledEnergyCost * 12, ENGINE_CONSTANTS.wheelingEscalation, 10);
  return {
    available: monthlySaving > 0,
    note:
      "Standalone wheeling reprices eligible commodity energy only. Network-volumetric, capacity, demand, reactive and service charges remain. In a combined design wheeling is recalculated only on the residual grid import after onsite solar and battery dispatch.",
    energyShareOfBill: round2(resolved.billBreakdown.energy / resolved.monthlySpend),
    displaceableMonthlySpend: round2(displacedEnergySpend),
    estimatedMonthlyKwh: round2(resolved.monthlyKwh),
    wheeledMonthlyKwh: round2(wheeledMonthlyKwh),
    firmTariff: tariff,
    wheeledEnergyCost: round2(wheeledEnergyCost),
    retainedNonEnergyMonthly: round2(retainedNonEnergyMonthly),
    retainedUtilityMonthly: round2(retainedUtilityMonthly),
    monthlyCostAtFirmTariff: round2(completeMonthlyCost),
    monthlySaving: round2(monthlySaving),
    savingPctOfBill: round2(monthlySaving / resolved.monthlySpend),
    annualSaving: round2(monthlySaving * 12),
    tenYearCost: Math.round(tenYearCost),
    tenYearSaving: Math.round(tenYearCurrent - tenYearCost),
  };
}

function buildCombinedQuote(resolved: ResolvedInput, ufms: UfmsQuote): LumenCombinedQuote {
  const C = ENGINE_CONSTANTS;
  const eligible = resolved.monthlySpend >= C.lumenMinMonthlySpend;
  const residualGridKwh = ufms.dispatch.residualGridKwh;
  const wheeledResidualKwh = residualGridKwh * resolved.wheelingEligibleShare;
  const eskomResidualKwh = residualGridKwh - wheeledResidualKwh;
  const residualEnergyCharge = ufms.chargeWaterfall.retainedAfterUfms.energy;
  const eskomResidualEnergyCharge = residualGridKwh > 0
    ? residualEnergyCharge * (eskomResidualKwh / residualGridKwh)
    : 0;
  const retainedNonEnergy = Math.max(0, ufms.residualGridMonthly - residualEnergyCharge);
  const retainedGridMonthly = retainedNonEnergy + eskomResidualEnergyCharge;
  const wheelingMonthlyCharge =
    wheeledResidualKwh * C.wheelingFirmTariff * (1 + resolved.wheelingLossFactor);
  const monthlyCost = ufms.ufmsMonthly + retainedGridMonthly + wheelingMonthlyCharge;
  const monthlySaving = resolved.monthlySpend - monthlyCost;
  const incrementalWheelingSaving = residualEnergyCharge -
    (eskomResidualEnergyCharge + wheelingMonthlyCharge);
  const ufmsSavingPct = ufms.monthlySaving / resolved.monthlySpend;
  const wheelingSavingPct = incrementalWheelingSaving / resolved.monthlySpend;
  const combinedSavingPct = monthlySaving / resolved.monthlySpend;
  const tenYearCurrent = escalatingTotal(
    resolved.monthlySpend * 12,
    resolved.utilityEscalation,
    10,
  );
  const tenYearCost =
    escalatingTotal(ufms.ufmsMonthly * 12, C.ufmsEscalation, 10) +
    escalatingTotal(retainedGridMonthly * 12, resolved.utilityEscalation, 10) +
    escalatingTotal(wheelingMonthlyCharge * 12, C.wheelingEscalation, 10);
  return {
    eligible,
    guaranteeActive: C.lumenGuaranteeActive,
    ufmsSavingPct: round2(ufmsSavingPct),
    wheelingSavingPct: round2(wheelingSavingPct),
    combinedSavingPct: round2(combinedSavingPct),
    onsiteLoadShare: round2(ufms.dispatch.onsiteCoveragePct / 100),
    residualGridKwh: round2(residualGridKwh),
    wheeledResidualKwh: round2(wheeledResidualKwh),
    eskomResidualKwh: round2(eskomResidualKwh),
    ufmsMonthlyCharge: ufms.ufmsMonthly,
    wheelingMonthlyCharge: round2(wheelingMonthlyCharge),
    retainedGridMonthly: round2(retainedGridMonthly),
    monthlySaving: round2(monthlySaving),
    monthlyCost: round2(monthlyCost),
    annualSaving: round2(monthlySaving * 12),
    tenYearCost: Math.round(tenYearCost),
    tenYearSaving: Math.round(tenYearCurrent - tenYearCost),
    note: eligible
      ? "Combined migration waterfall: onsite solar serves load first, the battery shifts onsite energy, wheeling reprices only the remaining eligible grid kWh, and all applicable network/fixed charges remain. Commercial saving guarantees are disclosed separately and are not used as calculation inputs."
      : `The combined commercial structure applies from R${C.lumenMinMonthlySpend.toLocaleString("en-ZA")} monthly spend. The same non-overlapping energy waterfall is still shown for planning.` ,
  };
}

function qualify(
  resolved: ResolvedInput,
  commercialFit: CommercialSizeFit,
  yearOneSavingPct: number,
): QualificationVerdict {
  const reasons = [commercialFit.message];
  let band: QualificationVerdict["band"];
  if (resolved.monthlySpend < ENGINE_CONSTANTS.minMonthlySpend) {
    band = "below-minimum";
    reasons.push(`Monthly spend is below the R${ENGINE_CONSTANTS.minMonthlySpend.toLocaleString("en-ZA")} programme minimum.`);
  } else if (yearOneSavingPct >= 0.08) {
    band = "strong";
    reasons.push(`The complete modelled year-one saving is ${(yearOneSavingPct * 100).toFixed(1)}%, including retained grid charges.`);
  } else if (yearOneSavingPct >= 0) {
    band = "marginal";
    reasons.push(`The complete modelled year-one saving is ${(yearOneSavingPct * 100).toFixed(1)}%; escalation protection carries more of the case.`);
  } else {
    band = "unlikely";
    reasons.push(`The complete modelled solution is ${Math.abs(yearOneSavingPct * 100).toFixed(1)}% above the current bill in year one.`);
  }
  if (resolved.evidenceLevel !== "interval-validated") {
    reasons.push("Battery dispatch uses a disclosed synthetic business profile; interval data is required before crediting demand reduction.");
  }
  if (resolved.billBreakdown.source === "assumed") {
    reasons.push("The charge-line split is assumed. A bill pack replaces it with energy, network, fixed, demand and reactive amounts.");
  }
  return {
    qualifies: band === "strong" || band === "marginal",
    band,
    blendedTariffUsed: round2(resolved.blendedTariff),
    tariffSource: resolved.tariffSource,
    reasons,
  };
}

function scenarioBand(
  label: string,
  confidence: EngineScenarioBand["confidence"],
  resolved: ResolvedInput,
  quote: UfmsQuote,
): EngineScenarioBand {
  return {
    label,
    confidence,
    blendedTariff: round2(resolved.blendedTariff),
    yearOneSavingPct: quote.yearOneSavingPct,
    monthlySaving: quote.monthlySaving,
    pvKwp: quote.sizing.pvKwp,
    pcsKw: quote.sizing.pcsKw,
    bessKwh: quote.sizing.bessKwh,
    ufmsMonthly: quote.ufmsMonthly,
    residualGridMonthly: quote.residualGridMonthly,
    completeMonthlySolutionCost: round2(quote.ufmsMonthly + quote.residualGridMonthly),
    residualGridKwh: quote.dispatch.residualGridKwh,
    onsiteCoveragePct: quote.dispatch.onsiteCoveragePct,
    tenYearSolutionCost: quote.tenYearClientCostSolution,
    tenYearSaving: quote.tenYearSaving,
  };
}

export function runPricingEngine(input: EngineInput): EngineResult {
  const resolved = resolveInput(input);
  const sizing = sizeSystem(resolved.sizingMonthlyKwh, resolved.minimumPvKwp, {
    annualSolarYieldKwhPerKwp: resolved.annualSolarYieldKwhPerKwp,
    solarYieldSource: resolved.solarYieldSource,
    targetOnsiteEnergyShare: resolved.targetOnsiteEnergyShare,
    tariffStructure: resolved.tariffStructure,
    peakShiftHours: resolved.peakShiftHours,
    requestedBessKwh: resolved.requestedBessKwh,
  });
  const ufms = buildUfmsQuote(resolved, sizing);
  const conservative = buildUfmsQuote(resolved, sizing, 0.9, 1.08);
  const upside = buildUfmsQuote(resolved, sizing, 1.05, 0.97);
  const commercialFit = buildCommercialSizeFit(resolved, sizing);
  const wheeling = buildWheelingQuote(resolved, ENGINE_CONSTANTS.wheelingFirmTariff);
  const wheelingPvOnly = buildWheelingQuote(resolved, ENGINE_CONSTANTS.wheelingPvOnlyTariff);
  const lumenCombined = buildCombinedQuote(resolved, ufms);
  const qualification = qualify(resolved, commercialFit, ufms.yearOneSavingPct);
  const bands = [
    scenarioBand("Conservative case", "P10", resolved, conservative),
    scenarioBand("Central case", "P50", resolved, ufms),
    scenarioBand("Technical upside", "P90", resolved, upside),
  ];
  const explainer = buildExplainer(resolved, ufms, lumenCombined, commercialFit);
  return {
    input: {
      monthlySpend: round2(resolved.monthlySpend),
      monthlyKwh: round2(resolved.monthlyKwh),
      sizingMonthlyKwh: round2(resolved.sizingMonthlyKwh),
      blendedTariff: round2(resolved.blendedTariff),
      tariffSource: resolved.tariffSource,
      utilityEscalation: resolved.utilityEscalation,
      evidenceLevel: resolved.evidenceLevel,
      businessLoadProfile: resolved.businessLoadProfile,
      tariffStructure: resolved.tariffStructure,
      annualSolarYieldKwhPerKwp: round2(resolved.annualSolarYieldKwhPerKwp),
      solarYieldSource: resolved.solarYieldSource,
      billBreakdown: resolved.billBreakdown,
    },
    commercialFit,
    qualification,
    ufms,
    wheeling,
    wheelingPvOnly,
    lumenCombined,
    bands,
    explainer,
  };
}

function buildExplainer(
  resolved: ResolvedInput,
  ufms: UfmsQuote,
  combined: LumenCombinedQuote,
  commercialFit: CommercialSizeFit,
) {
  const fmtR = (value: number) => `R${Math.round(value).toLocaleString("en-ZA")}`;
  const dispatch = ufms.dispatch;
  const lines = [
    resolved.tariffSource === "bills"
      ? `Design basis: ${fmtR(resolved.monthlySpend)} for ${Math.round(resolved.monthlyKwh).toLocaleString("en-ZA")} kWh, or R${resolved.blendedTariff.toFixed(2)}/kWh including non-energy charges.`
      : `Spend-only basis: ${fmtR(resolved.monthlySpend)} is converted to ${Math.round(resolved.monthlyKwh).toLocaleString("en-ZA")} kWh using an assumed R${resolved.blendedTariff.toFixed(2)}/kWh blended tariff.`,
    `System sizing: ${ufms.sizing.panelCount} × 620 W panels (${ufms.sizing.pvKwp} kWp package), ${ufms.sizing.pcsKw} kW PCS and ${ufms.sizing.bessKwh} kWh storage. ${ufms.sizing.batterySizingReason}`,
    `Energy waterfall: ${Math.round(dispatch.solarGenerationKwh).toLocaleString("en-ZA")} kWh/month generation supplies ${Math.round(dispatch.directSolarToLoadKwh).toLocaleString("en-ZA")} kWh directly and ${Math.round(dispatch.batteryToLoadKwh).toLocaleString("en-ZA")} kWh through storage. Residual grid import is ${Math.round(dispatch.residualGridKwh).toLocaleString("en-ZA")} kWh/month (${(100 - dispatch.onsiteCoveragePct).toFixed(1)}% of load).`,
    `Charge waterfall: onsite energy avoids ${fmtR(ufms.chargeWaterfall.avoidedByOnsite.energy)} of commodity energy and ${fmtR(ufms.chargeWaterfall.avoidedByOnsite.networkVolumetric)} of volumetric network charges. Fixed, capacity, reactive and unsupported demand savings remain in the bill.`,
    `Turnkey value: ${fmtR(ufms.capex.total)} including ${fmtR(ufms.capex.incrementalStorageCost)} of storage above the base package. The funded month-one charge is ${fmtR(ufms.ufmsMonthly)} and escalates at 6% for ${ENGINE_CONSTANTS.termMonths / 12} years.`,
    `Complete funded path: ${fmtR(ufms.ufmsMonthly)} funding plus ${fmtR(ufms.residualGridMonthly)} retained grid charges gives ${fmtR(ufms.ufmsMonthly + ufms.residualGridMonthly)} per month, a ${fmtR(Math.abs(ufms.monthlySaving))} ${ufms.monthlySaving >= 0 ? "saving" : "premium"}.`,
    `Combined path: wheeling is applied only to ${Math.round(combined.wheeledResidualKwh).toLocaleString("en-ZA")} residual kWh after onsite dispatch. It is never applied to kWh already served by solar or the battery.`,
    resolved.evidenceLevel === "interval-validated"
      ? "Evidence level: interval-validated. Demand reduction is credited only when the submitted interval series supports it."
      : "Evidence level: pre-engineering. A synthetic business load shape is used and demand-charge savings are held at zero until interval validation.",
    commercialFit.message,
  ];
  return lines;
}

/* ------------------------------------------------------------------ */
/* FUNDER-QUOTE PREDICTION (ENGINE V3)                                  */
/*                                                                      */
/* The client-facing estimate must match what the funders will most     */
/* likely produce. The functions below predict the funder's own paper   */
/* (Nedbank/Eqstra UFMS decks and the Green Share wheeling rate card)   */
/* rather than Foundation-1's honest engineering view, which remains    */
/* runPricingEngine(). Calibrated against four extracted decks (MVM,    */
/* Seokas, Ratanga, Primo) to <=0.1%. CONFIDENTIAL: internals must      */
/* never appear in client- or partner-facing output.                    */
/* ------------------------------------------------------------------ */

export const FUNDER_CONSTANTS = {
  /** Template monthly yield used by the funder for sizing (location-blind). */
  templateMonthlyYieldKwhPerKwp: 173.375,
  /** Standard PV package sizes observed on funder paper. */
  pvSizesKwp: [35, 50, 75, 100, 150, 200, 250, 300] as const,
  /** PowerCube BESS blocks; kWp is rounded UP to the next block. */
  bessBlocksKwh: [50, 100, 150, 200, 250, 300] as const,
  /** Extra storage added when the tariff is time-of-use / night load. */
  touStorageAdderKwh: 100,
  /** Incremental storage above the 1:1 base block, R/kWh. */
  storageAdderRandPerKwh: 3_755,
  /** Monthly UFMS charge = factor x turnkey capex (exact on 4/4 decks). */
  ufmsMonthlyRateFactor: 0.015969,
  termMonths: 120,
  ufmsEscalation: 0.06,
  assetFinanceRate: 0.1475,
  /** Capex band half-width around the interpolated P50 (soft-cost wobble). */
  capexBandPct: 0.03,
  /** Escalation the funder decks actually apply to the Eskom baseline
   * (10-yr factor x15.0057 in all three template decks, despite the "12%"
   * printed in the text). */
  funderUtilityEscalation: 0.0874,
  /** Green Share wheeling firm (BESS-backed) tariff, R/kWh. */
  wheelingFirmRate: 1.85,
  /** Observed rate card band: PV-only unfirmed floor to firmed ceiling. */
  wheelingRateBand: [0.98, 1.85] as const,
  /** Mid-case wheeling escalation ("max 6% CPI" on the MVM deck). */
  wheelingEscalation: 0.06,
  wheelingTermYears: 10,
  /** Energy lines as a share of the total bill (MVM bills: 0.53-0.60). */
  defaultBillEnergyShare: 0.6,
  /** Residual grid spend as a share of the bill in the funder's own 10-yr
   * arithmetic: 13.9% (MVM), 12.0% (Ratanga), 3.0% (Seokas/Primo). */
  residualBillShareBand: [0.03, 0.14] as const,
  defaultResidualBillShare: 0.1,
} as const;

/** Capex R/kWp anchors observed on funder decks; linear interpolation. */
const FUNDER_CAPEX_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [35, 27_290],
  [75, 27_804],
  [300, 20_554],
];

export type WheelingDistributor =
  | "eskom-direct"
  | "city-power"
  | "matjhabeng-lm"
  | "other-municipal";

export type FunderQuoteInput = {
  /** 6-12 bill average monthly consumption, kWh. */
  monthlyKwh: number;
  tariffStructure?: TariffStructure;
};

export type FunderQuote = {
  pvKwp: number;
  pcsKw: number;
  bessKwh: number;
  baselineBessKwh: number;
  touStorageAdderApplied: boolean;
  /** Generation the funder will claim: kWp x 173.375 (location-blind). */
  claimedMonthlyGenerationKwh: number;
  capex: number;
  capexBand: [number, number];
  randPerKwp: number;
  incrementalStorageCost: number;
  ufmsMonthly: number;
  ufmsMonthlyBand: [number, number];
  ufmsEscalation: number;
  termMonths: number;
  assetFinanceMonthly: number;
  outOfStandardRange: boolean;
  note: string;
};

export function funderCapexPerKwp(kwp: number): number {
  const anchors = FUNDER_CAPEX_ANCHORS;
  if (kwp <= anchors[0][0]) return anchors[0][1];
  if (kwp >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1];
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const [x1, y1] = anchors[index];
    const [x2, y2] = anchors[index + 1];
    if (kwp >= x1 && kwp <= x2) {
      return y1 + ((y2 - y1) * (kwp - x1)) / (x2 - x1);
    }
  }
  return anchors[anchors.length - 1][1];
}

function snapUp(value: number, steps: readonly number[]): number | null {
  for (const step of steps) {
    if (step >= value) return step;
  }
  return null;
}

/**
 * Predict the Nedbank/Eqstra UFMS quote for a load. Sizing, capex and the
 * monthly charge reproduce the four extracted decks to <=0.1%.
 */
export function predictFunderQuote(input: FunderQuoteInput): FunderQuote {
  const F = FUNDER_CONSTANTS;
  const monthlyKwh = Number(input.monthlyKwh);
  if (!Number.isFinite(monthlyKwh) || monthlyKwh <= 0) {
    throw new Error("Enter a valid monthly consumption greater than zero.");
  }
  const rawKwp = monthlyKwh / F.templateMonthlyYieldKwhPerKwp;
  const sizes = F.pvSizesKwp;
  const maxSize = sizes[sizes.length - 1];
  // Snap UP to the next standard size; loads marginally above the largest
  // package (<=2% over) still receive the 300 kWp deck (observed: MVM at
  // 300.2 exact size was quoted 300 kWp). Beyond that is multi-system.
  const snapped = snapUp(rawKwp, sizes);
  const outOfStandardRange = snapped === null && rawKwp > maxSize * 1.02;
  const pvKwp = snapped ?? maxSize;
  const baselineBessKwh = snapUp(pvKwp, F.bessBlocksKwh) ?? F.bessBlocksKwh[F.bessBlocksKwh.length - 1];
  const touStorageAdderApplied = input.tariffStructure === "time-of-use";
  const bessKwh = baselineBessKwh + (touStorageAdderApplied ? F.touStorageAdderKwh : 0);
  const pcsKw = baselineBessKwh;
  const basePackage = pvKwp * funderCapexPerKwp(pvKwp);
  const incrementalStorageCost = Math.max(0, bessKwh - baselineBessKwh) * F.storageAdderRandPerKwh;
  const capex = basePackage + incrementalStorageCost;
  const ufmsMonthly = capex * F.ufmsMonthlyRateFactor;
  return {
    pvKwp,
    pcsKw,
    bessKwh,
    baselineBessKwh,
    touStorageAdderApplied,
    claimedMonthlyGenerationKwh: round2(pvKwp * F.templateMonthlyYieldKwhPerKwp),
    capex: Math.round(capex),
    capexBand: [Math.round(capex * (1 - F.capexBandPct)), Math.round(capex * (1 + F.capexBandPct))],
    randPerKwp: Math.round(capex / pvKwp),
    incrementalStorageCost: Math.round(incrementalStorageCost),
    ufmsMonthly: round2(ufmsMonthly),
    ufmsMonthlyBand: [
      round2(ufmsMonthly * (1 - F.capexBandPct)),
      round2(ufmsMonthly * (1 + F.capexBandPct)),
    ],
    ufmsEscalation: F.ufmsEscalation,
    termMonths: F.termMonths,
    assetFinanceMonthly: round2(pmtDue(F.assetFinanceRate, F.termMonths, capex)),
    outOfStandardRange,
    note: outOfStandardRange
      ? "Load exceeds the largest single standard package (300 kWp); expect a multi-system funder design outside this calibration."
      : "Predicted funder paper: location-blind template sizing at 173.375 kWh/kWp/month, capex interpolated between observed deck anchors, monthly charge at 1.5969% of capex over 120 months escalating 6%.",
  };
}

export type WheelingPredictionInput = {
  /** Total monthly bill, R excl VAT. */
  monthlySpend: number;
  /** 6-12 bill average monthly consumption, kWh. */
  monthlyKwh?: number;
  /** Energy lines as a share of the total bill. Derived from
   * energyMonthlySpend when supplied; default 0.60 (observed 0.53-0.60). */
  billEnergyShare?: number;
  /** Sum of the bill's commodity-energy lines, R (overrides the default share). */
  energyMonthlySpend?: number;
  distributor?: WheelingDistributor;
};

export type WheelingPrediction = {
  eligible: boolean;
  eligibilityNote: string;
  distributor: WheelingDistributor;
  firmRate: number;
  rateBand: [number, number];
  escalation: number;
  termYears: number;
  energyShareOfBill: number;
  wheeledMonthlyKwh: number;
  wheeledEnergyCost: number;
  retainedNonEnergyMonthly: number;
  monthlyCost: number;
  monthlySaving: number;
  savingPctOfBill: number;
};

const WHEELING_ELIGIBLE_DISTRIBUTORS: ReadonlySet<WheelingDistributor> = new Set([
  "eskom-direct",
  "city-power",
  "matjhabeng-lm",
]);

/**
 * Predict the Green Share wheeling quote. Wheeling reprices commodity-energy
 * lines only; network, fixed, demand and service charges survive on the
 * distributor bill. Eligibility follows the distributor's use-of-system
 * status with Green Share.
 */
export function predictWheelingQuote(input: WheelingPredictionInput): WheelingPrediction {
  const F = FUNDER_CONSTANTS;
  const monthlySpend = Number(input.monthlySpend);
  if (!Number.isFinite(monthlySpend) || monthlySpend <= 0) {
    throw new Error("Enter a valid monthly electricity spend greater than zero.");
  }
  const distributor = input.distributor ?? "eskom-direct";
  const eligible = WHEELING_ELIGIBLE_DISTRIBUTORS.has(distributor);
  const energyShareOfBill = finitePositive(input.energyMonthlySpend)
    ? Math.min(1, input.energyMonthlySpend / monthlySpend)
    : Math.min(1, Math.max(0, input.billEnergyShare ?? F.defaultBillEnergyShare));
  const energySpend = monthlySpend * energyShareOfBill;
  const monthlyKwh = finitePositive(input.monthlyKwh)
    ? input.monthlyKwh
    : energySpend / ENGINE_CONSTANTS.defaultBlendedTariff;
  const wheeledMonthlyKwh = eligible ? monthlyKwh : 0;
  const wheeledEnergyCost = wheeledMonthlyKwh * F.wheelingFirmRate;
  const retainedNonEnergyMonthly = monthlySpend - energySpend;
  const monthlyCost = eligible ? retainedNonEnergyMonthly + wheeledEnergyCost : monthlySpend;
  const monthlySaving = monthlySpend - monthlyCost;
  return {
    eligible,
    eligibilityNote: eligible
      ? distributor === "eskom-direct"
        ? "Eskom-direct supply: Green Share Eskom use-of-system application in progress; deliveries gated by generator COD (Sept 2027 per deck)."
        : distributor === "city-power"
          ? "City Power: provisional wheeling approval and use-of-system agreement in place."
          : "Matjhabeng LM: use-of-system agreement signed."
      : "No Green Share use-of-system agreement exists with this municipal distributor; wheeling is not currently feasible.",
    distributor,
    firmRate: F.wheelingFirmRate,
    rateBand: [F.wheelingRateBand[0], F.wheelingRateBand[1]],
    escalation: F.wheelingEscalation,
    termYears: F.wheelingTermYears,
    energyShareOfBill: round2(energyShareOfBill),
    wheeledMonthlyKwh: round2(wheeledMonthlyKwh),
    wheeledEnergyCost: round2(wheeledEnergyCost),
    retainedNonEnergyMonthly: round2(retainedNonEnergyMonthly),
    monthlyCost: round2(monthlyCost),
    monthlySaving: round2(monthlySaving),
    savingPctOfBill: round2(monthlySaving / monthlySpend),
  };
}

export type CombinedPredictionInput = {
  monthlySpend: number;
  monthlyKwh: number;
  tariffStructure?: TariffStructure;
  billEnergyShare?: number;
  energyMonthlySpend?: number;
  distributor?: WheelingDistributor;
  /** Residual grid spend as a share of the bill after onsite dispatch;
   * default 0.10, funder band [0.03, 0.14]. */
  residualBillShare?: number;
};

export type CombinedPrediction = {
  funderQuote: FunderQuote;
  wheeling: WheelingPrediction;
  /** Share of load kWh served onsite by the UFMS system. */
  onsiteServedShare: number;
  onsiteServedKwh: number;
  residualGridKwh: number;
  /** Residual kWh repriced through wheeling (never overlaps onsite kWh). */
  wheeledResidualKwh: number;
  eskomResidualKwh: number;
  wheeledResidualCost: number;
  eskomResidualCost: number;
  retainedNonEnergyMonthly: number;
  monthlyCost: number;
  monthlySaving: number;
  savingPctOfBill: number;
  note: string;
};

/**
 * Non-additive combined prediction: the UFMS system serves the onsite share
 * of load first; wheeling reprices ONLY the residual eligible energy. The
 * same kWh is never claimed by both products.
 */
export function predictCombined(input: CombinedPredictionInput): CombinedPrediction {
  const F = FUNDER_CONSTANTS;
  const monthlySpend = Number(input.monthlySpend);
  const monthlyKwh = Number(input.monthlyKwh);
  if (!Number.isFinite(monthlySpend) || monthlySpend <= 0) {
    throw new Error("Enter a valid monthly electricity spend greater than zero.");
  }
  if (!Number.isFinite(monthlyKwh) || monthlyKwh <= 0) {
    throw new Error("Enter a valid monthly consumption greater than zero.");
  }
  const funderQuote = predictFunderQuote({
    monthlyKwh,
    tariffStructure: input.tariffStructure,
  });
  const wheeling = predictWheelingQuote({
    monthlySpend,
    monthlyKwh,
    billEnergyShare: input.billEnergyShare,
    energyMonthlySpend: input.energyMonthlySpend,
    distributor: input.distributor,
  });
  const residualBillShare = clamp(
    input.residualBillShare ?? F.defaultResidualBillShare,
    F.residualBillShareBand[0],
    F.residualBillShareBand[1],
  );
  const energyShareOfBill = wheeling.energyShareOfBill;
  const blendedEnergyRate = monthlyKwh > 0
    ? (monthlySpend * energyShareOfBill) / monthlyKwh
    : ENGINE_CONSTANTS.defaultBlendedTariff;
  // Residual energy after onsite dispatch, expressed through the funder's
  // own residual-bill assumption so the combined path reconciles with the
  // funder's UFMS arithmetic rather than double-counting kWh.
  const residualEnergySpend = monthlySpend * residualBillShare * energyShareOfBill;
  const residualGridKwh = blendedEnergyRate > 0 ? residualEnergySpend / blendedEnergyRate : 0;
  const onsiteServedKwh = Math.max(0, monthlyKwh - residualGridKwh);
  const wheeledResidualKwh = wheeling.eligible ? residualGridKwh : 0;
  const eskomResidualKwh = residualGridKwh - wheeledResidualKwh;
  const wheeledResidualCost = wheeledResidualKwh * F.wheelingFirmRate;
  const eskomResidualCost = eskomResidualKwh * blendedEnergyRate;
  const retainedNonEnergyMonthly = monthlySpend * residualBillShare * (1 - energyShareOfBill);
  const monthlyCost =
    funderQuote.ufmsMonthly + wheeledResidualCost + eskomResidualCost + retainedNonEnergyMonthly;
  const monthlySaving = monthlySpend - monthlyCost;
  return {
    funderQuote,
    wheeling,
    onsiteServedShare: round2(onsiteServedKwh / monthlyKwh),
    onsiteServedKwh: round2(onsiteServedKwh),
    residualGridKwh: round2(residualGridKwh),
    wheeledResidualKwh: round2(wheeledResidualKwh),
    eskomResidualKwh: round2(eskomResidualKwh),
    wheeledResidualCost: round2(wheeledResidualCost),
    eskomResidualCost: round2(eskomResidualCost),
    retainedNonEnergyMonthly: round2(retainedNonEnergyMonthly),
    monthlyCost: round2(monthlyCost),
    monthlySaving: round2(monthlySaving),
    savingPctOfBill: round2(monthlySaving / monthlySpend),
    note: "Combined prediction is non-additive: the on-site system serves your load first and wheeling reprices only the residual eligible grid energy. Network, fixed and service charges within the residual remain on the distributor bill.",
  };
}

export type TenYearSeriesInput = {
  monthlySpend: number;
  monthlyKwh: number;
  tariffStructure?: TariffStructure;
  billEnergyShare?: number;
  energyMonthlySpend?: number;
  distributor?: WheelingDistributor;
  /** Residual grid spend share of the bill under UFMS; band [0.03, 0.14]. */
  residualBillShare?: number;
  /** Override the predicted UFMS monthly charge (e.g. a real quote). */
  ufmsMonthly?: number;
  /** Override the wheeling rate (e.g. a negotiated tariff). */
  wheelingRate?: number;
  eskomEscalation?: number;
  ufmsEscalation?: number;
  wheelingEscalation?: number;
};

export type TenYearSeries = {
  years: number[];
  /** Cumulative annual utility cost, funder-style 8.74% escalation. */
  eskom: number[];
  /** Cumulative UFMS path: charge stream @6% + residual grid @8.74%. */
  ufms: number[];
  /** Cumulative wheeling path: wheeled energy @6% + retained non-energy @8.74%. */
  wheeling: number[];
  /** Cumulative combined path (non-additive kWh waterfall). */
  combined: number[];
  assumptions: {
    eskomEscalation: number;
    ufmsEscalation: number;
    wheelingEscalation: number;
    residualBillShare: number;
    billEnergyShare: number;
    wheelingRate: number;
    ufmsMonthly: number;
    wheelingEligible: boolean;
  };
};

function cumulativeEscalating(yearOneAnnual: number, escalation: number, years: number) {
  const series: number[] = [];
  let total = 0;
  for (let year = 0; year < years; year += 1) {
    total += yearOneAnnual * (1 + escalation) ** year;
    series.push(total);
  }
  return series;
}

function addSeries(...series: number[][]): number[] {
  const length = series[0].length;
  return Array.from({ length }, (_unused, index) =>
    Math.round(series.reduce((total, current) => total + current[index], 0)));
}

/**
 * Ten-year cumulative cost series in the funder's own presentation format.
 * Defaults reproduce the decomposition verified against the funder decks:
 * the Eskom baseline escalates at 8.74%/yr (10-yr factor x15.0057), the
 * UFMS path is the 6%-escalating charge stream plus residual grid spend at
 * 8.74%, and wheeling escalates the wheeled energy at ~6% while retained
 * non-energy lines track the 8.74% grid escalation.
 */
export function tenYearSeries(input: TenYearSeriesInput): TenYearSeries {
  const F = FUNDER_CONSTANTS;
  const years = 10;
  const monthlySpend = Number(input.monthlySpend);
  const monthlyKwh = Number(input.monthlyKwh);
  if (!Number.isFinite(monthlySpend) || monthlySpend <= 0) {
    throw new Error("Enter a valid monthly electricity spend greater than zero.");
  }
  if (!Number.isFinite(monthlyKwh) || monthlyKwh <= 0) {
    throw new Error("Enter a valid monthly consumption greater than zero.");
  }
  const eskomEscalation = input.eskomEscalation ?? F.funderUtilityEscalation;
  const ufmsEscalation = input.ufmsEscalation ?? F.ufmsEscalation;
  const wheelingEscalation = input.wheelingEscalation ?? F.wheelingEscalation;
  const residualBillShare = clamp(
    input.residualBillShare ?? F.defaultResidualBillShare,
    F.residualBillShareBand[0],
    F.residualBillShareBand[1],
  );
  const wheelingRate = finitePositive(input.wheelingRate) ? input.wheelingRate : F.wheelingFirmRate;
  const funderQuote = predictFunderQuote({
    monthlyKwh,
    tariffStructure: input.tariffStructure,
  });
  const ufmsMonthly = finitePositive(input.ufmsMonthly) ? input.ufmsMonthly : funderQuote.ufmsMonthly;
  const wheelingPrediction = predictWheelingQuote({
    monthlySpend,
    monthlyKwh,
    billEnergyShare: input.billEnergyShare,
    energyMonthlySpend: input.energyMonthlySpend,
    distributor: input.distributor,
  });
  const billEnergyShare = wheelingPrediction.energyShareOfBill;
  const eligible = wheelingPrediction.eligible;

  const eskom = cumulativeEscalating(monthlySpend * 12, eskomEscalation, years)
    .map((value) => Math.round(value));

  const ufms = addSeries(
    cumulativeEscalating(ufmsMonthly * 12, ufmsEscalation, years),
    cumulativeEscalating(monthlySpend * residualBillShare * 12, eskomEscalation, years),
  );

  const wheeledAnnual = eligible ? monthlyKwh * 12 * wheelingRate : monthlySpend * billEnergyShare * 12;
  const wheeling = addSeries(
    cumulativeEscalating(wheeledAnnual, eligible ? wheelingEscalation : eskomEscalation, years),
    cumulativeEscalating(monthlySpend * (1 - billEnergyShare) * 12, eskomEscalation, years),
  );

  const combinedPrediction = predictCombined({
    monthlySpend,
    monthlyKwh,
    tariffStructure: input.tariffStructure,
    billEnergyShare: input.billEnergyShare,
    energyMonthlySpend: input.energyMonthlySpend,
    distributor: input.distributor,
    residualBillShare,
  });
  const combined = addSeries(
    cumulativeEscalating(ufmsMonthly * 12, ufmsEscalation, years),
    cumulativeEscalating(combinedPrediction.wheeledResidualCost * 12, wheelingEscalation, years),
    cumulativeEscalating(combinedPrediction.eskomResidualCost * 12, eskomEscalation, years),
    cumulativeEscalating(combinedPrediction.retainedNonEnergyMonthly * 12, eskomEscalation, years),
  );

  return {
    years: Array.from({ length: years }, (_unused, index) => index + 1),
    eskom,
    ufms,
    wheeling,
    combined,
    assumptions: {
      eskomEscalation,
      ufmsEscalation,
      wheelingEscalation,
      residualBillShare,
      billEnergyShare,
      wheelingRate,
      ufmsMonthly: round2(ufmsMonthly),
      wheelingEligible: eligible,
    },
  };
}

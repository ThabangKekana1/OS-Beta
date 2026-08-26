import { eskomBlendedForFamily } from "@/lib/eskom-tariff-model";
import { municipalBlendedForMunicipality } from "@/lib/municipal-tariff-model";
import { ENGINE_CONSTANTS, runPricingEngine } from "@/lib/pricing-engine";
import { resolveSaPlace, type SaPlaceContext } from "@/lib/sa-places";
import { provinceSolarYieldAssumption } from "@/lib/solar-yield-assumptions";

export const INDICATIVE_REPORT_VERSION = "2026-07-22.4";
export const REQUIRED_FORMAL_BILLING_PERIODS = 6;

export const ELECTRICITY_SUPPLY_TYPES = [
  "eskom-direct",
  "municipality",
  "landlord-or-body-corporate",
  "unsure",
] as const;

export type ElectricitySupplyType = (typeof ELECTRICITY_SUPPLY_TYPES)[number];

/**
 * Blended-tariff anchors per tariff family (R/kWh ex VAT, all-in monthly
 * charge ÷ kWh). basis "audited" anchors derive from the approved-current
 * catalogue and audited pipeline bill packs; basis "observed" anchors are
 * reasoned from observed client blends and stay clearly bracketed by the
 * scenario bands. No anchor is ever presented as the client's actual tariff.
 */
export const TARIFF_FAMILY_ANCHORS = {
  businessrate: { label: "Businessrate", blendedTariff: 2.7, basis: "audited" },
  landrate: { label: "Landrate", blendedTariff: 3.35, basis: "audited" },
  ruraflex: { label: "Ruraflex", blendedTariff: 3.05, basis: "audited" },
  "nightsave-rural": { label: "Nightsave Rural", blendedTariff: 2.95, basis: "audited" },
  megaflex: { label: "Megaflex", blendedTariff: 2.45, basis: "observed" },
  miniflex: { label: "Miniflex", blendedTariff: 2.6, basis: "observed" },
  "nightsave-urban": { label: "Nightsave Urban", blendedTariff: 2.55, basis: "observed" },
  "municipal-business": { label: "Municipal business tariff", blendedTariff: 3.1, basis: "observed" },
  "resold-supply": { label: "Landlord / resold supply", blendedTariff: 3.3, basis: "observed" },
} as const;

export type TariffFamilyId = keyof typeof TARIFF_FAMILY_ANCHORS;

/** Families a visitor may self-select from an Eskom bill. */
export const SELECTABLE_ESKOM_FAMILIES: readonly TariffFamilyId[] = [
  "businessrate",
  "landrate",
  "ruraflex",
  "nightsave-rural",
  "nightsave-urban",
  "megaflex",
  "miniflex",
];

export function isTariffFamilyId(value: unknown): value is TariffFamilyId {
  return typeof value === "string" && value in TARIFF_FAMILY_ANCHORS;
}

export type IndicativeMigrationReportInput = {
  monthlySpendExVat: number;
  monthlyKwh?: number | null;
  siteCity: string;
  province: string;
  supplyType: ElectricitySupplyType;
  /** Optional visitor-selected tariff family ("it says Megaflex on my bill"). */
  tariffFamily?: TariffFamilyId | null;
  /**
   * Optional pre-resolved place from the national gazetteer (the intake
   * autocomplete resolves 12,000+ populated places client-side and passes
   * the result through so the heavy dataset never enters this module).
   */
  placeMunicipality?: string | null;
  placeContext?: SaPlaceContext | null;
  generatedAt?: string;
};

export type IndicativeMigrationScenario = {
  label: string;
  assumedBlendedTariff: number;
  estimatedMonthlyKwh: number;
  pvKwp: number;
  pcsKw: number;
  bessKwh: number;
  ufmsMonthlyCharge: number;
  retainedGridEstimate: number;
  completeMonthlySolutionCost: number;
  monthlyDifference: number;
  yearOneDifferencePct: number;
  tenYearDifference: number;
  economicallyPositive: boolean;
};

/** A client-facing migration pathway comparison row. */
export type IndicativeMigrationPathway = {
  id: "current" | "eden" | "nightshade" | "awaken" | "combined";
  label: string;
  strapline: string;
  monthlyCost: number;
  monthlyDifference: number;
  yearOneDifferencePct: number;
  tenYearCost: number;
  tenYearDifference: number;
  escalation: number | null;
  available: boolean;
  conditional: boolean;
  note: string;
};

export type IndicativeMigrationReport = {
  version: typeof INDICATIVE_REPORT_VERSION;
  evidenceLevel: "indicative-no-bills";
  generatedAt: string;
  site: {
    city: string;
    province: string;
    supplyType: ElectricitySupplyType;
    municipality: string | null;
    placeContext: SaPlaceContext | null;
  };
  tariffContext: {
    supplierName: string;
    candidates: { id: TariffFamilyId; label: string; assumedBlendedTariff: number }[];
    anchor: {
      id: TariffFamilyId | null;
      label: string;
      blendedTariff: number;
      source: "client-selected-tariff" | "supply-route-and-area" | "supply-route" | "default-assumption";
    };
    note: string;
  };
  input: {
    monthlySpendExVat: number;
    monthlyKwh: number | null;
    kwhSource: "client-entered-unverified" | "tariff-band-assumption";
  };
  currentPath: {
    monthlySpendExVat: number;
    annualSpendExVat: number;
    tenYearUtilityCost: number;
    utilityEscalationAssumption: number;
  };
  scenarios: IndicativeMigrationScenario[];
  pathways: IndicativeMigrationPathway[];
  savingsRange: {
    monthlyLow: number;
    monthlyHigh: number;
    tenYearLow: number;
    tenYearHigh: number;
  };
  wheelingScreen: {
    availableOnAssumptions: boolean;
    estimatedMonthlyDifference: number;
    energyShareAssumption: number;
    firmEnergyTariff: number;
    note: string;
  };
  preliminaryFit: "below-programme-minimum" | "promising" | "bill-dependent" | "weak";
  limitations: string[];
  nextStep: {
    title: string;
    detail: string;
    requiredBillingPeriods: number;
  };
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cleanLocation(value: string, label: string) {
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!cleaned) throw new Error(`${label} is required.`);
  return cleaned;
}

export function isElectricitySupplyType(value: unknown): value is ElectricitySupplyType {
  return typeof value === "string"
    && ELECTRICITY_SUPPLY_TYPES.includes(value as ElectricitySupplyType);
}

function candidateIds(
  supplyType: ElectricitySupplyType,
  placeContext: SaPlaceContext | null,
  monthlySpendExVat: number,
): TariffFamilyId[] {
  if (supplyType === "municipality") return ["municipal-business"];
  if (supplyType === "landlord-or-body-corporate") return ["resold-supply"];
  // Above roughly R60,000 a month a business is almost always on a
  // time-of-use tariff, not the small-commercial flat rates.
  const largeLoad = monthlySpendExVat >= 60_000;
  if (supplyType === "eskom-direct") {
    if (placeContext === "metro") return largeLoad ? ["megaflex", "nightsave-urban", "businessrate"] : ["businessrate", "nightsave-urban", "megaflex"];
    if (placeContext === "rural") return largeLoad ? ["ruraflex", "landrate", "nightsave-rural"] : ["landrate", "ruraflex", "nightsave-rural"];
    if (placeContext === "town") return largeLoad ? ["megaflex", "miniflex", "businessrate"] : ["businessrate", "landrate", "megaflex"];
    return largeLoad ? ["megaflex", "ruraflex", "landrate"] : ["businessrate", "landrate", "ruraflex"];
  }
  // No bill is required on the public screen. Bracket the representative
  // tariff menu for the area's settlement type and let the bill pack resolve
  // the actual supplier, tariff code and charge structure later.
  if (placeContext === "metro") {
    return ["municipal-business", "businessrate", "nightsave-urban", "megaflex"];
  }
  if (placeContext === "rural") {
    return ["municipal-business", "landrate", "ruraflex", "nightsave-rural"];
  }
  if (placeContext === "town") {
    return ["municipal-business", "businessrate", "landrate", "miniflex"];
  }
  return ["municipal-business", "businessrate", "landrate", "ruraflex"];
}

function resolveTariffContext(input: {
  supplyType: ElectricitySupplyType;
  siteCity: string;
  tariffFamily: TariffFamilyId | null;
  placeMunicipality: string | null;
  placeContext: SaPlaceContext | null;
  monthlySpendExVat: number;
}) {
  const place = resolveSaPlace(input.siteCity);
  const municipality = input.placeMunicipality ?? place?.municipality ?? null;
  const placeContext = input.placeContext ?? place?.context ?? null;
  const supplierName = input.supplyType === "eskom-direct"
    ? "Eskom (direct supply)"
    : input.supplyType === "municipality"
      ? municipality ?? "Your municipal distributor"
      : input.supplyType === "landlord-or-body-corporate"
        ? "Landlord or body corporate (resold supply)"
        : municipality ? `${municipality} or Eskom` : "Eskom or your municipal distributor";

  const ids = candidateIds(input.supplyType, placeContext, input.monthlySpendExVat);
  // Exact 2026/27 tariff-book blends where the family is modelled; static
  // anchors only as the fallback. The blend is spend-dependent because fixed
  // charges dilute with consumption, exactly as on a real bill.
  const municipalExact = municipalBlendedForMunicipality(municipality, input.monthlySpendExVat);
  const candidates = ids.map((id) => {
    if (id === "municipal-business" && municipalExact) {
      return {
        id,
        label: `${municipality} business tariff`,
        assumedBlendedTariff: municipalExact.blendedTariff,
        exactBook: true,
      };
    }
    const exact = eskomBlendedForFamily(id, input.monthlySpendExVat);
    return {
      id,
      label: TARIFF_FAMILY_ANCHORS[id].label,
      assumedBlendedTariff: exact ? exact.blendedTariff : TARIFF_FAMILY_ANCHORS[id].blendedTariff,
      exactBook: Boolean(exact),
    };
  });

  let anchor: {
    id: TariffFamilyId | null;
    label: string;
    blendedTariff: number;
    source: "client-selected-tariff" | "supply-route-and-area" | "supply-route" | "default-assumption";
  };
  if (input.tariffFamily) {
    const selected = TARIFF_FAMILY_ANCHORS[input.tariffFamily];
    const exact = eskomBlendedForFamily(input.tariffFamily, input.monthlySpendExVat);
    anchor = {
      id: input.tariffFamily,
      label: exact ? `${selected.label} (2026/27 tariff book)` : selected.label,
      blendedTariff: exact ? exact.blendedTariff : selected.blendedTariff,
      source: "client-selected-tariff",
    };
  } else if (candidates.length) {
    // Lead with the first (most common) family for the supply route and area,
    // exact-book priced; the menu is still shown to the visitor.
    const primary = candidates.find((candidate) => candidate.exactBook) ?? candidates[0];
    anchor = {
      id: primary.id,
      label: primary.id === "municipal-business" && primary.exactBook ? `${primary.label} (2026/27 published schedule)` : primary.exactBook ? `${primary.label} (2026/27 tariff book)` : `${primary.label} band (area menu)`,
      blendedTariff: primary.assumedBlendedTariff,
      source: placeContext ? "supply-route-and-area" : "supply-route",
    };
  } else {
    anchor = {
      id: null,
      label: "National business assumption",
      blendedTariff: ENGINE_CONSTANTS.defaultBlendedTariff,
      source: "default-assumption",
    };
  }

  const note = input.tariffFamily
    ? `Anchored on the ${anchor.label} tariff you selected. The exact rate, zone, voltage and fixed charges are confirmed from the bill pack.`
    : `${supplierName} typically serves businesses like this on: ${candidates.map((item) => item.label).join(", ")}. The estimate is anchored on this menu; your six bills identify the exact tariff.`;

  return { municipality, placeContext, supplierName, candidates, anchor, note };
}

export function buildIndicativeMigrationReport(
  input: IndicativeMigrationReportInput,
): IndicativeMigrationReport {
  const monthlySpendExVat = Number(input.monthlySpendExVat);
  if (!Number.isFinite(monthlySpendExVat) || monthlySpendExVat <= 0) {
    throw new Error("Enter a valid monthly electricity charge before VAT.");
  }
  if (!isElectricitySupplyType(input.supplyType)) {
    throw new Error("Choose who supplies electricity to the site.");
  }

  const monthlyKwhValue = Number(input.monthlyKwh);
  const monthlyKwh = Number.isFinite(monthlyKwhValue) && monthlyKwhValue > 0
    ? monthlyKwhValue
    : null;
  const siteCity = cleanLocation(input.siteCity, "Site town or city");
  const province = cleanLocation(input.province, "Province");
  const tariffFamily = isTariffFamilyId(input.tariffFamily) ? input.tariffFamily : null;
  const placeContextInput = input.placeContext === "metro" || input.placeContext === "town" || input.placeContext === "rural"
    ? input.placeContext
    : null;
  const tariffContext = resolveTariffContext({
    supplyType: input.supplyType,
    siteCity,
    monthlySpendExVat,
    tariffFamily,
    placeMunicipality: typeof input.placeMunicipality === "string" && input.placeMunicipality.trim()
      ? input.placeMunicipality.trim().slice(0, 160)
      : null,
    placeContext: placeContextInput,
  });
  const solarAssumption = provinceSolarYieldAssumption(province);
  const engineInput = {
    monthlySpend: monthlySpendExVat,
    ...(monthlyKwh
      ? { monthlyKwh, monthlyKwhSource: "assumed" as const }
      : { blendedTariff: tariffContext.anchor.blendedTariff }),
    minimumPvKwp: ENGINE_CONSTANTS.verifiedCommercialMinimumPvKwp,
    // Daytime-weighted operations: the calibration that reproduces the
    // verified partner decks. Bills and interval data refine it later.
    businessLoadProfile: "daytime" as const,
    annualSolarYieldKwhPerKwp: solarAssumption?.annualKwhPerKwp,
    solarYieldSource: solarAssumption ? ("site-pvgis" as const) : undefined,
  };
  // Standard packages snap upward; when the snap overshoots the load, the
  // smaller package often carries better first-year economics. Price both
  // and keep the stronger commercial case — engineering finalises sizing.
  const engineFull = runPricingEngine(engineInput);
  const engineTrimmed = runPricingEngine({ ...engineInput, targetOnsiteEnergyShare: 0.8 });
  const engine = engineTrimmed.ufms.monthlySaving > engineFull.ufms.monthlySaving
    ? engineTrimmed
    : engineFull;

  const scenarios: IndicativeMigrationScenario[] = engine.bands.map((band) => ({
          label: band.label,
          assumedBlendedTariff: band.blendedTariff,
          estimatedMonthlyKwh: engine.input.monthlyKwh,
          pvKwp: band.pvKwp,
          pcsKw: band.pcsKw,
          bessKwh: band.bessKwh,
          ufmsMonthlyCharge: band.ufmsMonthly,
          retainedGridEstimate: band.residualGridMonthly,
          completeMonthlySolutionCost: band.completeMonthlySolutionCost,
          monthlyDifference: band.monthlySaving,
          yearOneDifferencePct: band.yearOneSavingPct,
          tenYearDifference: band.tenYearSaving,
          economicallyPositive: band.monthlySaving > 0 && band.tenYearSaving > 0,
        }));

  const monthlyDifferences = scenarios.map((scenario) => scenario.monthlyDifference);
  const tenYearDifferences = scenarios.map((scenario) => scenario.tenYearDifference);
  const positiveCount = scenarios.filter((scenario) => scenario.economicallyPositive).length;

  // ——— Client-facing pathways: current vs Eden vs Awaken vs Nightshade vs blended ———
  const ufms = engine.ufms;
  const tenYearCurrent = ufms.tenYearClientCostCurrent;
  const edenTenYear = ufms.tenYearClientCostSolution;
  const assetFinanceOption = ufms.options.find((option) => option.label === "Asset Finance");
  const nightshadeMonthly = ufms.assetFinanceMonthly + ufms.residualGridMonthly;
  const nightshadeTenYear = (assetFinanceOption?.tenYearTotal ?? Math.round(ufms.assetFinanceMonthly * 120))
    + (edenTenYear - (ufms.options.find((option) => option.label === "Eden")?.tenYearTotal ?? 0));
  const wheeling = engine.wheeling;
  const combined = engine.lumenCombined;
  const currentSupplyLabel = input.supplyType === "eskom-direct"
    ? "Eskom"
    : input.supplyType === "municipality"
      ? tariffContext.supplierName
      : input.supplyType === "landlord-or-body-corporate"
        ? "Current resold supply"
        : "Eskom / current supply";
  const pathways: IndicativeMigrationPathway[] = [
    {
      id: "current",
      label: currentSupplyLabel,
      strapline: "Your current electricity cost before migration.",
      monthlyCost: roundMoney(monthlySpendExVat),
      monthlyDifference: 0,
      yearOneDifferencePct: 0,
      tenYearCost: tenYearCurrent,
      tenYearDifference: 0,
      escalation: engine.input.utilityEscalation,
      available: true,
      conditional: false,
      note: `Assumes ${(engine.input.utilityEscalation * 100).toFixed(1)}% average annual utility escalation.`,
    },
    {
      id: "eden",
      label: "Eden",
      strapline: "Zero-capex on-site renewable energy under a funded monthly structure.",
      monthlyCost: roundMoney(ufms.ufmsMonthly + ufms.residualGridMonthly),
      monthlyDifference: ufms.monthlySaving,
      yearOneDifferencePct: ufms.yearOneSavingPct,
      tenYearCost: edenTenYear,
      tenYearDifference: ufms.tenYearSaving,
      escalation: ENGINE_CONSTANTS.ufmsEscalation,
      available: true,
      conditional: false,
      note: "Funded charge escalates 6% while the utility path escalates faster. The gap compounds every year.",
    },
    {
      id: "awaken",
      label: "Awaken",
      strapline: "Wheeled renewable energy repricing the eligible energy portion of the bill.",
      monthlyCost: wheeling.monthlyCostAtFirmTariff,
      monthlyDifference: wheeling.monthlySaving,
      yearOneDifferencePct: wheeling.savingPctOfBill,
      tenYearCost: wheeling.tenYearCost,
      tenYearDifference: wheeling.tenYearSaving,
      escalation: ENGINE_CONSTANTS.wheelingEscalation,
      available: true,
      conditional: true,
      note: "Reprices eligible commodity energy only; network, demand and service charges remain. Subject to grid, regulatory and project availability.",
    },
    {
      id: "nightshade",
      label: "Nightshade",
      strapline: "Asset finance for a client-owned renewable-energy solution.",
      monthlyCost: roundMoney(nightshadeMonthly),
      monthlyDifference: roundMoney(monthlySpendExVat - nightshadeMonthly),
      yearOneDifferencePct: roundMoney((monthlySpendExVat - nightshadeMonthly) / monthlySpendExVat * 100) / 100,
      tenYearCost: nightshadeTenYear,
      tenYearDifference: tenYearCurrent - nightshadeTenYear,
      escalation: 0,
      available: true,
      conditional: false,
      note: "The instalment never escalates; ownership transfers at term end. Credit approval applies.",
    },
    {
      id: "combined",
      label: "Blended approach",
      strapline: "Eden on site with Awaken serving the eligible remaining grid energy.",
      monthlyCost: combined.monthlyCost,
      monthlyDifference: combined.monthlySaving,
      yearOneDifferencePct: combined.combinedSavingPct,
      tenYearCost: combined.tenYearCost,
      tenYearDifference: combined.tenYearSaving,
      escalation: null,
      available: combined.eligible,
      conditional: true,
      note: combined.note,
    },
  ];

  const preliminaryFit = monthlySpendExVat < ENGINE_CONSTANTS.minMonthlySpend
    ? "below-programme-minimum"
    : positiveCount === scenarios.length
      ? "promising"
      : positiveCount > 0 || pathways.some((pathway) => pathway.id !== "current" && pathway.available && pathway.tenYearDifference > 0)
        ? "bill-dependent"
        : "weak";

  return {
    version: INDICATIVE_REPORT_VERSION,
    evidenceLevel: "indicative-no-bills",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    site: {
      city: siteCity,
      province,
      supplyType: input.supplyType,
      municipality: tariffContext.municipality,
      placeContext: tariffContext.placeContext,
    },
    tariffContext: {
      supplierName: tariffContext.supplierName,
      candidates: tariffContext.candidates,
      anchor: tariffContext.anchor,
      note: tariffContext.note,
    },
    input: {
      monthlySpendExVat: roundMoney(monthlySpendExVat),
      monthlyKwh: monthlyKwh === null ? null : roundMoney(monthlyKwh),
      kwhSource: monthlyKwh
        ? "client-entered-unverified"
        : "tariff-band-assumption",
    },
    currentPath: {
      monthlySpendExVat: roundMoney(monthlySpendExVat),
      annualSpendExVat: roundMoney(monthlySpendExVat * 12),
      tenYearUtilityCost: engine.ufms.tenYearClientCostCurrent,
      utilityEscalationAssumption: engine.input.utilityEscalation,
    },
    scenarios,
    pathways,
    savingsRange: {
      monthlyLow: roundMoney(Math.min(...monthlyDifferences)),
      monthlyHigh: roundMoney(Math.max(...monthlyDifferences)),
      tenYearLow: Math.round(Math.min(...tenYearDifferences)),
      tenYearHigh: Math.round(Math.max(...tenYearDifferences)),
    },
    wheelingScreen: {
      availableOnAssumptions: engine.wheeling.available,
      estimatedMonthlyDifference: engine.wheeling.monthlySaving,
      energyShareAssumption: engine.wheeling.energyShareOfBill,
      firmEnergyTariff: engine.wheeling.firmTariff,
      note:
        "Preliminary screen only. Wheeling can replace eligible energy charges, not network, demand or service charges, and remains subject to utility, regulatory and project approvals.",
    },
    preliminaryFit,
    limitations: [
      "No utility bill was requested or used for this first report.",
      tariffContext.municipality
        ? `The town identifies ${tariffContext.municipality} as the likely supply area; it cannot identify an exact Eskom or municipal tariff, bill code, voltage, zone or demand profile.`
        : "Town and province support site routing and solar-resource planning; they do not identify an exact Eskom or municipal tariff.",
      tariffFamily
        ? `The estimate is anchored on a typical ${tariffContext.anchor.label} blended rate; the actual rate, season, zone and fixed charges are confirmed from the bill pack.`
        : "The named tariff, bill code, voltage, zone, demand profile, fixed charges and residual grid cost remain unverified.",
      monthlyKwh
        ? "The kWh value was entered by the visitor and has not been reconciled to a statement."
        : `Consumption is estimated from the ${tariffContext.anchor.label} anchor of R${tariffContext.anchor.blendedTariff.toFixed(2)}/kWh and bracketed by transparent low, base and high scenario bands.`,
      "This is not an offer or quotation. The full migration proposal is released only after the complete bill pack is assessed and the Foundation-1 EOI is completed.",
    ],
    nextStep: {
      title: "Build the bill-audited proposal",
      detail:
        "Open a secure migration case, submit the 6 most recent utility bills together and complete the Foundation-1 EOI. Foundation-1 then validates the tariff and charges, releases the full proposal, and confirms KYC readiness before any bank handoff.",
      requiredBillingPeriods: REQUIRED_FORMAL_BILLING_PERIODS,
    },
  };
}

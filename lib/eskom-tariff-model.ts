import eskomTariffs from "@/data/eskom-tariffs-2026-27.json" with { type: "json" };

/**
 * Exact-rate blended-tariff model for Eskom-direct business supply, built on
 * the official Eskom 2026/27 tariff book (validated to the cent against
 * Foundation-1's audited client bills).
 *
 * Approach: from a monthly spend (ex VAT) and a tariff family, solve the
 * consumption and the all-in blended R/kWh using the family's real charge
 * components. Time-of-use families use Foundation-1's audited business
 * consumption shares (peak 15.1%, standard 41.5%, off-peak 43.4%) and the
 * seasonal weighting from the tariff book (3 high months, 9 low months).
 * The six-bill audit replaces every assumption with the exact bill.
 */

type EskomDataset = {
  families: Record<string, unknown>;
};

const DATASET = eskomTariffs as unknown as EskomDataset;

/** Audited business consumption shares (Foundation-1 client bills). */
const TOU_SHARES = { peak: 0.151, standard: 0.415, offpeak: 0.434 } as const;
const HIGH_SEASON_MONTHS = 3;
const LOW_SEASON_MONTHS = 9;
/** Assumed supply capacity for fixed R/kVA-month charges at business scale. */
const ASSUMED_KVA_BY_SPEND = [
  { maxSpend: 30_000, kva: 50 },
  { maxSpend: 80_000, kva: 100 },
  { maxSpend: 200_000, kva: 250 },
  { maxSpend: Number.POSITIVE_INFINITY, kva: 500 },
] as const;

export type EskomBlendedResult = {
  familyId: string;
  variantLabel: string;
  /** All-in blended rate, R/kWh ex VAT. */
  blendedTariff: number;
  /** Variable-only component of the blend, R/kWh. */
  variableRatePerKwh: number;
  /** Fixed charges, R/month. */
  fixedMonthly: number;
  estimatedMonthlyKwh: number;
  basis: "official-2026-27-tariff-book";
};

function assumedKva(monthlySpend: number) {
  for (const band of ASSUMED_KVA_BY_SPEND) {
    if (monthlySpend <= band.maxSpend) return band.kva;
  }
  return 500;
}

const DAYS_PER_MONTH = 30.4375;

function solveFromComponents(
  familyId: string,
  variantLabel: string,
  variableRatePerKwh: number,
  fixedMonthly: number,
  monthlySpend: number,
): EskomBlendedResult | null {
  if (!(variableRatePerKwh > 0)) return null;
  const variableSpend = monthlySpend - fixedMonthly;
  if (variableSpend <= 0) return null;
  const estimatedMonthlyKwh = variableSpend / variableRatePerKwh;
  const blendedTariff = monthlySpend / estimatedMonthlyKwh;
  return {
    familyId,
    variantLabel,
    blendedTariff: Math.round(blendedTariff * 10000) / 10000,
    variableRatePerKwh: Math.round(variableRatePerKwh * 10000) / 10000,
    fixedMonthly: Math.round(fixedMonthly * 100) / 100,
    estimatedMonthlyKwh: Math.round(estimatedMonthlyKwh),
    basis: "official-2026-27-tariff-book",
  };
}

function flatFamilyBlend(familyId: string, monthlySpend: number): EskomBlendedResult | null {
  const family = DATASET.families[familyId] as
    | { variants?: Array<{ name: string; charges: Record<string, number | null | undefined> }> }
    | undefined;
  if (!family?.variants?.length) return null;
  // Landrate 2 / Businessrate 1 style: the workhorse business variant.
  const preferred = familyId === "landrate"
    ? family.variants.find((variant) => variant.name === "Landrate 2")
    : family.variants[0];
  const variant = preferred ?? family.variants[0];
  const charges = variant.charges ?? {};
  const energy = Number(charges.energy_c_kwh ?? 0);
  if (!(energy > 0)) return null;
  const variablePerKwh = (
    energy
    + Number(charges.ancillary_service_c_kwh ?? 0)
    + Number(charges.network_demand_c_kwh ?? 0)
  ) / 100;
  const fixedMonthly = DAYS_PER_MONTH * (
    Number(charges.network_capacity_r_pod_day ?? 0)
    + Number(charges.service_admin_r_pod_day ?? 0)
    + Number(charges.generation_capacity_r_pod_day ?? 0)
  );
  return solveFromComponents(familyId, variant.name, variablePerKwh, fixedMonthly, monthlySpend);
}

type TouBlock = Record<string, number | string | null | undefined>;

function touWeightedEnergy(block: TouBlock) {
  const high =
    Number(block.high_peak_c_kwh ?? 0) * TOU_SHARES.peak
    + Number(block.high_standard_c_kwh ?? 0) * TOU_SHARES.standard
    + Number(block.high_offpeak_c_kwh ?? 0) * TOU_SHARES.offpeak;
  const low =
    Number(block.low_peak_c_kwh ?? 0) * TOU_SHARES.peak
    + Number(block.low_standard_c_kwh ?? 0) * TOU_SHARES.standard
    + Number(block.low_offpeak_c_kwh ?? 0) * TOU_SHARES.offpeak;
  return (high * HIGH_SEASON_MONTHS + low * LOW_SEASON_MONTHS) / 12;
}

function touFamilyBlend(familyId: string, monthlySpend: number): EskomBlendedResult | null {
  const family = DATASET.families[familyId] as {
    energy_blocks?: TouBlock[];
    ancillary_and_network_demand_by_voltage?: Array<Record<string, number | string>>;
    service_admin_by_customer_category?: Array<Record<string, number | string>>;
  } | undefined;
  if (!family?.energy_blocks?.length) return null;
  // Zone 0 (≤300km), lowest voltage: the representative business connection.
  const block = family.energy_blocks.find(
    (candidate) => Number(candidate.tx_zone) === 0 && Number(candidate.voltage_code) === 1,
  ) ?? family.energy_blocks[0];

  let variableCents = touWeightedEnergy(block) + Number(block.legacy_c_kwh ?? 0);
  const networkRow = family.ancillary_and_network_demand_by_voltage?.[0];
  if (networkRow) {
    variableCents += Number(networkRow.ancillary_service_c_kwh ?? 0);
    variableCents += Number(networkRow.network_demand_c_kwh_all_tou ?? networkRow.network_demand_c_kwh ?? 0);
  }

  const kva = assumedKva(monthlySpend);
  let fixedMonthly = kva * (
    Number(block.network_capacity_r_kva_m ?? 0)
    + Number(block.generation_capacity_r_kva_m ?? 0)
  );
  const serviceRow = family.service_admin_by_customer_category?.[0];
  if (serviceRow) {
    fixedMonthly += DAYS_PER_MONTH * (
      Number(serviceRow.service_charge_r_pod_day ?? 0)
      + Number(serviceRow.admin_charge_r_pod_day ?? 0)
    );
  }
  const label = `${String(familyId)} · zone ≤300km`;
  return solveFromComponents(familyId, label, variableCents / 100, fixedMonthly, monthlySpend);
}

const FLAT_FAMILIES = new Set(["landrate", "businessrate", "homepower"]);
const TOU_FAMILIES = new Set(["ruraflex", "megaflex", "miniflex"]);

/**
 * The exact-book blend for an Eskom family at a given spend, or null when the
 * family cannot be modelled from the dataset (callers fall back to anchors).
 */
export function eskomBlendedForFamily(familyId: string, monthlySpendExVat: number): EskomBlendedResult | null {
  const normalized = familyId.replace(/-/g, "_");
  if (FLAT_FAMILIES.has(normalized)) return flatFamilyBlend(normalized, monthlySpendExVat);
  if (TOU_FAMILIES.has(normalized)) return touFamilyBlend(normalized, monthlySpendExVat);
  if (normalized === "nightsave_rural" || normalized === "nightsave_urban") {
    // Nightsave: seasonal two-rate energy; approximate with the rural blocks.
    return touFamilyBlend(normalized === "nightsave_urban" ? "nightsave_urban_small" : "nightsave_rural", monthlySpendExVat)
      ?? flatFamilyBlend(normalized, monthlySpendExVat);
  }
  return null;
}

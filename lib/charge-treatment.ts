/**
 * Charge-treatment matrix: which line on a utility bill each product removes.
 *
 * Sales constraint this removes: a client asks "which of these charges does
 * the on-site system take away, and which does wheeling take away?" and the
 * answer has to be given line by line, from their own invoice, without
 * promising anything that is actually conditional.
 *
 * Pure module. No I/O, no network, no engine internals. It consumes the
 * charge lines already classified by the bill reader and returns a table that
 * can be shown to an operator or, in plain language, to a client.
 *
 * Two products, two different reaches:
 *  - ON-SITE (UFMS/Eden) removes every charge billed per kWh imported, in
 *    proportion to the kWh it displaces. It does not touch charges billed per
 *    kVA of reserved capacity or per day of connection.
 *  - WHEELING (Green Share) replaces only the energy commodity. The wheeled
 *    kWh still travels over the network, so every per-kWh network, levy and
 *    ancillary charge is still billed.
 */

import type { BillChargeCategory, BillChargeLine, TouBucket } from "@/lib/utility-bill-analysis";

export const CHARGE_TREATMENT_VERSION = "2026-07-13.1";

export type OnsiteTreatment = "removed-pro-rata" | "conditional" | "retained";
export type WheelingTreatment = "replaced" | "retained" | "conditional";

export type ChargeTreatmentRule = {
  /** Compact, client-readable name for the whole category. */
  label: string;
  /** What the on-site system does to this category. */
  onsite: OnsiteTreatment;
  /** What a wheeling PPA does to this category. */
  wheeling: WheelingTreatment;
  /** One sentence a client can read: what this charge actually pays for. */
  reason: string;
  /** Why the on-site treatment is what it is. */
  onsiteReason: string;
  /** Why the wheeling treatment is what it is. */
  wheelingReason: string;
};

/**
 * The whole product-difference argument, in one table.
 *
 * Every sentence here is written to be read out loud in a client meeting: no
 * engine terms, no internal pricing language, and nothing stated as a saving
 * unless it is unconditional.
 */
export const CHARGE_TREATMENT_RULES: Record<BillChargeCategory, ChargeTreatmentRule> = {
  energy: {
    label: "Energy charge",
    onsite: "removed-pro-rata",
    wheeling: "replaced",
    reason: "This is the electricity itself — the units you consume, priced per kWh.",
    onsiteReason:
      "Every kWh your own system supplies is a kWh you do not buy, so this charge falls in direct proportion to the energy generated on site.",
    wheelingReason:
      "This is the one charge wheeling changes: the same units are bought from the wheeled generator at the contracted rate instead of from the utility.",
  },
  "network-volumetric": {
    label: "Network charge (per kWh)",
    onsite: "removed-pro-rata",
    wheeling: "retained",
    reason: "This pays for carrying each unit of electricity to your site and is billed on every kWh you import.",
    onsiteReason:
      "It is charged per kWh imported, so it falls away with every kWh you no longer take from the grid.",
    wheelingReason:
      "Wheeled electricity still travels over the same network to reach you, so this per-kWh carriage charge is still billed in full.",
  },
  "levy-volumetric": {
    label: "Levies and legacy charges (per kWh)",
    onsite: "removed-pro-rata",
    wheeling: "retained",
    reason: "Statutory and legacy levies charged on each kWh delivered to your meter.",
    onsiteReason:
      "These levies are charged per kWh imported and fall away with the units you stop buying.",
    wheelingReason:
      "The levies apply to every kWh delivered through the grid, whoever generated it, so they remain on a wheeled supply.",
  },
  "ancillary-volumetric": {
    label: "Ancillary services (per kWh)",
    onsite: "removed-pro-rata",
    wheeling: "retained",
    reason: "This pays for the services that keep the grid stable, charged on each kWh you import.",
    onsiteReason:
      "It is billed per kWh imported and falls in proportion to the energy you displace on site.",
    wheelingReason:
      "The grid still has to be kept stable to deliver the wheeled energy, so the charge remains.",
  },
  "fixed-capacity": {
    label: "Capacity charges (per kVA of reserved demand)",
    onsite: "conditional",
    wheeling: "retained",
    reason: "This pays to reserve capacity on the network for you and is billed on your notified maximum demand, not on units used.",
    onsiteReason:
      "It does not move with generation. It only falls if you formally apply to the utility to reduce your notified maximum demand and then hold the lower peak. Treat it as a named upside with an action attached, never as a promised saving.",
    wheelingReason:
      "Wheeling changes where your energy is bought, not how much capacity you have reserved on the network.",
  },
  "fixed-service": {
    label: "Service and administration (per day)",
    onsite: "retained",
    wheeling: "retained",
    reason: "A daily charge for having a connection and an account, regardless of how much electricity you use.",
    onsiteReason:
      "It is billed per day of connection, not per kWh, so generating your own power does not reduce it.",
    wheelingReason:
      "You remain a connected customer of the utility under a wheeling arrangement, so this charge stays.",
  },
  demand: {
    label: "Maximum demand charge (per kVA)",
    onsite: "conditional",
    wheeling: "retained",
    reason: "This is billed on the highest demand your site draws in the month, not on total units.",
    onsiteReason:
      "It only falls if generation or storage is actually running at the moment your site peaks. It is counted only where metered interval data proves it.",
    wheelingReason:
      "Wheeling does not change the shape of your load, so your measured peak demand is unchanged.",
  },
  reactive: {
    label: "Reactive energy charge",
    onsite: "conditional",
    wheeling: "retained",
    reason: "A charge for reactive power drawn by motors and other inductive equipment on your site.",
    onsiteReason:
      "It only falls if the installed inverters are specified to supply reactive power support. Confirm the inverter specification before counting it.",
    wheelingReason:
      "Wheeling does not change your site's reactive power behaviour, so this charge is unaffected.",
  },
  adjustment: {
    label: "Adjustments, rebills and corrections",
    onsite: "retained",
    wheeling: "retained",
    reason: "One-off corrections, rebills and account adjustments.",
    onsiteReason:
      "These are not part of your recurring cost of electricity and should not be counted in either direction.",
    wheelingReason:
      "These are not part of your recurring cost of electricity and should not be counted in either direction.",
  },
  other: {
    label: "Unclassified charges",
    onsite: "retained",
    wheeling: "retained",
    reason: "Lines on the invoice that could not be matched to a known charge type.",
    onsiteReason:
      "Held aside and treated as unaffected until the line is confirmed against the invoice.",
    wheelingReason:
      "Held aside and treated as unaffected until the line is confirmed against the invoice.",
  },
};

/** Order the table is presented in: what moves first, what never moves last. */
const CATEGORY_ORDER: BillChargeCategory[] = [
  "energy",
  "network-volumetric",
  "levy-volumetric",
  "ancillary-volumetric",
  "fixed-capacity",
  "demand",
  "reactive",
  "fixed-service",
  "adjustment",
  "other",
];

const TOU_BUCKETS: TouBucket[] = ["peak", "standard", "off-peak"];
const TOU_LABEL: Record<TouBucket, string> = { peak: "peak", standard: "standard", "off-peak": "off-peak" };

/** Categories billed on each kWh imported — the full reach of an on-site system. */
const PER_KWH_CATEGORIES: BillChargeCategory[] = [
  "energy",
  "network-volumetric",
  "levy-volumetric",
  "ancillary-volumetric",
];

/** The per-kWh charges that survive wheeling and ride on top of the wheeled rate. */
const RIDER_CATEGORIES: BillChargeCategory[] = [
  "network-volumetric",
  "levy-volumetric",
  "ancillary-volumetric",
];

export type ChargeTreatmentSide<T> = {
  treatment: T;
  reason: string;
  /** Rand per month this product can reach under that treatment; 0 when retained. */
  reachableAmount: number;
};

export type ChargeTreatmentLine = {
  label: string;
  monthlyAmount: number;
  category: BillChargeCategory;
  touBucket: TouBucket | null;
  shareOfBill: number;
  sourceLineCount: number;
  onsite: ChargeTreatmentSide<OnsiteTreatment>;
  wheeling: ChargeTreatmentSide<WheelingTreatment>;
};

export type ChargeTreatmentBucket = {
  kwh: number;
  monthlyAmount: number;
  /** Energy commodity cost per kWh in this time-of-use bucket. */
  energyRate: number;
  /** What one kWh displaced on site is actually worth in this bucket: energy plus the per-kWh rider. */
  onsiteAvoidedRate: number;
};

export type ChargeTreatmentTotals = {
  billMonthly: number;
  onsiteReachable: number;
  wheelingReachable: number;
  neverReachable: number;
  conditionalNmd: number;
  conditionalReactive: number;
  onsiteReachableShare: number;
  wheelingReachableShare: number;
  neverReachableShare: number;
};

export type ChargeTreatmentPerKwh = {
  totalKwh: number;
  /** Per-kWh network, levy and ancillary charges that ride on every imported kWh. */
  rider: number;
  riderComponents: { networkVolumetric: number; levyVolumetric: number; ancillaryVolumetric: number };
  blendedEnergyRate: number;
  blendedOnsiteAvoidedRate: number;
  buckets: Partial<Record<TouBucket, ChargeTreatmentBucket>>;
};

export type ChargeTreatmentMatrix = {
  version: string;
  lines: ChargeTreatmentLine[];
  totals: ChargeTreatmentTotals;
  perKwh: ChargeTreatmentPerKwh;
  warnings: string[];
};

export type ChargeTreatmentOptions = {
  /**
   * Number of billing periods the supplied lines cover. Amounts are divided by
   * this so the table always reads per month. Ratios and per-kWh rates are
   * unaffected.
   */
  periodCount?: number;
  /** Monthly kWh, when known from the bill header rather than the charge lines. */
  monthlyKwh?: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round4(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function safeDivide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function money(value: number) {
  return `R${Math.round(value).toLocaleString("en-ZA")}`;
}

function isKwhQuantity(line: BillChargeLine) {
  return line.quantity !== null && line.quantity > 0 && (line.unit ?? "").toLowerCase() === "kwh";
}

function sideFor<T extends OnsiteTreatment | WheelingTreatment>(
  treatment: T,
  reason: string,
  amount: number,
): ChargeTreatmentSide<T> {
  const reaches = (treatment as string) !== "retained";
  return { treatment, reason, reachableAmount: round2(reaches ? amount : 0) };
}

function lineLabel(category: BillChargeCategory, touBucket: TouBucket | null) {
  const base = CHARGE_TREATMENT_RULES[category].label;
  return touBucket ? `${base} — ${TOU_LABEL[touBucket]}` : base;
}

/**
 * Group the raw invoice lines into the table a client is shown, and price the
 * decisive number: what one displaced kWh is actually worth, by time of use.
 */
export function buildChargeTreatmentMatrix(
  chargeLines: BillChargeLine[],
  options: ChargeTreatmentOptions = {},
): ChargeTreatmentMatrix {
  const periods = options.periodCount && options.periodCount > 0 ? options.periodCount : 1;
  const warnings: string[] = [];

  type Group = { category: BillChargeCategory; touBucket: TouBucket | null; amount: number; kwh: number; count: number };
  const groups = new Map<string, Group>();
  for (const line of chargeLines) {
    const category = line.category;
    const touBucket = category === "energy" ? line.touBucket : null;
    const key = `${category}::${touBucket ?? "-"}`;
    const group = groups.get(key) ?? { category, touBucket, amount: 0, kwh: 0, count: 0 };
    group.amount += line.amountExVat;
    if (isKwhQuantity(line)) group.kwh += line.quantity as number;
    group.count += 1;
    groups.set(key, group);
  }

  const ordered = [...groups.values()].sort((a, b) => {
    const byCategory = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    if (byCategory !== 0) return byCategory;
    return b.amount - a.amount;
  });

  const billTotal = ordered.reduce((sum, group) => sum + group.amount, 0);
  const categoryAmount = (category: BillChargeCategory) =>
    ordered.filter((group) => group.category === category).reduce((sum, group) => sum + group.amount, 0);
  const sumCategories = (categories: BillChargeCategory[]) =>
    categories.reduce((sum, category) => sum + categoryAmount(category), 0);

  const lines: ChargeTreatmentLine[] = ordered.map((group) => {
    const rule = CHARGE_TREATMENT_RULES[group.category];
    const monthlyAmount = group.amount / periods;
    return {
      label: lineLabel(group.category, group.touBucket),
      monthlyAmount: round2(monthlyAmount),
      category: group.category,
      touBucket: group.touBucket,
      shareOfBill: round4(safeDivide(group.amount, billTotal)),
      sourceLineCount: group.count,
      onsite: sideFor(rule.onsite, rule.onsiteReason, monthlyAmount),
      wheeling: sideFor(rule.wheeling, rule.wheelingReason, monthlyAmount),
    };
  });

  const onsiteReachable = sumCategories(PER_KWH_CATEGORIES);
  const wheelingReachable = categoryAmount("energy");
  const conditionalNmd = categoryAmount("fixed-capacity");
  const conditionalReactive = categoryAmount("reactive");
  const neverReachable = billTotal - onsiteReachable;

  const totals: ChargeTreatmentTotals = {
    billMonthly: round2(billTotal / periods),
    onsiteReachable: round2(onsiteReachable / periods),
    wheelingReachable: round2(wheelingReachable / periods),
    neverReachable: round2(neverReachable / periods),
    conditionalNmd: round2(conditionalNmd / periods),
    conditionalReactive: round2(conditionalReactive / periods),
    onsiteReachableShare: round4(safeDivide(onsiteReachable, billTotal)),
    wheelingReachableShare: round4(safeDivide(wheelingReachable, billTotal)),
    neverReachableShare: round4(safeDivide(neverReachable, billTotal)),
  };

  // kWh basis: the header figure when supplied, otherwise the metered energy
  // quantities on the invoice, otherwise the largest volumetric quantity.
  const energyKwh = ordered
    .filter((group) => group.category === "energy")
    .reduce((sum, group) => sum + group.kwh, 0);
  const riderKwhCandidates = chargeLines
    .filter((line) => RIDER_CATEGORIES.includes(line.category) && isKwhQuantity(line))
    .reduce((map, line) => {
      map.set(line.category, (map.get(line.category) ?? 0) + (line.quantity as number));
      return map;
    }, new Map<BillChargeCategory, number>());
  const fallbackKwh = Array.from(riderKwhCandidates.values()).reduce((max, value) => Math.max(max, value), 0);
  const totalKwh = options.monthlyKwh && options.monthlyKwh > 0
    ? options.monthlyKwh * periods
    : energyKwh > 0
      ? energyKwh
      : fallbackKwh;

  const riderComponents = {
    networkVolumetric: round2(categoryAmount("network-volumetric") / periods),
    levyVolumetric: round2(categoryAmount("levy-volumetric") / periods),
    ancillaryVolumetric: round2(categoryAmount("ancillary-volumetric") / periods),
  };
  const rider = round4(safeDivide(sumCategories(RIDER_CATEGORIES), totalKwh));
  const blendedEnergyRate = round4(safeDivide(categoryAmount("energy"), totalKwh));

  const buckets: Partial<Record<TouBucket, ChargeTreatmentBucket>> = {};
  for (const bucket of TOU_BUCKETS) {
    const group = ordered.find((candidate) => candidate.category === "energy" && candidate.touBucket === bucket);
    if (!group || group.amount <= 0) continue;
    if (group.kwh <= 0) {
      warnings.push(
        `${TOU_LABEL[bucket]} energy is billed on this account but the invoice lines carry no kWh quantity, so a ${TOU_LABEL[bucket]} avoided rate cannot be quoted.`,
      );
      continue;
    }
    const energyRate = round4(group.amount / group.kwh);
    buckets[bucket] = {
      kwh: round2(group.kwh / periods),
      monthlyAmount: round2(group.amount / periods),
      energyRate,
      onsiteAvoidedRate: round4(energyRate + rider),
    };
  }

  const perKwh: ChargeTreatmentPerKwh = {
    totalKwh: round2(totalKwh / periods),
    rider,
    riderComponents,
    blendedEnergyRate,
    blendedOnsiteAvoidedRate: round4(blendedEnergyRate + rider),
    buckets,
  };

  if (chargeLines.length === 0) {
    warnings.push("No charge lines were recognised on this account, so no treatment can be shown.");
  }
  if (totalKwh <= 0 && chargeLines.length > 0) {
    warnings.push(
      "The invoice lines carry no kWh quantities, so per-kWh avoided cost cannot be quoted from this evidence.",
    );
  }
  const unclassified = categoryAmount("other");
  if (unclassified > 0) {
    warnings.push(
      `${money(unclassified / periods)}/month of charges could not be matched to a known charge type and is treated as unaffected by both products until confirmed on the invoice.`,
    );
  }
  const adjustments = categoryAmount("adjustment");
  if (adjustments !== 0) {
    warnings.push(
      `${money(Math.abs(adjustments / periods))}/month of rebills, corrections or adjustments are present. They are not part of the recurring cost base and must not be quoted as savings.`,
    );
  }
  if (conditionalNmd > 0) {
    warnings.push(
      `${money(conditionalNmd / periods)}/month of capacity charges only fall if a formal notified-maximum-demand reduction is applied for and the lower peak is sustained. Present it as an upside with that action attached, never as a saving.`,
    );
  }
  if (categoryAmount("demand") > 0) {
    warnings.push(
      `${money(categoryAmount("demand") / periods)}/month of maximum-demand charges require metered interval data before any reduction is counted.`,
    );
  }
  if (conditionalReactive > 0) {
    warnings.push(
      `${money(conditionalReactive / periods)}/month of reactive energy charges only fall if the installed inverters are specified for reactive power support.`,
    );
  }

  return { version: CHARGE_TREATMENT_VERSION, lines, totals, perKwh, warnings };
}

export type WheelingViability = {
  viable: boolean;
  /** Rand per kWh gained (positive) or lost (negative) by switching to the wheeled rate. */
  marginPerKwh: number;
  note: string;
};

/**
 * Does wheeling actually beat what the client pays for energy today?
 *
 * Wheeling only replaces the energy commodity, so the honest comparison is the
 * wheeled rate against the energy rate alone — never against the blended cost
 * of the whole bill. Compared on a blended energy rate a wheeled tariff often
 * loses; compared on the peak energy rate the same tariff can win outright.
 */
export function wheelingViability(
  blendedEnergyRate: number,
  wheeledRate: number,
  basisLabel = "blended",
): WheelingViability {
  const marginPerKwh = round4(blendedEnergyRate - wheeledRate);
  const viable = marginPerKwh > 0;
  const rate = (value: number) => `R${value.toFixed(4)}/kWh`;
  const note = viable
    ? `At ${rate(wheeledRate)} the wheeled energy is ${rate(Math.abs(marginPerKwh))} cheaper than the ${basisLabel} energy it replaces, so wheeling is worth doing on this basis. Network, levy, ancillary, capacity and service charges are unchanged.`
    : `At ${rate(wheeledRate)} the wheeled energy costs ${rate(Math.abs(marginPerKwh))} more than the ${basisLabel} energy it replaces, so wheeling does not pay on this basis. Wheeling replaces only the energy itself — network, levy, ancillary, capacity and service charges stay on the bill either way, so it can only be justified where the energy it displaces is dearer than the wheeled rate.`;
  return { viable, marginPerKwh, note };
}

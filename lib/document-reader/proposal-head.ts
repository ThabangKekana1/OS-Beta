/**
 * Proposal head — parser for returned Nedbank/Eqstra UFMS P4L decks.
 *
 * INTERNAL — this module encodes the cracked funder pricing model
 * (audit 04 / `4. Foundation-1 OS/tools/ufms_pricing_engine.py`). Never
 * surface its cross-check reasoning in client- or partner-facing output.
 *
 * The decks' money tables (p10 capital cost, p11 contracting options) are
 * embedded IMAGES, so capex cannot be read from the text layer. It doesn't
 * need to be: monthlyCharge ÷ 0.015969 recovers capex deterministically
 * (Ratanga: 15,253 ÷ 0.015969 = R955,163 vs known R955,159). Text-layer
 * fields carry per-field confidence; every deck is then cross-checked
 * against the clone engine:
 *   capex-recovery : derived capex vs the R/kWp anchor curve (±1%)
 *   sizing-yield   : monthly generation ÷ 173.375 vs stated kWp (±5%)
 *   term           : 10-year / 120 months
 *   escalation     : 6% p.a. fixed
 * plus forensic flags (e.g. the 12%-claim vs ×15.006-forecast escalation
 * trick: their 10-yr utility forecast actually compounds ≈8.74%).
 */
import { ENGINE_CONSTANTS } from "@/lib/pricing-engine";
import { normaliseDocumentText } from "./classify";
import {
  DOCUMENT_READER_VERSION,
  type FieldReading,
  type FunderProposalExtraction,
  type ProposalCrosscheck,
  type VerificationResult,
} from "./types";

/** R/kWp anchors from the pricing forensics (matches the unexported capex
 * curve in `lib/pricing-engine.ts`; verified to ≤0.001% on all 4 known
 * decks). Duplicated here read-only — pricing-engine.ts is owned elsewhere. */
const CAPEX_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [35, 27_290],
  [75, 27_804],
  [300, 20_554],
];

const BESS_BLOCKS = [50, 100, 150, 200, 250, 300] as const;

/** Their 10-yr forecast multiplier (≈8.74% compounding), audit 04. */
const OBSERVED_FORECAST_MULTIPLIER = 15.0057;

function capexPerKwp(kwp: number): number {
  const anchors = CAPEX_ANCHORS;
  if (kwp <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (kwp >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i += 1) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (kwp <= x1) return y0 + ((kwp - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}

function expectedCapex(kwp: number, bessKwh: number | null): number {
  const base = kwp * capexPerKwp(kwp);
  const block = BESS_BLOCKS.find((b) => b >= Math.min(kwp, 300)) ?? 300;
  const extraStorage = bessKwh === null ? 0 : Math.max(0, bessKwh - block);
  return base + extraStorage * ENGINE_CONSTANTS.storageIncrementalRandPerKwhInclVat;
}

function parseNumber(raw: string): number {
  return Number.parseFloat(raw.replace(/[,\s]/g, ""));
}

function readField(
  text: string,
  pattern: RegExp,
  confidence: "high" | "medium" | "low" = "high",
): FieldReading<number> {
  const match = text.match(pattern);
  if (!match) return { value: null, confidence: "low", source: "text-layer" };
  const value = parseNumber(match[1]);
  if (!Number.isFinite(value)) return { value: null, confidence: "low", source: "text-layer" };
  return { value, confidence, source: "text-layer", evidence: match[0].slice(0, 160) };
}

function missing<T>(): FieldReading<T> {
  return { value: null, confidence: "low", source: "text-layer" };
}

function deviationPct(actual: number, expected: number): number {
  if (expected === 0) return Number.POSITIVE_INFINITY;
  return Math.abs(actual / expected - 1) * 100;
}

export function parseFunderProposalText(rawText: string): FunderProposalExtraction {
  const text = normaliseDocumentText(rawText);
  const warnings: string[] = [];
  const flags: string[] = [];

  const isUfms = /UFMS\s+PROPOSAL|UTILITY\s+FULL\s+MAINTENANCE\s+SERVICE/i.test(text);
  const isWheeling = !isUfms && /wheeling/i.test(text);
  const dialect: FunderProposalExtraction["dialect"] = isUfms
    ? "ufms-p4l"
    : isWheeling
      ? "wheeling"
      : "unknown";

  if (dialect !== "ufms-p4l") {
    warnings.push(
      dialect === "wheeling"
        ? "Green Share wheeling proposal detected — a second inbound dialect with no field parser yet (audit 02 §c). Routed for human review."
        : "Unrecognised proposal dialect.",
    );
  }

  const clientNameMatch = text.match(
    /UTILITY FULL MAINTENANCE SERVICE \[UFMS\]\s+(.{3,80}?)\s+Renewable Power Solution Proposal/i,
  );
  const clientName: FieldReading<string> = clientNameMatch
    ? {
        value: clientNameMatch[1].trim(),
        confidence: "medium",
        source: "text-layer",
        evidence: clientNameMatch[0].slice(0, 160),
      }
    : missing<string>();

  // p11 "Included in this proposal" bullets — the authoritative sizing lines.
  const pvKwp = readField(text, /([\d.]+)\s*kWp solar generation system/i);
  const bessKwh = readField(text, /\(\s*([\d,]+)\s*kWh\s*\)\s*battery energy storage/i);
  // p10 tariff comparative.
  const currentBlendedTariff = readField(text, /current tariff averages\s*R\s*([\d.]+)/i);
  const solutionTariff = readField(text, /solution tariff[^.]{0,140}?is\s*R\s*([\d.]+)/i);
  const monthlyChargeExVat = readField(text, /monthly charge of\s*R\s*([\d,]+)\s*\(excl\)/i);
  // p8 "Existing Scenario".
  const currentAnnualCost = readField(text, /annual electricity tariff of\s*R\s*([\d,]+)\s*per\s*annum/i);
  const claimedUtilityEscalationPct = readField(text, /average escalation of\s*([\d.]+)\s*%\s*per/i, "medium");
  const tenYearUtilityForecast = readField(text, /to be:\s*R\s*([\d,]+)/i, "medium");
  const tenYearSavingClaim = readField(
    text,
    /Saving over the 10-year period is estimated to be\s*R\s*([\d,]+)/i,
  );
  const generationKwhPerDay = readField(text, /generate\s*([\d,]+)\s*kWh of power per day/i);
  const generationKwhPerMonth = readField(text, /total of up to\s*([\d,]+)\s*kWh per month/i);
  const contractEscalationPct = readField(
    text,
    /increase by\s*([\d.]+)\s*%\s*per annum for the full contract period/i,
  );
  const termYearsField = readField(text, /(\d+)[- ]year contract/i, "medium");
  const abortFee = readField(text, /fee of approximately\s*R\s*([\d,]+)/i, "medium");

  // Derived capex — the image-only table recovered via the cracked engine.
  const derivedCapex: FieldReading<number> =
    monthlyChargeExVat.value !== null
      ? {
          value:
            Math.round(
              (monthlyChargeExVat.value / ENGINE_CONSTANTS.ufmsMonthlyRateFactor) * 100,
            ) / 100,
          confidence: monthlyChargeExVat.confidence,
          source: "derived",
          evidence: `monthlyCharge R${monthlyChargeExVat.value} ÷ ${ENGINE_CONSTANTS.ufmsMonthlyRateFactor}`,
        }
      : missing<number>();

  const crosschecks: ProposalCrosscheck[] = [];

  // 1. capex-recovery: derived capex vs anchor curve (+ storage adder).
  if (derivedCapex.value !== null && pvKwp.value !== null) {
    const expected = expectedCapex(pvKwp.value, bessKwh.value);
    const dev = deviationPct(derivedCapex.value, expected);
    crosschecks.push({
      name: "capex-recovery",
      pass: dev <= 1,
      expected: `R${Math.round(expected).toLocaleString("en-ZA")} (anchor curve @ ${pvKwp.value} kWp)`,
      actual: `R${Math.round(derivedCapex.value).toLocaleString("en-ZA")} (monthly ÷ 0.015969)`,
      deviationPct: Math.round(dev * 1000) / 1000,
      note: "Recovers the image-only capex table from the text-layer monthly charge.",
    });
  } else {
    crosschecks.push({
      name: "capex-recovery",
      pass: null,
      expected: "derived capex vs anchor curve",
      actual: "monthly charge or kWp missing from text layer",
      deviationPct: null,
      note: "Not checkable without both fields.",
    });
  }

  // 2. sizing-yield: monthly generation ÷ 173.375 vs stated kWp.
  if (generationKwhPerMonth.value !== null && pvKwp.value !== null) {
    const impliedKwp = generationKwhPerMonth.value / ENGINE_CONSTANTS.kwhPerKwpPerMonth;
    const dev = deviationPct(impliedKwp, pvKwp.value);
    crosschecks.push({
      name: "sizing-yield",
      pass: dev <= 5,
      expected: `${pvKwp.value} kWp stated`,
      actual: `${Math.round(impliedKwp * 100) / 100} kWp implied (gen ÷ 173.375)`,
      deviationPct: Math.round(dev * 100) / 100,
      note: "Their sizing rule kWp = monthly kWh ÷ 173.375, from the generation claim.",
    });
  } else {
    crosschecks.push({
      name: "sizing-yield",
      pass: null,
      expected: "monthly generation ÷ 173.375 ≈ stated kWp",
      actual: "generation claim or kWp missing",
      deviationPct: null,
      note: "Not checkable without both fields.",
    });
  }

  // 3. term: 10-year / 120 months.
  crosschecks.push({
    name: "term",
    pass: termYearsField.value === null ? null : termYearsField.value === 10,
    expected: "10-year (120-month) contract",
    actual: termYearsField.value === null ? "term not found" : `${termYearsField.value}-year`,
    deviationPct: null,
    note: "Standard UFMS term.",
  });

  // 4. escalation: 6% p.a. fixed.
  crosschecks.push({
    name: "escalation",
    pass: contractEscalationPct.value === null ? null : contractEscalationPct.value === 6,
    expected: "6% p.a. fixed for the full contract period",
    actual:
      contractEscalationPct.value === null
        ? "escalation not found"
        : `${contractEscalationPct.value}% p.a.`,
    deviationPct: null,
    note: "Standard UFMS escalation.",
  });

  // Forensic flag: the escalation trick. Claimed 12% would multiply the
  // annual cost ×17.55 over 10 years; their forecasts consistently use
  // ×15.006 (≈8.74%). Negotiation ammunition, attached automatically.
  if (
    currentAnnualCost.value !== null &&
    tenYearUtilityForecast.value !== null &&
    currentAnnualCost.value > 0
  ) {
    const multiplier = tenYearUtilityForecast.value / currentAnnualCost.value;
    if (
      (claimedUtilityEscalationPct.value ?? 12) >= 11 &&
      Math.abs(multiplier - OBSERVED_FORECAST_MULTIPLIER) < 0.15
    ) {
      flags.push(
        `escalation-claim-inconsistent: deck claims ${claimedUtilityEscalationPct.value ?? "≈12"}% utility escalation but its 10-yr forecast multiplies annual cost ×${multiplier.toFixed(3)} (≈8.74% compounding; a true 12% would be ×17.549).`,
      );
    }
  }

  const coreMissing = [pvKwp, monthlyChargeExVat, currentBlendedTariff, solutionTariff].filter(
    (field) => field.value === null,
  ).length;
  if (dialect === "ufms-p4l" && coreMissing > 0) {
    warnings.push(`${coreMissing} core field(s) missing from the text layer — deck may need a vision read.`);
  }

  return {
    version: DOCUMENT_READER_VERSION,
    dialect,
    clientName,
    pvKwp,
    bessKwh,
    currentBlendedTariff,
    solutionTariff,
    monthlyChargeExVat,
    currentAnnualCost,
    claimedUtilityEscalationPct,
    tenYearUtilityForecast,
    tenYearSavingClaim,
    generationKwhPerDay,
    generationKwhPerMonth,
    contractEscalationPct,
    termYears: termYearsField,
    abortFee,
    derivedCapex,
    crosschecks,
    flags,
    warnings,
  };
}

/** Deterministic verdict for a parsed deck: verified only when the cracked-
 * engine cross-checks that ARE checkable all pass and the money fields were
 * actually read. */
export function verifyProposalExtraction(
  extraction: FunderProposalExtraction,
): VerificationResult {
  if (extraction.dialect !== "ufms-p4l") {
    return {
      status: "needs_human",
      verifier: "proposal-crosschecks",
      notes: [
        extraction.dialect === "wheeling"
          ? "Wheeling proposal dialect — no automated cross-checks yet; route to a human."
          : "Unknown proposal dialect — route to a human.",
      ],
    };
  }
  const checkable = extraction.crosschecks.filter((check) => check.pass !== null);
  const failed = checkable.filter((check) => check.pass === false);
  const moneyRead =
    extraction.monthlyChargeExVat.value !== null && extraction.derivedCapex.value !== null;
  if (moneyRead && checkable.length >= 3 && failed.length === 0) {
    return {
      status: "verified",
      verifier: "proposal-crosschecks",
      notes: [
        `All ${checkable.length} checkable cross-checks against the clone engine pass.`,
        ...extraction.flags,
      ],
    };
  }
  return {
    status: "needs_review",
    verifier: "proposal-crosschecks",
    notes: [
      failed.length > 0
        ? `Deck deviates from the funder model: ${failed
            .map((check) => `${check.name} (expected ${check.expected}, got ${check.actual})`)
            .join("; ")}`
        : "Too few fields readable from the text layer to confirm the deck against the clone engine.",
      ...extraction.flags,
      ...extraction.warnings,
    ],
  };
}

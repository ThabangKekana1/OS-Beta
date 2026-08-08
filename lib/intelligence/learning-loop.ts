/**
 * FOUNDATION-1 LEARNING LOOP — pure functions only.
 *
 * Four loops feeding the EXISTING deterministic improvement engine
 * (`improvement-engine.ts` — extended, never replaced):
 *
 *   1. ENGINE CALIBRATION — every funder-report run cross-checks THEIR
 *      stated numbers against our clone-engine prediction. The persisted
 *      comparisons are summarised here into a rolling per-field deviation;
 *      if the p50 deviation over the last five distinct proposals drifts
 *      above the tolerance the engine constant behind that field is flagged
 *      with a suggested recalibration (human-reviewed — nothing changes
 *      automatically).
 *   2. READER CORRECTIONS — operator corrections to extracted fields are
 *      labelled examples. Per-field correction rates surface the weakest
 *      reader field weekly.
 *   3. FUNNEL METRICS — doc 06 §7's stage-conversion table as a pure
 *      function over case rows + submissions + term sheets, each metric
 *      with its target and alarm threshold, plus the stuck-case list.
 *   4. WEEKLY BRIEF — deterministic Monday markdown: deal book, constraint
 *      of the week, stuck cases, calibration and reader-accuracy trends,
 *      accepted-hypothesis follow-ups.
 *
 * CONFIDENTIALITY (house rule, AGENTS.md): calibration summaries expose the
 * clone-engine constants and deviations. All outputs of this module are
 * INTERNAL (operator desk / admin) and must never reach client- or
 * partner-facing surfaces.
 */
import type { FunderReport, FunderReportCorrections } from "@/lib/funder-report";
import type { ImprovementInsightDraft } from "@/lib/intelligence/types";
import type { TelemetryEnvironment } from "@/lib/intelligence/telemetry";
import { FUNDER_CONSTANTS } from "@/lib/pricing-engine";

export const LEARNING_LOOP_VERSION = "learning-loop-2026-08-16.1";

/* ------------------------------------------------------------------ */
/* Shared math helpers.                                                 */
/* ------------------------------------------------------------------ */

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percent(part: number, total: number): number | null {
  return total > 0 ? round1((part / total) * 100) : null;
}

function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000;
}

/** ISO date (YYYY-MM-DD) of the Monday of the week containing `date` (UTC). */
export function isoWeekStart(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? 6 : day - 1;
  utc.setUTCDate(utc.getUTCDate() - diff);
  return utc.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* 1. ENGINE CALIBRATION LEDGER — drift rule.                           */
/* ------------------------------------------------------------------ */

export type EngineCalibrationRow = {
  id?: string;
  created_at: string;
  case_reference: string;
  source: "ufms" | "wheeling";
  field: string;
  predicted: number | null;
  stated: number | null;
  deviation_pct: number | null;
  tolerance_pct: number;
  pass: boolean | null;
  report_version: string;
  operator_confirmed: boolean;
};

/** The engine constant each calibrated field maps back to. */
const CALIBRATION_CONSTANTS: Record<
  string,
  { name: string; current: number; suggest: (medianStatedOverPredicted: number) => number }
> = {
  "ufms:monthlyCharge": {
    name: "FUNDER_CONSTANTS.ufmsMonthlyRateFactor",
    current: FUNDER_CONSTANTS.ufmsMonthlyRateFactor,
    // Monthly charge scales linearly with the rate factor.
    suggest: (ratio) => FUNDER_CONSTANTS.ufmsMonthlyRateFactor * ratio,
  },
  "ufms:pvKwp": {
    name: "FUNDER_CONSTANTS.templateMonthlyYieldKwhPerKwp",
    current: FUNDER_CONSTANTS.templateMonthlyYieldKwhPerKwp,
    // Stated kWp above prediction implies the funder assumes LESS yield/kWp.
    suggest: (ratio) =>
      ratio > 0
        ? FUNDER_CONSTANTS.templateMonthlyYieldKwhPerKwp / ratio
        : FUNDER_CONSTANTS.templateMonthlyYieldKwhPerKwp,
  },
  "wheeling:ratePerKwh": {
    name: "FUNDER_CONSTANTS.wheelingFirmRate",
    current: FUNDER_CONSTANTS.wheelingFirmRate,
    suggest: (ratio) => FUNDER_CONSTANTS.wheelingFirmRate * ratio,
  },
};

export type CalibrationFieldSummary = {
  source: "ufms" | "wheeling";
  field: string;
  /** Distinct proposals (cases) contributing to the rolling window. */
  sampleCases: number;
  /** p50 |deviation| % across the last `windowCases` distinct proposals. */
  rollingP50DeviationPct: number | null;
  /** Median stated/predicted ratio over the same window. */
  medianStatedOverPredicted: number | null;
  drift: boolean;
  constantName: string | null;
  currentConstant: number | null;
  suggestedConstant: number | null;
};

export type CalibrationDriftOptions = {
  /** Rolling window: last N distinct proposals per field. Default 5. */
  windowCases?: number;
  /** p50 deviation % above which the field is drifting. Default 2. */
  driftThresholdPct?: number;
};

/**
 * Rolling deviation per cross-checked field. One vote per case (latest
 * comparison wins so operator re-runs do not double count), last
 * `windowCases` proposals, p50 deviation vs the drift threshold.
 */
export function summarizeEngineCalibration(
  rows: EngineCalibrationRow[],
  options?: CalibrationDriftOptions,
): CalibrationFieldSummary[] {
  const windowCases = Math.max(2, options?.windowCases ?? 5);
  const threshold = options?.driftThresholdPct ?? 2;

  // Latest row per (source, field, case).
  const latest = new Map<string, EngineCalibrationRow>();
  for (const row of rows) {
    if (row.deviation_pct === null || !Number.isFinite(row.deviation_pct)) continue;
    const key = [row.source, row.field, row.case_reference].join("|");
    const existing = latest.get(key);
    if (!existing || row.created_at > existing.created_at) latest.set(key, row);
  }

  const byField = new Map<string, EngineCalibrationRow[]>();
  for (const row of latest.values()) {
    const key = [row.source, row.field].join(":");
    const list = byField.get(key) ?? [];
    list.push(row);
    byField.set(key, list);
  }

  const summaries: CalibrationFieldSummary[] = [];
  for (const [key, list] of byField) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const windowRows = list.slice(-windowCases);
    const deviations = windowRows
      .map((row) => Math.abs(row.deviation_pct as number))
      .filter((value) => Number.isFinite(value));
    const ratios = windowRows
      .map((row) =>
        row.stated !== null && row.predicted !== null && row.predicted !== 0
          ? row.stated / row.predicted
          : null,
      )
      .filter((value): value is number => value !== null && Number.isFinite(value));
    const p50 = median(deviations);
    const medianRatio = median(ratios);
    const drift = windowRows.length >= windowCases && p50 !== null && p50 > threshold;
    const constant = CALIBRATION_CONSTANTS[key] ?? null;
    const [source, field] = key.split(":") as ["ufms" | "wheeling", string];
    summaries.push({
      source,
      field,
      sampleCases: windowRows.length,
      rollingP50DeviationPct: p50 === null ? null : round2(p50),
      medianStatedOverPredicted: medianRatio === null ? null : Math.round(medianRatio * 10_000) / 10_000,
      drift,
      constantName: constant?.name ?? null,
      currentConstant: constant?.current ?? null,
      suggestedConstant:
        drift && constant && medianRatio !== null
          ? Math.round(constant.suggest(medianRatio) * 1_000_000) / 1_000_000
          : null,
    });
  }
  return summaries.sort((a, b) =>
    (b.rollingP50DeviationPct ?? -1) - (a.rollingP50DeviationPct ?? -1),
  );
}

/* ------------------------------------------------------------------ */
/* 2. READER CORRECTION CAPTURE — per-field correction rate.            */
/* ------------------------------------------------------------------ */

export type ReaderCorrectionRow = {
  id?: string;
  created_at: string;
  case_reference: string;
  source: "funder_report" | "bill";
  field: string;
  original_value: number | null;
  corrected_value: number | null;
  corrected_by: string;
};

export type CorrectionFieldSummary = {
  source: "funder_report" | "bill";
  field: string;
  corrections: number;
  cases: number;
  /** Share of all corrections in the window, %. */
  sharePct: number | null;
};

export type ReaderCorrectionSummary = {
  total: number;
  cases: number;
  byField: CorrectionFieldSummary[];
  topField: CorrectionFieldSummary | null;
};

export function summarizeReaderCorrections(
  rows: ReaderCorrectionRow[],
): ReaderCorrectionSummary {
  const byField = new Map<string, { source: "funder_report" | "bill"; field: string; corrections: number; cases: Set<string> }>();
  const allCases = new Set<string>();
  for (const row of rows) {
    allCases.add(row.case_reference);
    const key = [row.source, row.field].join(":");
    const current = byField.get(key) ?? {
      source: row.source,
      field: row.field,
      corrections: 0,
      cases: new Set<string>(),
    };
    current.corrections += 1;
    current.cases.add(row.case_reference);
    byField.set(key, current);
  }
  const summaries: CorrectionFieldSummary[] = Array.from(byField.values(), (entry) => ({
    source: entry.source,
    field: entry.field,
    corrections: entry.corrections,
    cases: entry.cases.size,
    sharePct: percent(entry.corrections, rows.length),
  })).sort((a, b) => b.corrections - a.corrections);
  return {
    total: rows.length,
    cases: allCases.size,
    byField: summaries,
    topField: summaries[0] ?? null,
  };
}

/**
 * Map an operator's funder-report correction set against the previously
 * stored report so each correction becomes a labelled example
 * (original machine value vs corrected human value).
 */
export function deriveFunderReportCorrectionEntries(
  previous: FunderReport | null,
  corrections: FunderReportCorrections | null | undefined,
): Array<{ field: string; originalValue: number | null; correctedValue: number }> {
  if (!corrections) return [];
  const extraction = previous?.ufmsExtraction ?? null;
  const wheeling = previous?.wheelingFields ?? null;
  const originals: Record<keyof FunderReportCorrections, number | null> = {
    ufmsMonthlyCharge: extraction?.monthlyChargeExVat.value ?? null,
    ufmsEscalationPct: extraction?.contractEscalationPct.value ?? null,
    ufmsTermYears: extraction?.termYears.value ?? null,
    pvKwp: extraction?.pvKwp.value ?? null,
    bessKwh: extraction?.bessKwh.value ?? null,
    monthlyGenerationKwh: extraction?.generationKwhPerMonth.value ?? null,
    wheelingRatePerKwh: wheeling?.firmRatePerKwh ?? null,
    wheelingEscalationPct: wheeling?.escalationCapPct ?? null,
    wheelingTermYears: wheeling?.termYears ?? null,
  };
  const entries: Array<{ field: string; originalValue: number | null; correctedValue: number }> = [];
  for (const [field, corrected] of Object.entries(corrections)) {
    if (typeof corrected !== "number" || !Number.isFinite(corrected)) continue;
    const original = originals[field as keyof FunderReportCorrections] ?? null;
    // Identical values are confirmations, not corrections.
    if (original !== null && Math.abs(original - corrected) < 1e-9) continue;
    entries.push({ field, originalValue: original, correctedValue: corrected });
  }
  return entries;
}

/* ------------------------------------------------------------------ */
/* Insight rules feeding the existing deterministic engine.             */
/* ------------------------------------------------------------------ */

export function buildLearningLoopInsights(input: {
  calibrationRows: EngineCalibrationRow[];
  correctionRows: ReaderCorrectionRow[];
  environment: TelemetryEnvironment;
  periodStart: string;
  periodEnd: string;
  options?: CalibrationDriftOptions;
}): ImprovementInsightDraft[] {
  const context = {
    environment: input.environment,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    generatedBy: "deterministic_analyzer" as const,
    generatorVersion: LEARNING_LOOP_VERSION,
  };
  const insights: ImprovementInsightDraft[] = [];

  for (const summary of summarizeEngineCalibration(input.calibrationRows, input.options)) {
    if (!summary.drift || summary.rollingP50DeviationPct === null) continue;
    insights.push({
      insightKey: `funder_pricing_drift_${summary.source}_${summary.field}`,
      category: "data_quality",
      severity: summary.rollingP50DeviationPct > 5 ? "high" : "medium",
      headline: `Funder pricing model drift: ${summary.field}`,
      evidence: `Rolling p50 deviation between the funder's stated ${summary.field} and the clone-engine prediction is ${summary.rollingP50DeviationPct}% across the last ${summary.sampleCases} proposals (median stated/predicted ${summary.medianStatedOverPredicted ?? "n/a"}).`,
      recommendation: summary.constantName
        ? `The funder appears to have re-priced. Review the last ${summary.sampleCases} funder decks and, if confirmed, recalibrate ${summary.constantName} from ${summary.currentConstant} to ~${summary.suggestedConstant} (human-reviewed change to lib/pricing-engine.ts; never automatic).`
        : `The funder appears to have re-priced ${summary.field}. Review the last ${summary.sampleCases} funder decks and recalibrate the matching engine constant (human-reviewed; never automatic).`,
      metrics: {
        source: summary.source,
        field: summary.field,
        rolling_p50_deviation_pct: summary.rollingP50DeviationPct,
        sample_cases: summary.sampleCases,
        median_stated_over_predicted: summary.medianStatedOverPredicted ?? "n/a",
        current_constant: summary.currentConstant ?? "n/a",
        suggested_constant: summary.suggestedConstant ?? "n/a",
      },
      ...context,
    });
  }

  const corrections = summarizeReaderCorrections(input.correctionRows);
  if (corrections.topField && corrections.topField.corrections >= 3) {
    const top = corrections.topField;
    insights.push({
      insightKey: "reader_top_corrected_field",
      category: "data_quality",
      severity: top.corrections >= 6 ? "medium" : "low",
      headline: `Document reader weakest field: ${top.field}`,
      evidence: `Operators corrected ${top.field} (${top.source}) ${top.corrections} times across ${top.cases} case(s) — ${top.sharePct ?? 0}% of all ${corrections.total} corrections in this window.`,
      recommendation: `Strengthen the ${top.source === "bill" ? "bill reader" : "proposal reader"} pattern for "${top.field}" using the persisted original-vs-corrected examples as the regression fixture set.`,
      metrics: {
        field: top.field,
        source: top.source,
        corrections: top.corrections,
        cases: top.cases,
        share_pct: top.sharePct ?? 0,
        total_corrections: corrections.total,
      },
      ...context,
    });
  }

  return insights;
}

/* ------------------------------------------------------------------ */
/* 3. FUNNEL METRICS — doc 06 §7 stage-conversion table.                */
/* ------------------------------------------------------------------ */

export type FunnelCaseLite = {
  id: string;
  reference: string;
  businessName: string;
  stage: string;
  createdAt: string;
  updatedAt: string;
  packCompletedAt: string | null;
  proposalReadyAt: string | null;
  eoiSignedAt: string | null;
  kycReadinessConfirmedAt: string | null;
  submittedToFunderAt: string | null;
  partnerProposalReadyAt: string | null;
  partnerProposalSignedAt: string | null;
  kycHandedOffAt: string | null;
  termSheetIssuedAt: string | null;
};

export type SubmissionLite = {
  submittedAt: string;
  outcome: "pending" | "proposal_received" | "declined" | "withdrawn";
  outcomeAt: string | null;
};

export type TermSheetLite = {
  issuedAt: string;
  dealValueRands: number;
};

export type MetricStatus = "green" | "amber" | "red" | "no_data";

export type FunnelMetric = {
  key: string;
  label: string;
  /** Primary numeric value (unit depends on the metric). Null when no data. */
  value: number | null;
  display: string;
  target: string;
  alarm: string;
  status: MetricStatus;
  detail: string;
};

export type StuckCase = {
  reference: string;
  businessName: string;
  stage: string;
  days: number;
  blockingItem: string;
};

export type FunnelMetricsInput = {
  windowDays: number;
  now: string;
  /** funnel_events counts in the window. */
  reportsGenerated: number;
  casesOpened: number;
  cases: FunnelCaseLite[];
  submissions: SubmissionLite[];
  termSheets: TermSheetLite[];
  /** ISO date the §8 ramp started (launch). Null -> deal book unscored. */
  rampStart?: string | null;
};

export type FunnelMetricsResult = {
  windowDays: number;
  generatedAt: string;
  metrics: FunnelMetric[];
  stuckCases: StuckCase[];
  dealBookRands: number;
  weeklyDrum: number;
  queueSize: number;
};

/** §8 cumulative deal-book ramp, month 1..6, rands. */
export const DEAL_BOOK_RAMP_RANDS = [
  3_000_000, 15_000_000, 35_000_000, 58_000_000, 80_000_000, 100_000_000,
] as const;

const TERMINAL_STAGES = new Set(["term_sheet_issued", "proposal_not_recommended"]);

const STAGE_BLOCKING_ITEM: Record<string, string> = {
  bill_pack_required: "Waiting on client bill upload",
  bill_pack_processing: "Bill pack processing / reader in progress",
  bill_pack_review: "Bill pack needs operator review",
  proposal_ready: "Proposal issued — awaiting client EOI signature",
  eoi_signed: "KYC readiness gate not confirmed (S7)",
  kyc_ready: "In submission-ready queue — awaiting batch submission",
  submitted_to_funder: "Awaiting funder proposal (SLA clock running)",
  partner_proposal_ready: "Funder proposal returned — awaiting client signature",
  partner_proposal_signed: "Awaiting KYC verification",
  kyc_verified: "Awaiting handoff to funder",
  kyc_handed_off: "Awaiting term sheet",
  kyc_direct_submitted: "Legacy direct submission — confirm outcome",
};

/** When the case entered its current stage (best available timestamp). */
function stageEnteredAt(item: FunnelCaseLite): string {
  const byStage: Record<string, string | null> = {
    bill_pack_required: item.createdAt,
    proposal_ready: item.proposalReadyAt,
    eoi_signed: item.eoiSignedAt,
    kyc_ready: item.kycReadinessConfirmedAt,
    submitted_to_funder: item.submittedToFunderAt,
    partner_proposal_ready: item.partnerProposalReadyAt,
    partner_proposal_signed: item.partnerProposalSignedAt,
    kyc_handed_off: item.kycHandedOffAt,
    term_sheet_issued: item.termSheetIssuedAt,
  };
  return byStage[item.stage] ?? item.updatedAt ?? item.createdAt;
}

function rag(input: {
  value: number | null;
  greenWhen: (value: number) => boolean;
  redWhen: (value: number) => boolean;
}): MetricStatus {
  if (input.value === null) return "no_data";
  if (input.redWhen(input.value)) return "red";
  if (input.greenWhen(input.value)) return "green";
  return "amber";
}

const fmtPct = (value: number | null) => (value === null ? "—" : `${value}%`);
const fmtDays = (value: number | null) => (value === null ? "—" : `${round1(value)}d`);
const fmtHours = (value: number | null) => (value === null ? "—" : `${round1(value)}h`);
const fmtRands = (value: number) =>
  `R${(value / 1_000_000).toLocaleString("en-ZA", { maximumFractionDigits: 1 })}m`;

/**
 * Doc 06 §7 — the numbers that run the weekly review. Pure: everything is
 * computed from the supplied rows; `now` is an explicit input.
 */
export function computeFunnelMetrics(input: FunnelMetricsInput): FunnelMetricsResult {
  const weeks = Math.max(input.windowDays / 7, 1 / 7);
  const metrics: FunnelMetric[] = [];
  const cases = input.cases;

  // 1. Reports / week.
  const reportsPerWeek = input.reportsGenerated > 0 || cases.length > 0
    ? round1(input.reportsGenerated / weeks)
    : null;
  metrics.push({
    key: "reports_per_week",
    label: "Reports / week",
    value: reportsPerWeek,
    display: reportsPerWeek === null ? "—" : String(reportsPerWeek),
    target: "70 (ramping to 120)",
    alarm: "< 40",
    status: rag({ value: reportsPerWeek, greenWhen: (v) => v >= 70, redWhen: (v) => v < 40 }),
    detail: `${input.reportsGenerated} reports in ${input.windowDays} days.`,
  });

  // 2. Report -> case.
  const reportToCase = percent(input.casesOpened, input.reportsGenerated);
  metrics.push({
    key: "report_to_case",
    label: "Report → case",
    value: reportToCase,
    display: fmtPct(reportToCase),
    target: "≥ 25% (assoc ≥ 40%)",
    alarm: "< 15%",
    status: rag({ value: reportToCase, greenWhen: (v) => v >= 25, redWhen: (v) => v < 15 }),
    detail: `${input.casesOpened} cases opened from ${input.reportsGenerated} reports.`,
  });

  // 3. Case -> complete pack (rate + median days).
  const packed = cases.filter((item) => item.packCompletedAt !== null);
  const packRate = percent(packed.length, cases.length);
  const packDays = median(
    packed.map((item) => daysBetween(item.createdAt, item.packCompletedAt as string)),
  );
  metrics.push({
    key: "case_to_pack",
    label: "Case → complete pack",
    value: packRate,
    display: `${fmtPct(packRate)} · median ${fmtDays(packDays)}`,
    target: "≥ 45%, median ≤ 7 days",
    alarm: "median > 14 days",
    status:
      packRate === null
        ? "no_data"
        : packDays !== null && packDays > 14
          ? "red"
          : packRate >= 45 && (packDays === null || packDays <= 7)
            ? "green"
            : "amber",
    detail: `${packed.length} of ${cases.length} cases completed a bill pack.`,
  });

  // 4. Pack -> proposal (first-pass audit yield, p50 hours).
  const proposed = packed.filter((item) => item.proposalReadyAt !== null);
  const proposalRate = percent(proposed.length, packed.length);
  const proposalHours = median(
    proposed.map(
      (item) => daysBetween(item.packCompletedAt as string, item.proposalReadyAt as string) * 24,
    ),
  );
  metrics.push({
    key: "pack_to_proposal",
    label: "Pack → proposal",
    value: proposalRate,
    display: `${fmtPct(proposalRate)} · p50 ${fmtHours(proposalHours)}`,
    target: "≥ 85%, p50 ≤ 24h",
    alarm: "p50 > 72h",
    status:
      proposalRate === null
        ? "no_data"
        : proposalHours !== null && proposalHours > 72
          ? "red"
          : proposalRate >= 85 && (proposalHours === null || proposalHours <= 24)
            ? "green"
            : "amber",
    detail: `${proposed.length} of ${packed.length} audited packs reached a proposal.`,
  });

  // 5. Proposal -> EOI.
  const withProposal = cases.filter((item) => item.proposalReadyAt !== null);
  const signed = withProposal.filter((item) => item.eoiSignedAt !== null);
  const eoiRate = percent(signed.length, withProposal.length);
  metrics.push({
    key: "proposal_to_eoi",
    label: "Proposal → EOI",
    value: eoiRate,
    display: fmtPct(eoiRate),
    target: "≥ 55%",
    alarm: "< 35%",
    status: rag({ value: eoiRate, greenWhen: (v) => v >= 55, redWhen: (v) => v < 35 }),
    detail: `${signed.length} of ${withProposal.length} proposals signed an EOI.`,
  });

  // 6. EOI -> readiness pass.
  const ready = signed.filter((item) => item.kycReadinessConfirmedAt !== null);
  const readinessRate = percent(ready.length, signed.length);
  metrics.push({
    key: "eoi_to_readiness",
    label: "EOI → readiness pass",
    value: readinessRate,
    display: fmtPct(readinessRate),
    target: "≥ 75% (Fix-It recovers half the rest)",
    alarm: "< 50%",
    status: rag({ value: readinessRate, greenWhen: (v) => v >= 75, redWhen: (v) => v < 50 }),
    detail: `${ready.length} of ${signed.length} signed EOIs passed the readiness gate.`,
  });

  // 7. Submission first-pass acceptance.
  const decided = input.submissions.filter((item) => item.outcome !== "pending");
  const bounced = decided.filter((item) => item.outcome === "declined");
  const firstPass = percent(decided.length - bounced.length, decided.length);
  metrics.push({
    key: "submission_first_pass",
    label: "Submission first-pass acceptance",
    value: firstPass,
    display: fmtPct(firstPass),
    target: "≥ 95%",
    alarm: "any bounce → root-cause same week",
    status:
      firstPass === null ? "no_data" : bounced.length > 0 ? "red" : firstPass >= 95 ? "green" : "amber",
    detail: `${bounced.length} bounce(s) across ${decided.length} decided submissions.`,
  });

  // 8. Submission -> funder proposal SLA (p50 days).
  const returned = input.submissions.filter(
    (item) => item.outcome === "proposal_received" && item.outcomeAt !== null,
  );
  const slaDays = median(
    returned.map((item) => daysBetween(item.submittedAt, item.outcomeAt as string)),
  );
  metrics.push({
    key: "submission_sla",
    label: "Submission → funder proposal (SLA)",
    value: slaDays === null ? null : round1(slaDays),
    display: fmtDays(slaDays),
    target: "≤ 7 days p50",
    alarm: "p50 > 10 days → escalation ladder",
    status: rag({
      value: slaDays,
      greenWhen: (v) => v <= 7,
      redWhen: (v) => v > 10,
    }),
    detail: `${returned.length} funder proposals returned.`,
  });

  // 9. Funder proposal -> client signature.
  const proposalsBack = cases.filter((item) => item.partnerProposalReadyAt !== null);
  const proposalsSigned = proposalsBack.filter((item) => item.partnerProposalSignedAt !== null);
  const signatureRate = percent(proposalsSigned.length, proposalsBack.length);
  metrics.push({
    key: "proposal_to_signature",
    label: "Funder proposal → client signature",
    value: signatureRate,
    display: fmtPct(signatureRate),
    target: "≥ 70%, ≤ 10 days",
    alarm: "< 50% → qualification review",
    status: rag({ value: signatureRate, greenWhen: (v) => v >= 70, redWhen: (v) => v < 50 }),
    detail: `${proposalsSigned.length} of ${proposalsBack.length} returned funder proposals signed.`,
  });

  // 10. Handoff -> term sheet.
  const handedOff = cases.filter((item) => item.kycHandedOffAt !== null);
  const termSheeted = handedOff.filter((item) => item.termSheetIssuedAt !== null);
  const handoffRate = percent(termSheeted.length, handedOff.length);
  metrics.push({
    key: "handoff_to_term_sheet",
    label: "Handoff → term sheet",
    value: handoffRate,
    display: fmtPct(handoffRate),
    target: "≥ 90%",
    alarm: "any decline → credit-screen review",
    status: rag({ value: handoffRate, greenWhen: (v) => v >= 90, redWhen: (v) => v < 50 }),
    detail: `${termSheeted.length} of ${handedOff.length} handoffs reached a term sheet.`,
  });

  // 11. Deal book (term-sheet R, cumulative).
  const dealBookRands = input.termSheets.reduce(
    (total, sheet) => total + (Number.isFinite(sheet.dealValueRands) ? sheet.dealValueRands : 0),
    0,
  );
  let rampTarget: number | null = null;
  if (input.rampStart) {
    const monthsIn = Math.max(
      1,
      Math.ceil(daysBetween(input.rampStart, input.now) / 30.44),
    );
    rampTarget = DEAL_BOOK_RAMP_RANDS[Math.min(monthsIn, DEAL_BOOK_RAMP_RANDS.length) - 1];
  }
  // "2 weeks behind ramp" ≈ trailing the target by more than half a month's step.
  const dealBookStatus: MetricStatus =
    rampTarget === null
      ? "no_data"
      : dealBookRands >= rampTarget
        ? "green"
        : dealBookRands >= rampTarget * 0.5
          ? "amber"
          : "red";
  metrics.push({
    key: "deal_book",
    label: "Deal book (term-sheet R, cumulative)",
    value: dealBookRands,
    display: fmtRands(dealBookRands),
    target: rampTarget === null ? "per §8 ramp (R100m by M6)" : `${fmtRands(rampTarget)} (§8 ramp)`,
    alarm: "2 weeks behind ramp → constraint review",
    status: dealBookStatus,
    detail: `${input.termSheets.length} term sheet(s) recorded.`,
  });

  // 12. Buffer: submission-ready queue vs the weekly drum.
  const queueSize = cases.filter((item) => item.stage === "kyc_ready").length;
  const weeklyDrum = round1(input.submissions.length / weeks);
  const bufferRatio = weeklyDrum > 0 ? round1(queueSize / weeklyDrum) : null;
  metrics.push({
    key: "submission_buffer",
    label: "Buffer: submission-ready queue",
    value: bufferRatio,
    display: bufferRatio === null ? `${queueSize} queued` : `${queueSize} queued · ${bufferRatio}× drum`,
    target: "1.5–2× weekly drum",
    alarm: "< 1 week of drum",
    status: rag({ value: bufferRatio, greenWhen: (v) => v >= 1.5, redWhen: (v) => v < 1 }),
    detail: `Drum ${weeklyDrum} submissions/week; ${queueSize} case(s) submission-ready.`,
  });

  // Where cases are stuck.
  const stuckCases: StuckCase[] = cases
    .filter((item) => !TERMINAL_STAGES.has(item.stage))
    .map((item) => ({
      reference: item.reference,
      businessName: item.businessName,
      stage: item.stage,
      days: Math.floor(daysBetween(stageEnteredAt(item), input.now)),
      blockingItem: STAGE_BLOCKING_ITEM[item.stage] ?? "Review stage owner and next action",
    }))
    .filter((item) => item.days >= 7)
    .sort((a, b) => b.days - a.days)
    .slice(0, 25);

  return {
    windowDays: input.windowDays,
    generatedAt: input.now,
    metrics,
    stuckCases,
    dealBookRands,
    weeklyDrum,
    queueSize,
  };
}

/* ------------------------------------------------------------------ */
/* 4. WEEKLY REPORT — deterministic Monday brief (pure -> markdown).    */
/* ------------------------------------------------------------------ */

export type WeeklyBriefInput = {
  /** ISO timestamp the brief is generated for (explicit for determinism). */
  generatedAt: string;
  /** ISO Monday date of the week under review. */
  weekStart: string;
  environment: string;
  funnel: FunnelMetricsResult;
  calibration: CalibrationFieldSummary[];
  corrections: ReaderCorrectionSummary;
  /** Accepted (not yet implemented) hypotheses needing follow-up. */
  acceptedInsights: Array<{ headline: string; recommendation: string }>;
};

/** Constraint priority when several metrics are red (drum first). */
const CONSTRAINT_PRIORITY = [
  "submission_first_pass",
  "submission_sla",
  "deal_book",
  "submission_buffer",
  "pack_to_proposal",
  "case_to_pack",
  "handoff_to_term_sheet",
  "proposal_to_signature",
  "eoi_to_readiness",
  "proposal_to_eoi",
  "report_to_case",
  "reports_per_week",
];

export function pickConstraintOfTheWeek(metrics: FunnelMetric[]): FunnelMetric | null {
  for (const status of ["red", "amber"] as const) {
    const candidates = metrics.filter((metric) => metric.status === status);
    if (candidates.length === 0) continue;
    candidates.sort(
      (a, b) => CONSTRAINT_PRIORITY.indexOf(a.key) - CONSTRAINT_PRIORITY.indexOf(b.key),
    );
    return candidates[0];
  }
  return null;
}

const STATUS_MARK: Record<MetricStatus, string> = {
  green: "🟢",
  amber: "🟠",
  red: "🔴",
  no_data: "⚪",
};

/**
 * The Monday brief. Deterministic: same input, same markdown. INTERNAL —
 * calibration numbers expose the clone engine and must never be sent to
 * clients, partners or funders.
 */
export function buildWeeklyBrief(input: WeeklyBriefInput): string {
  const { funnel } = input;
  const constraint = pickConstraintOfTheWeek(funnel.metrics);
  const lines: string[] = [
    "# Foundation-1 weekly operating brief",
    "",
    `Week of ${input.weekStart} · generated ${input.generatedAt} · environment ${input.environment}`,
    "",
    "INTERNAL — contains clone-engine calibration. Never client- or partner-facing.",
    "",
    "## Deal book",
    "",
    `- Cumulative term-sheet value: **R${funnel.dealBookRands.toLocaleString("en-ZA")}**`,
    `- Submission drum: ${funnel.weeklyDrum} submissions/week · queue ${funnel.queueSize} case(s) submission-ready`,
    "",
    "## Constraint of the week",
    "",
    constraint
      ? `**${constraint.label}** — ${STATUS_MARK[constraint.status]} ${constraint.display} (target ${constraint.target}; alarm ${constraint.alarm}). ${constraint.detail}`
      : "No red or amber funnel metric this week. The constraint has moved outside the measured funnel — re-identify it.",
    "",
    "## Funnel vs targets (doc 06 §7)",
    "",
    "| Metric | Value | Target | Alarm | Status |",
    "|---|---|---|---|---|",
    ...funnel.metrics.map(
      (metric) =>
        `| ${metric.label} | ${metric.display} | ${metric.target} | ${metric.alarm} | ${STATUS_MARK[metric.status]} ${metric.status} |`,
    ),
    "",
    "## Where cases are stuck",
    "",
    ...(funnel.stuckCases.length
      ? funnel.stuckCases.map(
          (item) =>
            `- ${item.reference} (${item.businessName}) — ${item.days}d in ${item.stage}: ${item.blockingItem}`,
        )
      : ["- No case has sat in a stage for 7+ days."]),
    "",
    "## Engine calibration (clone vs funder paper)",
    "",
    ...(input.calibration.length
      ? input.calibration.map((summary) => {
          const drift = summary.drift
            ? ` **DRIFT** → suggest ${summary.constantName} ≈ ${summary.suggestedConstant}`
            : "";
          return `- ${summary.source}.${summary.field}: p50 deviation ${summary.rollingP50DeviationPct ?? "—"}% over last ${summary.sampleCases} proposal(s)${drift}`;
        })
      : ["- No funder-report cross-checks recorded yet."]),
    "",
    "## Reader accuracy trend",
    "",
    input.corrections.total === 0
      ? "- No operator corrections recorded — extractions held or passed clean."
      : `- ${input.corrections.total} correction(s) across ${input.corrections.cases} case(s).`,
    ...input.corrections.byField
      .slice(0, 5)
      .map(
        (field) =>
          `- ${field.field} (${field.source}): ${field.corrections} correction(s) · ${field.sharePct ?? 0}% of all`,
      ),
    "",
    "## Accepted-hypothesis follow-ups",
    "",
    ...(input.acceptedInsights.length
      ? input.acceptedInsights.map(
          (item) => `- [ ] ${item.headline} — ${item.recommendation}`,
        )
      : ["- No accepted hypotheses awaiting implementation."]),
    "",
  ];
  return lines.join("\n");
}

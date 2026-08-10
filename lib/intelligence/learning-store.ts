/**
 * FOUNDATION-1 LEARNING LOOP — storage layer.
 *
 * Side-effectful counterpart of `learning-loop.ts` (which stays pure). All
 * writers here are fire-and-forget safe: they never throw, so persisting a
 * calibration row or a correction example can NEVER break the funder-report
 * pipeline or the operator confirm path. All readers degrade gracefully when
 * `20260816130000_learning_loop.sql` has not been applied yet.
 */
import type { FunderReport } from "@/lib/funder-report";
import {
  buildWeeklyBrief,
  computeFunnelMetrics,
  isoWeekStart,
  LEARNING_LOOP_VERSION,
  summarizeEngineCalibration,
  summarizeReaderCorrections,
  type EngineCalibrationRow,
  type FunnelCaseLite,
  type FunnelMetricsResult,
  type ReaderCorrectionRow,
  type SubmissionLite,
  type TermSheetLite,
} from "@/lib/intelligence/learning-loop";
import type { TelemetryEnvironment } from "@/lib/intelligence/telemetry";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function isMissingSchemaError(message: string) {
  return /does not exist|schema cache|relation|column/i.test(message);
}

/** Local copy of the runtime-environment probe (avoids a store.ts cycle). */
function detectEnvironment(): TelemetryEnvironment {
  if (process.env.NODE_ENV === "test") return "test";
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "preview";
  return "development";
}

/* ------------------------------------------------------------------ */
/* Writers (never throw).                                              */
/* ------------------------------------------------------------------ */

/**
 * Persist every cross-check of a funder report into the calibration ledger:
 * their stated number, our prediction, the deviation. Called from the
 * funder-report pipeline after each run; guarded so reporting never breaks.
 */
export async function persistEngineCalibration(input: {
  report: FunderReport;
  environment?: TelemetryEnvironment;
}): Promise<{ persisted: number }> {
  try {
    const client = getSupabaseAdminClient();
    if (!client) return { persisted: 0 };
    const environment = input.environment ?? detectEnvironment();
    const rows = input.report.crosschecks.map((row) => ({
      environment,
      case_reference: input.report.caseReference.slice(0, 80),
      source: row.source,
      field: row.field.slice(0, 80),
      predicted: row.predicted,
      stated: row.stated,
      deviation_pct: Number.isFinite(row.deviationPct ?? NaN) ? row.deviationPct : null,
      tolerance_pct: row.tolerancePct,
      pass: row.pass,
      report_version: input.report.version,
      operator_confirmed: input.report.operatorConfirmed,
    }));
    if (rows.length === 0) return { persisted: 0 };
    const { error } = await client.from("foundation1_engine_calibration").insert(rows);
    if (error) return { persisted: 0 };
    return { persisted: rows.length };
  } catch {
    return { persisted: 0 };
  }
}

/**
 * Persist operator corrections as labelled examples (original machine value
 * vs corrected human value). Never throws.
 */
export async function persistReaderCorrections(input: {
  caseReference: string;
  source: "funder_report" | "bill";
  entries: Array<{ field: string; originalValue: number | null; correctedValue: number }>;
  correctedBy: string;
  context?: Record<string, unknown>;
  environment?: TelemetryEnvironment;
}): Promise<{ persisted: number }> {
  try {
    if (input.entries.length === 0) return { persisted: 0 };
    const client = getSupabaseAdminClient();
    if (!client) return { persisted: 0 };
    const environment = input.environment ?? detectEnvironment();
    const rows = input.entries.map((entry) => ({
      environment,
      case_reference: input.caseReference.slice(0, 80),
      source: input.source,
      field: entry.field.slice(0, 80),
      original_value: entry.originalValue,
      corrected_value: entry.correctedValue,
      corrected_by: input.correctedBy.slice(0, 220),
      context: input.context ?? {},
    }));
    const { error } = await client.from("foundation1_reader_corrections").insert(rows);
    if (error) return { persisted: 0 };
    return { persisted: rows.length };
  } catch {
    return { persisted: 0 };
  }
}

/* ------------------------------------------------------------------ */
/* Readers (schema-tolerant).                                          */
/* ------------------------------------------------------------------ */

export async function readEngineCalibrationRows(input?: {
  days?: number;
  environment?: TelemetryEnvironment;
}): Promise<EngineCalibrationRow[]> {
  const client = getSupabaseAdminClient();
  if (!client) return [];
  const days = Math.max(1, Math.min(365, input?.days ?? 90));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await client
    .from("foundation1_engine_calibration")
    .select("*")
    .eq("environment", input?.environment ?? detectEnvironment())
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) {
    if (isMissingSchemaError(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as EngineCalibrationRow[];
}

export async function readReaderCorrectionRows(input?: {
  days?: number;
  environment?: TelemetryEnvironment;
}): Promise<ReaderCorrectionRow[]> {
  const client = getSupabaseAdminClient();
  if (!client) return [];
  const days = Math.max(1, Math.min(365, input?.days ?? 90));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await client
    .from("foundation1_reader_corrections")
    .select("*")
    .eq("environment", input?.environment ?? detectEnvironment())
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) {
    if (isMissingSchemaError(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as ReaderCorrectionRow[];
}

/* ------------------------------------------------------------------ */
/* Funnel metrics inputs — read the transactional truth (read-only).    */
/* ------------------------------------------------------------------ */

type MigrationCaseFunnelRow = {
  id: string;
  public_reference: string;
  business_name: string;
  stage: string;
  created_at: string;
  updated_at: string;
  proposal_ready_at: string | null;
  eoi_signed_at: string | null;
  kyc_readiness_confirmed_at: string | null;
  submitted_to_funder_at: string | null;
  partner_proposal_ready_at: string | null;
  partner_proposal_signed_at: string | null;
  kyc_handed_off_at: string | null;
  term_sheet_issued_at: string | null;
};

/**
 * Official launch date for the six-month deal-book ramp (doc 06 §8).
 * Set by the founder: go-live moved to Monday 2026-08-17 (testing Tue 11 + Wed 12, then
 * website repositioning, then email packaging). Confirm before launch week. Override with FUNNEL_RAMP_START (YYYY-MM-DD) without a
 * code change.
 */
export const FUNNEL_RAMP_START = process.env.FUNNEL_RAMP_START?.trim() || "2026-08-17";

export async function readFunnelMetrics(input?: {
  windowDays?: number;
  now?: Date;
  rampStart?: string | null;
}): Promise<FunnelMetricsResult | null> {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  const windowDays = Math.max(7, Math.min(90, input?.windowDays ?? 28));
  const now = input?.now ?? new Date();
  const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString();

  const [caseResult, packResult, submissionResult, termSheetResult, funnelResult] =
    await Promise.all([
      client
        .from("migration_cases")
        .select(
          "id, public_reference, business_name, stage, created_at, updated_at, proposal_ready_at, eoi_signed_at, kyc_readiness_confirmed_at, submitted_to_funder_at, partner_proposal_ready_at, partner_proposal_signed_at, kyc_handed_off_at, term_sheet_issued_at",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000),
      client
        .from("migration_case_bill_packs")
        .select("case_id, completed_at, status")
        .eq("status", "ready")
        .gte("created_at", since)
        .limit(4000),
      client
        .from("migration_case_submissions")
        .select("submitted_at, outcome, outcome_at")
        .gte("submitted_at", since)
        .limit(2000),
      client
        .from("migration_case_term_sheets")
        .select("issued_at, deal_value_rands")
        .limit(2000),
      client
        .from("funnel_events")
        .select("event")
        .gte("created_at", since)
        .in("event", ["report_generated", "case_opened"])
        .limit(20000),
    ]);

  const firstHardError = [
    caseResult.error,
    packResult.error,
    submissionResult.error,
    termSheetResult.error,
    funnelResult.error,
  ].find((error) => error && !isMissingSchemaError(error.message));
  if (firstHardError) throw new Error(firstHardError.message);

  const packByCase = new Map<string, string>();
  for (const row of (packResult.data ?? []) as Array<{
    case_id: string;
    completed_at: string | null;
  }>) {
    if (!row.completed_at) continue;
    const existing = packByCase.get(row.case_id);
    if (!existing || row.completed_at < existing) packByCase.set(row.case_id, row.completed_at);
  }

  const cases: FunnelCaseLite[] = ((caseResult.data ?? []) as MigrationCaseFunnelRow[]).map(
    (row) => ({
      id: row.id,
      reference: row.public_reference,
      businessName: row.business_name,
      stage: row.stage,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      packCompletedAt: packByCase.get(row.id) ?? null,
      proposalReadyAt: row.proposal_ready_at,
      eoiSignedAt: row.eoi_signed_at,
      kycReadinessConfirmedAt: row.kyc_readiness_confirmed_at,
      submittedToFunderAt: row.submitted_to_funder_at,
      partnerProposalReadyAt: row.partner_proposal_ready_at,
      partnerProposalSignedAt: row.partner_proposal_signed_at,
      kycHandedOffAt: row.kyc_handed_off_at,
      termSheetIssuedAt: row.term_sheet_issued_at,
    }),
  );

  const submissions: SubmissionLite[] = (
    (submissionResult.data ?? []) as Array<{
      submitted_at: string;
      outcome: SubmissionLite["outcome"];
      outcome_at: string | null;
    }>
  ).map((row) => ({
    submittedAt: row.submitted_at,
    outcome: row.outcome,
    outcomeAt: row.outcome_at,
  }));

  const termSheets: TermSheetLite[] = (
    (termSheetResult.data ?? []) as Array<{ issued_at: string; deal_value_rands: number }>
  ).map((row) => ({ issuedAt: row.issued_at, dealValueRands: row.deal_value_rands }));

  const funnelRows = (funnelResult.data ?? []) as Array<{ event: string }>;
  const reportsGenerated = funnelRows.filter((row) => row.event === "report_generated").length;
  const casesOpened = funnelRows.filter((row) => row.event === "case_opened").length;

  return computeFunnelMetrics({
    windowDays,
    now: now.toISOString(),
    reportsGenerated,
    casesOpened,
    cases,
    submissions,
    termSheets,
    rampStart: input?.rampStart ?? FUNNEL_RAMP_START,
  });
}

/* ------------------------------------------------------------------ */
/* Weekly brief — assembly, storage and retrieval.                      */
/* ------------------------------------------------------------------ */

export type WeeklyBriefRow = {
  id: string;
  created_at: string;
  updated_at: string;
  week_start: string;
  environment: string;
  markdown: string;
  metrics: Record<string, unknown>;
  generator_version: string;
};

/** Assemble the Monday brief from live data (no storage). */
export async function assembleWeeklyBrief(input?: {
  now?: Date;
  environment?: TelemetryEnvironment;
}): Promise<{ weekStart: string; markdown: string; funnel: FunnelMetricsResult | null }> {
  const now = input?.now ?? new Date();
  const environment = input?.environment ?? detectEnvironment();
  const weekStart = isoWeekStart(now);

  const [funnel, calibrationRows, correctionRows, acceptedInsights] = await Promise.all([
    readFunnelMetrics({ now }).catch(() => null),
    readEngineCalibrationRows({ environment }).catch(() => [] as EngineCalibrationRow[]),
    readReaderCorrectionRows({ environment }).catch(() => [] as ReaderCorrectionRow[]),
    readAcceptedInsights(environment).catch(
      () => [] as Array<{ headline: string; recommendation: string }>,
    ),
  ]);

  const markdown = buildWeeklyBrief({
    generatedAt: now.toISOString(),
    weekStart,
    environment,
    funnel:
      funnel ??
      computeFunnelMetrics({
        windowDays: 28,
        now: now.toISOString(),
        reportsGenerated: 0,
        casesOpened: 0,
        cases: [],
        submissions: [],
        termSheets: [],
      }),
    calibration: summarizeEngineCalibration(calibrationRows),
    corrections: summarizeReaderCorrections(correctionRows),
    acceptedInsights,
  });
  return { weekStart, markdown, funnel };
}

async function readAcceptedInsights(
  environment: TelemetryEnvironment,
): Promise<Array<{ headline: string; recommendation: string }>> {
  const client = getSupabaseAdminClient();
  if (!client) return [];
  const { data, error } = await client
    .from("foundation1_improvement_insights")
    .select("headline, recommendation")
    .eq("environment", environment)
    .eq("status", "accepted")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) return [];
  return (data ?? []) as Array<{ headline: string; recommendation: string }>;
}

/**
 * Generate + store this week's brief. Called from the existing 03:00 UTC
 * learning-cycle cron when it is Monday (UTC), and manually from the admin
 * dashboard. Never throws.
 */
export async function generateAndStoreWeeklyBrief(input?: {
  now?: Date;
  environment?: TelemetryEnvironment;
  force?: boolean;
}): Promise<{ generated: boolean; weekStart?: string; reason?: string }> {
  try {
    const now = input?.now ?? new Date();
    const environment = input?.environment ?? detectEnvironment();
    if (!input?.force && now.getUTCDay() !== 1) {
      return { generated: false, reason: "Not Monday (UTC); brief generates weekly." };
    }
    const client = getSupabaseAdminClient();
    if (!client) return { generated: false, reason: "Supabase admin unavailable." };
    const { weekStart, markdown, funnel } = await assembleWeeklyBrief({ now, environment });
    const { error } = await client.from("foundation1_weekly_briefs").upsert(
      {
        week_start: weekStart,
        environment,
        markdown,
        metrics: funnel ? { metrics: funnel.metrics, stuckCases: funnel.stuckCases } : {},
        generator_version: LEARNING_LOOP_VERSION,
        updated_at: now.toISOString(),
      },
      { onConflict: "week_start,environment" },
    );
    if (error) {
      return {
        generated: false,
        reason: isMissingSchemaError(error.message)
          ? "Weekly-brief storage missing; apply 20260816130000_learning_loop.sql."
          : error.message,
      };
    }
    return { generated: true, weekStart };
  } catch (error) {
    return {
      generated: false,
      reason: error instanceof Error ? error.message : "Weekly brief failed.",
    };
  }
}

export async function readLatestWeeklyBrief(input?: {
  environment?: TelemetryEnvironment;
}): Promise<WeeklyBriefRow | null> {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  const { data, error } = await client
    .from("foundation1_weekly_briefs")
    .select("*")
    .eq("environment", input?.environment ?? detectEnvironment())
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingSchemaError(error.message)) return null;
    throw new Error(error.message);
  }
  return (data ?? null) as WeeklyBriefRow | null;
}

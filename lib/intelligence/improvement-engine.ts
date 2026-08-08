import {
  buildLearningLoopInsights,
  type EngineCalibrationRow,
  type ReaderCorrectionRow,
} from "@/lib/intelligence/learning-loop";
import type {
  BehaviorEventRow,
  GraphRunRow,
  ImprovementInsightDraft,
} from "@/lib/intelligence/types";
import type { TelemetryEnvironment } from "@/lib/intelligence/telemetry";

export const IMPROVEMENT_ENGINE_VERSION = "2026-08-16.1";

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function uniqueSessions(events: BehaviorEventRow[]) {
  return new Set(events.map((event) => event.session_hash)).size;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function insight(
  draft: Omit<
    ImprovementInsightDraft,
    "environment" | "periodStart" | "periodEnd" | "generatedBy" | "generatorVersion"
  >,
  context: {
    environment: TelemetryEnvironment;
    periodStart: string;
    periodEnd: string;
  },
): ImprovementInsightDraft {
  return {
    ...draft,
    ...context,
    generatedBy: "deterministic_analyzer",
    generatorVersion: IMPROVEMENT_ENGINE_VERSION,
  };
}

export function buildImprovementInsights(input: {
  events: BehaviorEventRow[];
  graphRuns: GraphRunRow[];
  environment: TelemetryEnvironment;
  periodEnd?: Date;
  days?: number;
  /** Learning-loop feeds (optional; the engine works without them). */
  calibrationRows?: EngineCalibrationRow[];
  correctionRows?: ReaderCorrectionRow[];
}) {
  const days = Math.max(1, Math.min(90, input.days ?? 30));
  const end = input.periodEnd ?? new Date();
  const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const context = {
    environment: input.environment,
    periodStart: dateOnly(start),
    periodEnd: dateOnly(end),
  };
  const insights: ImprovementInsightDraft[] = [];
  const pageViews = input.events.filter((event) => event.event_name === "page_view");
  const pricingViews = pageViews.filter((event) => event.page_key === "/pricing");
  const caseViews = pageViews.filter((event) =>
    event.page_key.startsWith("/migration/case/"),
  );
  const pricingSessions = uniqueSessions(pricingViews);
  const caseSessions = uniqueSessions(caseViews);
  const pricingToCaseRate = percent(caseSessions, pricingSessions);

  if (pricingSessions >= 10 && pricingToCaseRate < 20) {
    insights.push(
      insight(
        {
          insightKey: "pricing_to_case_progression_low",
          category: "funnel",
          severity: pricingToCaseRate < 10 ? "high" : "medium",
          headline: "Pricing visitors are not progressing into migration cases",
          evidence: `${pricingSessions} sessions viewed pricing; ${caseSessions} reached a redacted migration-case workspace (${pricingToCaseRate}%).`,
          recommendation:
            "Review the pricing result CTA, case-creation explanation and trust signals. Run a controlled copy or layout test; do not change qualification or calculations.",
          metrics: {
            pricing_sessions: pricingSessions,
            case_sessions: caseSessions,
            progression_percent: pricingToCaseRate,
          },
        },
        context,
      ),
    );
  }

  const formSubmits = input.events.filter(
    (event) => event.event_name === "form_submit",
  );
  const interactionEvents = input.events.filter(
    (event) => event.event_name === "interaction",
  );
  const interactionToSubmitRate = percent(
    uniqueSessions(formSubmits),
    uniqueSessions(interactionEvents),
  );
  if (uniqueSessions(interactionEvents) >= 15 && interactionToSubmitRate < 25) {
    insights.push(
      insight(
        {
          insightKey: "interaction_to_submit_friction",
          category: "friction",
          severity: "medium",
          headline: "High interaction volume is not turning into form submissions",
          evidence: `${uniqueSessions(interactionEvents)} sessions interacted with controls; ${uniqueSessions(formSubmits)} submitted a form (${interactionToSubmitRate}%).`,
          recommendation:
            "Inspect the most-used page and target-path aggregates for confusing controls, unnecessary fields or weak next-step clarity.",
          metrics: {
            interaction_sessions: uniqueSessions(interactionEvents),
            submit_sessions: uniqueSessions(formSubmits),
            submit_percent: interactionToSubmitRate,
          },
        },
        context,
      ),
    );
  }

  const engaged = input.events.filter(
    (event) =>
      event.event_name === "engagement" &&
      Number(event.properties.seconds ?? 0) >= 60,
  );
  const overallSessions = uniqueSessions(input.events);
  const deepEngagementRate = percent(uniqueSessions(engaged), overallSessions);
  if (overallSessions >= 20 && deepEngagementRate < 15) {
    insights.push(
      insight(
        {
          insightKey: "deep_engagement_low",
          category: "engagement",
          severity: "low",
          headline: "Few sessions reach a 60-second engagement milestone",
          evidence: `${uniqueSessions(engaged)} of ${overallSessions} observed sessions reached 60 seconds (${deepEngagementRate}%).`,
          recommendation:
            "Compare page-level engagement and progression. Prioritize clearer above-the-fold value and faster access to pricing or the next migration action.",
          metrics: {
            sessions: overallSessions,
            engaged_sessions: uniqueSessions(engaged),
            engaged_percent: deepEngagementRate,
          },
        },
        context,
      ),
    );
  }

  const completedRuns = input.graphRuns.filter((run) =>
    ["succeeded", "failed", "needs_review"].includes(run.status),
  );
  const unsuccessfulRuns = completedRuns.filter(
    (run) => run.status !== "succeeded",
  );
  const graphFailureRate = percent(unsuccessfulRuns.length, completedRuns.length);
  if (completedRuns.length >= 5 && graphFailureRate > 25) {
    insights.push(
      insight(
        {
          insightKey: "graph_quality_below_threshold",
          category: "graph_quality",
          severity: graphFailureRate > 50 ? "high" : "medium",
          headline: "Too many bounded graph runs need review or fail",
          evidence: `${unsuccessfulRuns.length} of ${completedRuns.length} completed graph runs were not successful (${graphFailureRate}%).`,
          recommendation:
            "Use the Codex operations brief to inspect failure reasons, verifier flags and weak input contracts before changing prompts or adding workers.",
          metrics: {
            completed_runs: completedRuns.length,
            unsuccessful_runs: unsuccessfulRuns.length,
            unsuccessful_percent: graphFailureRate,
          },
        },
        context,
      ),
    );
  }

  // Learning-loop rules: engine-calibration drift + reader-correction rate.
  insights.push(
    ...buildLearningLoopInsights({
      calibrationRows: input.calibrationRows ?? [],
      correctionRows: input.correctionRows ?? [],
      environment: context.environment,
      periodStart: context.periodStart,
      periodEnd: context.periodEnd,
    }),
  );

  if (input.events.length < 25) {
    insights.push(
      insight(
        {
          insightKey: "insufficient_behavior_sample",
          category: "data_quality",
          severity: "info",
          headline: "Not enough consented behavioural data for strong conclusions",
          evidence: `${input.events.length} allowlisted events are available in this window.`,
          recommendation:
            "Keep collection active through real and test journeys. Do not introduce machine-learning models until there is enough labelled outcome data.",
          metrics: { event_count: input.events.length },
        },
        context,
      ),
    );
  }

  return insights;
}

export function summarizeIntelligence(input: {
  events: BehaviorEventRow[];
  graphRuns: GraphRunRow[];
}) {
  const pageViews = input.events.filter((event) => event.event_name === "page_view");
  const pages = new Map<string, { views: number; sessions: Set<string> }>();
  for (const event of pageViews) {
    const current = pages.get(event.page_key) ?? {
      views: 0,
      sessions: new Set<string>(),
    };
    current.views += 1;
    current.sessions.add(event.session_hash);
    pages.set(event.page_key, current);
  }
  return {
    eventCount: input.events.length,
    sessionCount: uniqueSessions(input.events),
    graphRunCount: input.graphRuns.length,
    successfulGraphRuns: input.graphRuns.filter(
      (run) => run.status === "succeeded",
    ).length,
    pages: Array.from(pages, ([pageKey, value]) => ({
      pageKey,
      views: value.views,
      sessions: value.sessions.size,
    }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 12),
  };
}

import { createHash } from "node:crypto";
import type { GraphRunResult } from "@/lib/agent-graph/contracts";
import type { GraphDefinition } from "@/lib/agent-graph/contracts";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  buildImprovementInsights,
  IMPROVEMENT_ENGINE_VERSION,
} from "@/lib/intelligence/improvement-engine";
import {
  readEngineCalibrationRows,
  readReaderCorrectionRows,
} from "@/lib/intelligence/learning-store";
import type {
  AcceptedTelemetryEvent,
  TelemetryEnvironment,
} from "@/lib/intelligence/telemetry";
import type {
  BehaviorEventRow,
  GraphRunRow,
  ImprovementInsightRow,
  IntelligenceSnapshot,
} from "@/lib/intelligence/types";

function isMissingSchemaError(message: string) {
  return /does not exist|schema cache|relation|column/i.test(message);
}

export function runtimeEnvironment(): TelemetryEnvironment {
  if (process.env.NODE_ENV === "test") return "test";
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "preview";
  return "development";
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function digest(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export async function insertBehaviorEvents(events: AcceptedTelemetryEvent[]) {
  if (!events.length) return { accepted: 0, persisted: true };
  const client = getSupabaseAdminClient();
  if (!client) {
    if (runtimeEnvironment() === "production") {
      throw new Error("Telemetry storage is unavailable.");
    }
    return { accepted: events.length, persisted: false };
  }
  const rows = events.map((event) => ({
    id: event.id,
    occurred_at: event.occurredAt,
    environment: event.environment,
    surface: event.surface,
    event_name: event.eventName,
    page_key: event.pageKey,
    visitor_hash: event.visitorHash,
    session_hash: event.sessionHash,
    consent_basis: event.consentBasis,
    properties: event.properties,
    schema_version: event.schemaVersion,
  }));
  const { error } = await client
    .from("foundation1_behavior_events")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return { accepted: events.length, persisted: true };
}

export async function readIntelligenceSnapshot(input?: {
  days?: number;
  environment?: TelemetryEnvironment;
}): Promise<IntelligenceSnapshot> {
  const days = Math.max(1, Math.min(90, input?.days ?? 30));
  const environment = input?.environment ?? runtimeEnvironment();
  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();

  const client = getSupabaseAdminClient();
  if (!client) {
    return {
      configured: false,
      schemaReady: false,
      environment,
      days,
      events: [],
      graphRuns: [],
      insights: [],
      message: "Supabase admin configuration is unavailable.",
    };
  }
  const [eventResult, graphResult, insightResult] = await Promise.all([
    client
      .from("foundation1_behavior_events")
      .select("*")
      .eq("environment", environment)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(5000),
    client
      .from("foundation1_graph_runs")
      .select("*")
      .eq("environment", environment)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("foundation1_improvement_insights")
      .select("*")
      .eq("environment", environment)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const firstError =
    eventResult.error ?? graphResult.error ?? insightResult.error ?? null;
  if (firstError && !isMissingSchemaError(firstError.message)) {
    throw new Error(firstError.message);
  }
  const schemaReady = !firstError;

  return {
    configured: true,
    schemaReady,
    environment,
    days,
    events: schemaReady ? ((eventResult.data ?? []) as BehaviorEventRow[]) : [],
    graphRuns: schemaReady
      ? ((graphResult.data ?? []) as GraphRunRow[])
      : [],
    insights: schemaReady
      ? ((insightResult.data ?? []) as ImprovementInsightRow[])
      : [],
    message: schemaReady
      ? undefined
      : "The intelligence migration has not been applied.",
  };
}

async function rollupBehaviorMetrics(
  events: BehaviorEventRow[],
  environment: TelemetryEnvironment,
) {
  const client = getSupabaseAdminClient();
  if (!client || !events.length) return;
  const groups = new Map<
    string,
    {
      metric_date: string;
      environment: TelemetryEnvironment;
      surface: string;
      event_name: string;
      page_key: string;
      event_count: number;
      sessions: Set<string>;
    }
  >();
  for (const event of events) {
    const metricDate = event.occurred_at.slice(0, 10);
    const key = [
      metricDate,
      environment,
      event.surface,
      event.event_name,
      event.page_key,
    ].join("|");
    const current = groups.get(key) ?? {
      metric_date: metricDate,
      environment,
      surface: event.surface,
      event_name: event.event_name,
      page_key: event.page_key,
      event_count: 0,
      sessions: new Set<string>(),
    };
    current.event_count += 1;
    current.sessions.add(event.session_hash);
    groups.set(key, current);
  }
  const rows = Array.from(groups.values()).map((group) => ({
    metric_date: group.metric_date,
    environment: group.environment,
    surface: group.surface,
    event_name: group.event_name,
    page_key: group.page_key,
    event_count: group.event_count,
    session_count: group.sessions.size,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await client
    .from("foundation1_behavior_daily_metrics")
    .upsert(rows, {
      onConflict: "metric_date,environment,surface,event_name,page_key",
    });
  if (error) throw new Error(error.message);
}

export async function runImprovementLearningCycle(input?: {
  environment?: TelemetryEnvironment;
  days?: number;
}) {
  const environment = input?.environment ?? runtimeEnvironment();
  const days = Math.max(1, Math.min(90, input?.days ?? 30));
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin configuration is unavailable.");
  const snapshot = await readIntelligenceSnapshot({ environment, days });
  if (!snapshot.schemaReady) {
    throw new Error(snapshot.message ?? "Intelligence schema is unavailable.");
  }

  await rollupBehaviorMetrics(snapshot.events, environment);
  // Learning-loop feeds (schema-tolerant: empty until the learning-loop
  // migration is applied).
  const [calibrationRows, correctionRows] = await Promise.all([
    readEngineCalibrationRows({ days: 90, environment }).catch(() => []),
    readReaderCorrectionRows({ days: 90, environment }).catch(() => []),
  ]);
  const drafts = buildImprovementInsights({
    events: snapshot.events,
    graphRuns: snapshot.graphRuns,
    environment,
    days,
    calibrationRows,
    correctionRows,
  });
  const existingStatus = new Map(
    snapshot.insights.map((item) => [
      [
        item.insight_key,
        item.environment,
        item.period_start,
        item.period_end,
      ].join("|"),
      item.status,
    ]),
  );
  const rows = drafts.map((draft) => {
    const identity = [
      draft.insightKey,
      draft.environment,
      draft.periodStart,
      draft.periodEnd,
    ].join("|");
    return {
      insight_key: draft.insightKey,
      environment: draft.environment,
      period_start: draft.periodStart,
      period_end: draft.periodEnd,
      category: draft.category,
      severity: draft.severity,
      status: existingStatus.get(identity) ?? "proposed",
      headline: draft.headline,
      evidence: draft.evidence,
      recommendation: draft.recommendation,
      metrics: draft.metrics,
      generated_by: draft.generatedBy,
      generator_version: draft.generatorVersion,
      updated_at: new Date().toISOString(),
    };
  });
  if (rows.length) {
    const { error } = await client
      .from("foundation1_improvement_insights")
      .upsert(rows, {
        onConflict: "insight_key,environment,period_start,period_end",
      });
    if (error) throw new Error(error.message);
  }
  const pruneResult = await client.rpc("prune_foundation1_behavior_events", {
    retention_days: 90,
  });
  if (pruneResult.error && !isMissingSchemaError(pruneResult.error.message)) {
    throw new Error(pruneResult.error.message);
  }
  return {
    generated: rows.length,
    eventCount: snapshot.events.length,
    graphRunCount: snapshot.graphRuns.length,
    generatorVersion: IMPROVEMENT_ENGINE_VERSION,
  };
}

export async function decideImprovementInsight(input: {
  insightId: string;
  decision: "accepted" | "rejected" | "implemented";
  decidedBy: string;
  notes?: string;
}) {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin configuration is unavailable.");
  const updatedAt = new Date().toISOString();
  const { data, error } = await client
    .from("foundation1_improvement_insights")
    .update({ status: input.decision, updated_at: updatedAt })
    .eq("id", input.insightId)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Insight not found.");
  const decisionResult = await client
    .from("foundation1_improvement_decisions")
    .insert({
      insight_id: input.insightId,
      decision: input.decision,
      decided_by: input.decidedBy.slice(0, 220),
      notes: input.notes?.trim().slice(0, 1000) || null,
    });
  if (decisionResult.error) throw new Error(decisionResult.error.message);
  return { id: data.id, status: input.decision };
}

export async function persistGraphRun(input: {
  definition: GraphDefinition;
  result: GraphRunResult;
  requestedBy: string;
  environment?: TelemetryEnvironment;
  caseId?: string | null;
  inputSummary?: Record<string, unknown>;
}) {
  const client = getSupabaseAdminClient();
  if (!client) {
    if (runtimeEnvironment() === "production") {
      throw new Error("Graph run storage is unavailable.");
    }
    return { persisted: false };
  }
  const environment = input.environment ?? runtimeEnvironment();
  const nodeResults = Object.values(input.result.results);
  const graphRow = {
    id: input.result.runId,
    graph_key: input.definition.key,
    graph_version: input.definition.version,
    environment,
    case_id: input.caseId ?? null,
    status: input.result.outcome,
    requested_by: input.requestedBy.slice(0, 220),
    input_summary: input.inputSummary ?? {},
    running_notes: input.result.runningNotes,
    max_nodes: input.definition.limits.maxNodes,
    max_parallel_nodes: input.definition.limits.maxParallelNodes,
    max_attempts_per_node: input.definition.limits.maxAttemptsPerNode,
    max_rounds: input.definition.limits.maxRounds,
    node_count: nodeResults.length,
    started_at: input.result.startedAt,
    finished_at: input.result.finishedAt,
  };
  const graphResult = await client
    .from("foundation1_graph_runs")
    .upsert(graphRow, { onConflict: "id" });
  if (graphResult.error) throw new Error(graphResult.error.message);

  const definitionByKey = new Map(
    input.definition.nodes.map((node) => [node.key, node]),
  );
  const nodeRows = nodeResults.map((result) => ({
    run_id: input.result.runId,
    node_key: result.nodeKey,
    node_kind: definitionByKey.get(result.nodeKey)!.kind,
    attempt: result.attempt,
    status: result.outcome,
    started_at: result.startedAt,
    finished_at: result.finishedAt,
    output_digest: result.artifact === undefined ? null : digest(result.artifact),
    output_summary: {
      artifactKey: result.artifactKey,
      confidence: result.confidence ?? null,
      flagCount: result.flags.length,
    },
    citations: result.citations,
    verification: { flags: result.flags, confidence: result.confidence ?? null },
  }));
  const nodesResult = await client
    .from("foundation1_graph_node_runs")
    .upsert(nodeRows, { onConflict: "run_id,node_key,attempt" });
  if (nodesResult.error) throw new Error(nodesResult.error.message);

  const artifactRows = nodeResults
    .filter((result) => result.artifact !== undefined)
    .map((result) => ({
      run_id: input.result.runId,
      case_id: input.caseId ?? null,
      artifact_key: result.artifactKey,
      artifact_version: 1,
      writer_node_key: result.nodeKey,
      status:
        result.outcome === "passed"
          ? definitionByKey.get(result.nodeKey)!.kind === "merge"
            ? "merged"
            : "verified"
          : result.outcome === "failed"
            ? "rejected"
            : "draft",
      content: result.artifact,
      content_sha256: digest(result.artifact),
    }));
  if (artifactRows.length) {
    const artifactResult = await client
      .from("foundation1_graph_artifacts")
      .upsert(artifactRows, {
        onConflict: "run_id,artifact_key,artifact_version",
      });
    if (artifactResult.error) throw new Error(artifactResult.error.message);
  }
  return { persisted: true };
}

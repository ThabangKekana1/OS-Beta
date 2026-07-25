import type {
  TelemetryEnvironment,
  TelemetryEventName,
  TelemetrySurface,
} from "@/lib/intelligence/telemetry";

export type BehaviorEventRow = {
  id: string;
  occurred_at: string;
  received_at?: string;
  environment: TelemetryEnvironment;
  surface: TelemetrySurface;
  event_name: TelemetryEventName;
  page_key: string;
  visitor_hash?: string;
  session_hash: string;
  properties: Record<string, string | number | boolean>;
};

export type GraphRunRow = {
  id: string;
  created_at: string;
  graph_key: string;
  graph_version: string;
  environment: TelemetryEnvironment;
  status: string;
  max_nodes: number;
  max_parallel_nodes: number;
  max_attempts_per_node: number;
  node_count: number;
  stop_reason: string | null;
  failure_reason: string | null;
};

export type ImprovementInsightDraft = {
  insightKey: string;
  environment: TelemetryEnvironment;
  periodStart: string;
  periodEnd: string;
  category:
    | "funnel"
    | "friction"
    | "engagement"
    | "graph_quality"
    | "data_quality";
  severity: "info" | "low" | "medium" | "high";
  headline: string;
  evidence: string;
  recommendation: string;
  metrics: Record<string, number | string>;
  generatedBy: "deterministic_analyzer" | "codex" | "operator";
  generatorVersion: string;
};

export type ImprovementInsightRow = {
  id: string;
  created_at: string;
  updated_at: string;
  insight_key: string;
  environment: TelemetryEnvironment;
  period_start: string;
  period_end: string;
  category: ImprovementInsightDraft["category"];
  severity: ImprovementInsightDraft["severity"];
  status: "proposed" | "accepted" | "rejected" | "implemented";
  headline: string;
  evidence: string;
  recommendation: string;
  metrics: Record<string, number | string>;
  generated_by: ImprovementInsightDraft["generatedBy"];
  generator_version: string;
};

export type IntelligenceSnapshot = {
  configured: boolean;
  schemaReady: boolean;
  environment: TelemetryEnvironment;
  days: number;
  events: BehaviorEventRow[];
  graphRuns: GraphRunRow[];
  insights: ImprovementInsightRow[];
  message?: string;
};

export const GRAPH_NODE_KINDS = [
  "agent",
  "deterministic",
  "verifier",
  "merge",
] as const;

export type GraphNodeKind = (typeof GRAPH_NODE_KINDS)[number];

export const GRAPH_CAPABILITIES = [
  "read:account",
  "read:case_summary",
  "read:validated_bill_facts",
  "read:approved_financial_tables",
  "read:authorized_kyc_summary",
  "read:telemetry_aggregates",
  "read:graph_quality_metrics",
  "research:public_sources",
  "draft:brief",
  "draft:outreach",
  "draft:narrative",
  "check:evidence",
  "check:claims",
  "check:consistency",
  "merge:artifact",
] as const;

export type GraphCapability = (typeof GRAPH_CAPABILITIES)[number];

export type GraphLimits = {
  maxNodes: number;
  maxParallelNodes: number;
  maxAttemptsPerNode: number;
  maxRounds: number;
};

export type GraphNodeDefinition = {
  key: string;
  label: string;
  kind: GraphNodeKind;
  dependsOn: string[];
  capabilities: GraphCapability[];
  artifactKey: string;
  parallelGroup?: string;
  verifierKey?: string;
  maxAttempts?: number;
};

export type GraphDefinition = {
  key: string;
  version: string;
  label: string;
  purpose: string;
  inputContract: string[];
  outputArtifactKey: string;
  limits: GraphLimits;
  nodes: GraphNodeDefinition[];
};

export type GraphCitation = {
  label: string;
  url?: string;
  sourceDate?: string;
};

export type GraphNodeOutcome = "passed" | "failed" | "needs_review" | "blocked";

export type GraphNodeResult = {
  nodeKey: string;
  attempt: number;
  outcome: GraphNodeOutcome;
  artifactKey: string;
  artifact?: unknown;
  citations: GraphCitation[];
  flags: string[];
  confidence?: number;
  startedAt: string;
  finishedAt: string;
};

export type RunningNote = {
  at: string;
  nodeKey: string;
  message: string;
};

export type GraphExecutionInput = {
  runId: string;
  graph: GraphDefinition;
  node: GraphNodeDefinition;
  attempt: number;
  request: Readonly<Record<string, unknown>>;
  dependencyResults: Readonly<Record<string, GraphNodeResult>>;
  runningNotes: readonly RunningNote[];
};

export type GraphNodeExecutor = (
  input: GraphExecutionInput,
) => Promise<
  Omit<
    GraphNodeResult,
    "nodeKey" | "attempt" | "artifactKey" | "startedAt" | "finishedAt"
  >
>;

export type GraphRunEvent =
  | {
      type: "run_started" | "run_finished";
      at: string;
      runId: string;
      graphKey: string;
      detail: string;
    }
  | {
      type: "node_started" | "node_finished" | "node_retry" | "node_blocked";
      at: string;
      runId: string;
      graphKey: string;
      nodeKey: string;
      attempt: number;
      detail: string;
    };

export type GraphRunObserver = {
  onEvent?: (event: GraphRunEvent) => void | Promise<void>;
};

export type GraphRunResult = {
  runId: string;
  graphKey: string;
  graphVersion: string;
  outcome: "succeeded" | "failed" | "needs_review";
  results: Record<string, GraphNodeResult>;
  runningNotes: RunningNote[];
  startedAt: string;
  finishedAt: string;
};

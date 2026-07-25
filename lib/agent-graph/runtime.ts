import { randomUUID } from "node:crypto";
import {
  GRAPH_CAPABILITIES,
  GRAPH_NODE_KINDS,
  type GraphDefinition,
  type GraphExecutionInput,
  type GraphNodeDefinition,
  type GraphNodeExecutor,
  type GraphNodeResult,
  type GraphRunEvent,
  type GraphRunObserver,
  type GraphRunResult,
  type RunningNote,
} from "@/lib/agent-graph/contracts";

const FORBIDDEN_ARTIFACT_KEYS = new Set([
  "final_proposal",
  "final_proposal_document",
  "migration_case_state",
  "funding_submission",
  "term_sheet_decision",
]);

const keyPattern = /^[a-z][a-z0-9_]{2,79}$/;

function assertKey(value: string, label: string) {
  if (!keyPattern.test(value)) {
    throw new Error(`${label} must be a lower-snake-case identifier.`);
  }
}

export function validateGraphDefinition(graph: GraphDefinition) {
  assertKey(graph.key, "Graph key");
  assertKey(graph.outputArtifactKey, "Output artifact key");
  if (!graph.version.trim()) throw new Error("Graph version is required.");
  if (graph.limits.maxNodes < 1 || graph.limits.maxNodes > 16) {
    throw new Error("Graph maxNodes must be between 1 and 16.");
  }
  if (
    graph.limits.maxParallelNodes < 1 ||
    graph.limits.maxParallelNodes > 4
  ) {
    throw new Error("Graph maxParallelNodes must be between 1 and 4.");
  }
  if (
    graph.limits.maxAttemptsPerNode < 1 ||
    graph.limits.maxAttemptsPerNode > 3
  ) {
    throw new Error("Graph maxAttemptsPerNode must be between 1 and 3.");
  }
  if (graph.limits.maxRounds < 1 || graph.limits.maxRounds > 3) {
    throw new Error("Graph maxRounds must be between 1 and 3.");
  }
  if (!graph.nodes.length || graph.nodes.length > graph.limits.maxNodes) {
    throw new Error("Graph node count exceeds its declared limit.");
  }

  const nodeKeys = new Set<string>();
  const artifactWriters = new Map<string, string>();
  const allowedKinds = new Set<string>(GRAPH_NODE_KINDS);
  const allowedCapabilities = new Set<string>(GRAPH_CAPABILITIES);

  for (const node of graph.nodes) {
    assertKey(node.key, "Node key");
    assertKey(node.artifactKey, "Artifact key");
    if (nodeKeys.has(node.key)) throw new Error(`Duplicate node: ${node.key}.`);
    if (!allowedKinds.has(node.kind)) {
      throw new Error(`Unsupported node kind: ${node.kind}.`);
    }
    if (FORBIDDEN_ARTIFACT_KEYS.has(node.artifactKey)) {
      throw new Error(
        `Agent graphs may not write protected artifact ${node.artifactKey}.`,
      );
    }
    const existingWriter = artifactWriters.get(node.artifactKey);
    if (existingWriter) {
      throw new Error(
        `Artifact ${node.artifactKey} has multiple writers: ${existingWriter}, ${node.key}.`,
      );
    }
    for (const capability of node.capabilities) {
      if (!allowedCapabilities.has(capability)) {
        throw new Error(
          `Node ${node.key} requests unsupported capability ${capability}.`,
        );
      }
    }
    const attempts = node.maxAttempts ?? graph.limits.maxAttemptsPerNode;
    if (attempts < 1 || attempts > graph.limits.maxAttemptsPerNode) {
      throw new Error(`Node ${node.key} has an invalid retry limit.`);
    }
    nodeKeys.add(node.key);
    artifactWriters.set(node.artifactKey, node.key);
  }

  if (!artifactWriters.has(graph.outputArtifactKey)) {
    throw new Error("The graph output has no writer.");
  }

  for (const node of graph.nodes) {
    for (const dependency of node.dependsOn) {
      if (!nodeKeys.has(dependency)) {
        throw new Error(`Node ${node.key} has unknown dependency ${dependency}.`);
      }
      if (dependency === node.key) {
        throw new Error(`Node ${node.key} cannot depend on itself.`);
      }
    }
    if (node.verifierKey) {
      const verifier = graph.nodes.find((item) => item.key === node.verifierKey);
      if (!verifier || verifier.kind !== "verifier") {
        throw new Error(`Node ${node.key} has an invalid verifier.`);
      }
      if (!node.dependsOn.includes(node.verifierKey)) {
        throw new Error(
          `Node ${node.key} must explicitly depend on its verifier.`,
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byKey = new Map(graph.nodes.map((node) => [node.key, node]));
  const visit = (node: GraphNodeDefinition) => {
    if (visited.has(node.key)) return;
    if (visiting.has(node.key)) {
      throw new Error(`Graph contains a cycle at ${node.key}.`);
    }
    visiting.add(node.key);
    for (const dependency of node.dependsOn) {
      visit(byKey.get(dependency)!);
    }
    visiting.delete(node.key);
    visited.add(node.key);
  };
  graph.nodes.forEach(visit);
  return graph;
}

async function emit(
  observer: GraphRunObserver | undefined,
  event: GraphRunEvent,
) {
  await observer?.onEvent?.(event);
}

function nextReadyNodes(
  graph: GraphDefinition,
  pending: Set<string>,
  completed: Map<string, GraphNodeResult>,
) {
  return graph.nodes.filter(
    (node) =>
      pending.has(node.key) &&
      node.dependsOn.every((dependency) => completed.has(dependency)),
  );
}

function dependencyMap(
  node: GraphNodeDefinition,
  completed: Map<string, GraphNodeResult>,
) {
  return Object.fromEntries(
    node.dependsOn.map((key) => [key, completed.get(key)!]),
  );
}

async function executeNode(
  input: {
    runId: string;
    graph: GraphDefinition;
    node: GraphNodeDefinition;
    request: Readonly<Record<string, unknown>>;
    completed: Map<string, GraphNodeResult>;
    runningNotes: RunningNote[];
    executor: GraphNodeExecutor;
    observer?: GraphRunObserver;
  },
) {
  const {
    runId,
    graph,
    node,
    request,
    completed,
    runningNotes,
    executor,
    observer,
  } = input;
  const dependencies = dependencyMap(node, completed);
  const failedDependency = Object.values(dependencies).find(
    (result) => result.outcome === "failed" || result.outcome === "blocked",
  );
  const verifier = node.verifierKey
    ? dependencies[node.verifierKey]
    : undefined;

  if (failedDependency || (verifier && verifier.outcome !== "passed")) {
    const now = new Date().toISOString();
    const result: GraphNodeResult = {
      nodeKey: node.key,
      attempt: 0,
      outcome: "blocked",
      artifactKey: node.artifactKey,
      citations: [],
      flags: [
        failedDependency
          ? `dependency_failed:${failedDependency.nodeKey}`
          : `verification_not_passed:${node.verifierKey}`,
      ],
      startedAt: now,
      finishedAt: now,
    };
    await emit(observer, {
      type: "node_blocked",
      at: now,
      runId,
      graphKey: graph.key,
      nodeKey: node.key,
      attempt: 0,
      detail: result.flags[0],
    });
    return result;
  }

  const maxAttempts = node.maxAttempts ?? graph.limits.maxAttemptsPerNode;
  let lastResult: GraphNodeResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = new Date().toISOString();
    await emit(observer, {
      type: "node_started",
      at: startedAt,
      runId,
      graphKey: graph.key,
      nodeKey: node.key,
      attempt,
      detail: node.label,
    });
    const executionInput: GraphExecutionInput = {
      runId,
      graph,
      node,
      attempt,
      request,
      dependencyResults: dependencies,
      runningNotes,
    };
    try {
      const output = await executor(executionInput);
      const finishedAt = new Date().toISOString();
      lastResult = {
        ...output,
        nodeKey: node.key,
        attempt,
        artifactKey: node.artifactKey,
        citations: output.citations ?? [],
        flags: output.flags ?? [],
        startedAt,
        finishedAt,
      };
      await emit(observer, {
        type: "node_finished",
        at: finishedAt,
        runId,
        graphKey: graph.key,
        nodeKey: node.key,
        attempt,
        detail: lastResult.outcome,
      });
      if (lastResult.outcome !== "failed") return lastResult;
    } catch (error) {
      const finishedAt = new Date().toISOString();
      lastResult = {
        nodeKey: node.key,
        attempt,
        outcome: "failed",
        artifactKey: node.artifactKey,
        citations: [],
        flags: [error instanceof Error ? error.message : "Node execution failed."],
        startedAt,
        finishedAt,
      };
    }
    if (attempt < maxAttempts) {
      await emit(observer, {
        type: "node_retry",
        at: new Date().toISOString(),
        runId,
        graphKey: graph.key,
        nodeKey: node.key,
        attempt,
        detail: `Retrying within cap ${maxAttempts}.`,
      });
    }
  }
  return lastResult!;
}

export async function runBoundedGraph(input: {
  definition: GraphDefinition;
  request: Readonly<Record<string, unknown>>;
  executor: GraphNodeExecutor;
  observer?: GraphRunObserver;
  runId?: string;
}): Promise<GraphRunResult> {
  const graph = validateGraphDefinition(input.definition);
  const runId = input.runId ?? randomUUID();
  const startedAt = new Date().toISOString();
  const pending = new Set(graph.nodes.map((node) => node.key));
  const completed = new Map<string, GraphNodeResult>();
  const runningNotes: RunningNote[] = [];

  await emit(input.observer, {
    type: "run_started",
    at: startedAt,
    runId,
    graphKey: graph.key,
    detail: graph.version,
  });

  while (pending.size) {
    const ready = nextReadyNodes(graph, pending, completed);
    if (!ready.length) {
      throw new Error("Graph cannot progress; dependencies are unresolved.");
    }

    for (let index = 0; index < ready.length; index += graph.limits.maxParallelNodes) {
      const wave = ready.slice(index, index + graph.limits.maxParallelNodes);
      const results = await Promise.all(
        wave.map((node) =>
          executeNode({
            runId,
            graph,
            node,
            request: input.request,
            completed,
            runningNotes,
            executor: input.executor,
            observer: input.observer,
          }),
        ),
      );
      for (const result of results) {
        completed.set(result.nodeKey, result);
        pending.delete(result.nodeKey);
        runningNotes.push({
          at: result.finishedAt,
          nodeKey: result.nodeKey,
          message: `${result.artifactKey}:${result.outcome}`,
        });
      }
    }
  }

  const outputNode = graph.nodes.find(
    (node) => node.artifactKey === graph.outputArtifactKey,
  )!;
  const output = completed.get(outputNode.key)!;
  const outcome =
    output.outcome === "passed"
      ? "succeeded"
      : output.outcome === "needs_review"
        ? "needs_review"
        : "failed";
  const finishedAt = new Date().toISOString();
  await emit(input.observer, {
    type: "run_finished",
    at: finishedAt,
    runId,
    graphKey: graph.key,
    detail: outcome,
  });
  return {
    runId,
    graphKey: graph.key,
    graphVersion: graph.version,
    outcome,
    results: Object.fromEntries(completed),
    runningNotes,
    startedAt,
    finishedAt,
  };
}

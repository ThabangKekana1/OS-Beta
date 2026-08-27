/**
 * HARNESS — the bounded run loop (doc 20).
 *
 * A harness run is a small, finite agent loop: the model drafts a plan of
 * tool calls, each tool executes against platform data (read-only or
 * gate-mediated), and the loop stops on budget, completion, or a tool the
 * agent is not allowed to call. Every run is persisted into the same
 * foundation1_graph_runs ledger the intelligence graphs use, so one
 * inspector surface shows both.
 *
 * The model NEVER sends anything. Outbound artifacts come back as payloads
 * and go through lib/harness/gate like every other path.
 */
import { randomUUID } from "node:crypto";
import { completeChat, parseJsonObject, type ModelCompletion } from "@/lib/model/client";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { HarnessToolMap } from "./tools";

const MAX_ROUNDS_DEFAULT = 4;
const MAX_TOOL_CALLS_DEFAULT = 8;

export type HarnessAgentKey = "sales-harness" | "dawn" | "operations";

export type HarnessRunInput = {
  agent: HarnessAgentKey;
  /** What this run is for, in one line — goes into the run ledger. */
  objective: string;
  systemPrompt: string;
  /** Context handed to the model verbatim (case summary, pipeline slice…). */
  context: string;
  userPrompt: string;
  tools: HarnessToolMap;
  maxRounds?: number;
  maxToolCalls?: number;
  requestedBy?: string;
  caseId?: string | null;
};

export type HarnessToolCall = {
  tool: string;
  input: unknown;
};

export type HarnessRunStep = {
  round: number;
  calls: HarnessToolCall[];
  results: Array<{ tool: string; ok: boolean; result?: unknown; error?: string }>;
};

export type HarnessRunResult = {
  runId: string;
  outcome: "completed" | "stopped_budget" | "no_model" | "failed";
  reply: string;
  steps: HarnessRunStep[];
  startedAt: string;
  finishedAt: string;
};

type PlanShape = {
  done?: boolean;
  reply?: string;
  calls?: Array<{ tool?: string; input?: unknown }>;
};

export function buildHarnessSystemPrompt(input: {
  agentName: string;
  toolNames: string[];
}): string {
  return [
    `You are ${input.agentName}, an agent inside Foundation-1's 1-MI platform.`,
    "You plan tool calls. You never send emails or messages yourself: outbound",
    "artifacts are queued as drafts for founder approval by the platform.",
    "",
    `Available tools: ${input.toolNames.join(", ")}.`,
    "",
    "Reply with ONE JSON object:",
    '{"done": false, "calls": [{"tool": "<name>", "input": <object>}]',
    ' or {"done": true, "reply": "<final answer>"} ',
    "No prose outside the JSON.",
  ].join("\n");
}

/** Executes the plan JSON for one round. Exported for tests. */
export function parseHarnessPlan(text: string): PlanShape | null {
  return parseJsonObject(text);
}

export async function runHarness(input: HarnessRunInput): Promise<HarnessRunResult> {
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const steps: HarnessRunStep[] = [];
  let toolCallsMade = 0;
  const maxRounds = input.maxRounds ?? MAX_ROUNDS_DEFAULT;
  const maxToolCalls = input.maxToolCalls ?? MAX_TOOL_CALLS_DEFAULT;
  const toolNames = Object.keys(input.tools);

  // The roster is enforced here so no caller can hand the model a prompt
  // without its real tool names: hallucinated tools die at the source.
  const systemWithTools = input.systemPrompt.includes("Available tools:")
    ? input.systemPrompt
    : `${input.systemPrompt}\n\nAvailable tools: ${toolNames.join(", ")}. Call only these, exactly by these names.`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemWithTools },
    {
      role: "user",
      content: [
        `OBJECTIVE: ${input.objective}`,
        "",
        "CONTEXT:",
        input.context,
        "",
        "TASK:",
        input.userPrompt,
      ].join("\n"),
    },
  ];

  async function executePlan(text: string): Promise<{ done: boolean; reply: string }> {
    const plan = parseHarnessPlan(text);
    if (!plan) {
      steps.push({ round: steps.length + 1, calls: [], results: [{ tool: "(plan)", ok: false, error: "Model returned no JSON plan." }] });
      return { done: false, reply: "" };
    }
    if (plan.done || !Array.isArray(plan.calls) || plan.calls.length === 0) {
      return { done: true, reply: typeof plan.reply === "string" ? plan.reply : "" };
    }
    const round = steps.length + 1;
    const results: HarnessRunStep["results"] = [];
    for (const call of plan.calls.slice(0, Math.max(0, maxToolCalls - toolCallsMade))) {
      const name = typeof call?.tool === "string" ? call.tool : "";
      const record = { tool: name, ok: false, result: undefined as unknown, error: undefined as string | undefined };
      if (!(name in input.tools)) {
        record.error = `Unknown tool "${name}".`;
      } else if (!name.startsWith("read.") && !name.startsWith("queue.")) {
        // Only reads and gate-mediated queueing are callable at all.
        record.error = `Tool "${name}" is not exposed to agents.`;
      } else {
        try {
          record.result = await input.tools[name](call.input ?? {});
          record.ok = true;
        } catch (error) {
          record.error = error instanceof Error ? error.message : "Tool failed.";
        }
      }
      toolCallsMade += 1;
      results.push(record);
      messages.push({
        role: "user",
        content: `TOOL RESULT ${name}: ${JSON.stringify(record.ok ? record.result : record.error).slice(0, 4000)}`,
      });
    }
    steps.push({ round, calls: plan.calls.filter((c) => typeof c?.tool === "string").map((c) => ({ tool: c.tool as string, input: c.input })), results });
    return { done: false, reply: "" };
  }

  let outcome: HarnessRunResult["outcome"] = "completed";
  let finalReply = "";

  // Harness cognition runs on its own model tier (MODEL_HARNESS, glm-5.3 flash),
  // independent of the client-facing Dawn default (MODEL_DEFAULT).
  const harnessModel = process.env.MODEL_HARNESS?.trim() || undefined;
  const configCheck = await completeChat({ messages, role: "draft", json: true, model: harnessModel, thinking: "disabled" });
  if (!configCheck.ok && "skipped" in configCheck && configCheck.skipped) {
    return {
      runId,
      outcome: "no_model",
      reply: "",
      steps,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  let last: ModelCompletion = configCheck;
  for (let round = 0; round < maxRounds; round += 1) {
    if (!last.ok) {
      outcome = "failed";
      break;
    }
    const execution = await executePlan(last.text);
    if (execution.done) {
      finalReply = execution.reply;
      break;
    }
    if (toolCallsMade >= maxToolCalls) {
      outcome = "stopped_budget";
      break;
    }
    last = await completeChat({ messages, role: "draft", json: true, model: harnessModel, thinking: "disabled" });
  }

  await persistHarnessRun(input, { runId, outcome, steps, startedAt });

  return {
    runId,
    outcome,
    reply: finalReply,
    steps,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

type PersistableOutcome = Pick<HarnessRunResult, "runId" | "outcome" | "steps" | "startedAt">;

/** Harness outcomes expressed in the ledger's own status vocabulary. */
const LEDGER_STATUS: Record<HarnessRunResult["outcome"], string> = {
  completed: "succeeded",
  stopped_budget: "needs_review",
  no_model: "cancelled",
  failed: "failed",
};

async function persistHarnessRun(input: HarnessRunInput, result: PersistableOutcome) {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  const row = {
    id: result.runId,
    graph_key: `harness:${input.agent}`,
    graph_version: 1,
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    case_id: input.caseId ?? null,
    status: LEDGER_STATUS[result.outcome] ?? "failed",
    requested_by: input.requestedBy ?? "system",
    input_summary: { objective: input.objective },
    running_notes: [],
    max_nodes: input.maxToolCalls ?? MAX_TOOL_CALLS_DEFAULT,
    max_parallel_nodes: 1,
    max_attempts_per_node: 1,
    max_rounds: input.maxRounds ?? MAX_ROUNDS_DEFAULT,
    node_count: result.steps.reduce((sum, step) => sum + step.calls.length, 0),
    started_at: result.startedAt,
    finished_at: new Date().toISOString(),
  };
  const { error } = await admin.from("foundation1_graph_runs").upsert(row, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

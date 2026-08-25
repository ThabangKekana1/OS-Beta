/**
 * DAWN — the turn engine.
 *
 * One client message in, one Dawn reply out. Assembles persona + learned
 * playbook + case context + history, calls the configured model (GLM 5.2 via
 * the provider-agnostic client, reasoning disabled for latency), enforces the
 * style contract on the way out, persists both turns, and hands the exchange
 * to the learning loop without blocking the reply.
 */
import { completeChat } from "@/lib/model/client";
import type { MigrationCaseRow } from "@/lib/migration-case-store";
import { buildCaseContext } from "./context";
import { DAWN_SYSTEM_PROMPT, DAWN_VERSION } from "./prompt";
import {
  appendMessage,
  ensureConversation,
  listMessages,
  loadActiveBillPack,
  loadActivePlaybook,
  loadActiveProposal,
  loadMemory,
  recentMovements,
  retitleConversation,
} from "./store";
import { runLearningPass } from "./learning";

import { enforceStyle } from "./style";

export { enforceStyle };

const MAX_CLIENT_MESSAGE = 4000;
const HISTORY_TURNS = 60;
/**
 * Character budget for conversation history inside the model context.
 * GLM 5.2 carries a very large window; the budget below keeps latency and
 * cost sane while never feeling short in a real conversation.
 */
const HISTORY_CHAR_BUDGET = 48_000;
/** Past this many stored turns, Dawn starts suggesting a fresh thread. */
const LONG_CONVERSATION_TURNS = 80;

export type DawnTurnResult = {
  conversationId: string;
  reply: string;
  stuck: boolean;
  model: string | null;
  degraded: boolean;
  /** True when the thread is long enough that a fresh chat is worth suggesting. */
  suggestNewChat: boolean;
};

/** A fixed, warm fallback so the workspace never goes silent. */
function fallbackReply(nextStep: string): string {
  return [
    "I am having trouble reaching my reasoning service right now, so let me keep it simple.",
    nextStep,
    "If you need a person, [message the team](dawn:view/support) and they will reply by email.",
  ].join(" ");
}

export async function runDawnTurn(input: {
  caseRow: MigrationCaseRow;
  message: string;
  conversationId?: string | null;
  currentView?: string | null;
  sessionId?: string | null;
}): Promise<DawnTurnResult> {
  const message = (input.message ?? "").trim().slice(0, MAX_CLIENT_MESSAGE);
  if (!message) throw new Error("Empty message.");

  const conversation = await ensureConversation(input.caseRow.id, input.conversationId);
  const [historyRaw, playbook, movements, memory, proposal, billPack] = await Promise.all([
    listMessages(conversation.id, HISTORY_TURNS),
    loadActivePlaybook().catch(() => []),
    recentMovements(input.caseRow.id).catch(() => []),
    loadMemory(input.caseRow.id).catch(() => []),
    loadActiveProposal(input.caseRow).catch(() => null),
    loadActiveBillPack(input.caseRow).catch(() => null),
  ]);

  // Token-budgeted history: newest turns first, as many as fit the budget.
  let budget = HISTORY_CHAR_BUDGET;
  const kept: typeof historyRaw = [];
  for (let i = historyRaw.length - 1; i >= 0; i -= 1) {
    budget -= historyRaw[i].content.length;
    if (budget < 0) break;
    kept.unshift(historyRaw[i]);
  }
  const history = kept;
  const truncated = kept.length < historyRaw.length;
  const longConversation = historyRaw.length >= LONG_CONVERSATION_TURNS || truncated;

  const { context, stuck } = buildCaseContext({
    caseRow: input.caseRow,
    movements,
    currentView: input.currentView ?? null,
    proposal,
    billPack,
  });

  const playbookBlock =
    playbook.length > 0
      ? `\n\nLEARNED GUIDANCE (from real conversations, apply when relevant)\n${playbook
          .map((entry) => `- [${entry.key} v${entry.version}] ${entry.content}`)
          .join("\n")}`
      : "";

  const memoryBlock =
    memory.length > 0
      ? `\n\nWHAT YOU REMEMBER ABOUT THIS CLIENT (from earlier conversations)\n${memory
          .map((entry) => `- ${entry.key}: ${entry.content}`)
          .join("\n")}`
      : "";

  const longThreadNote = longConversation
    ? "\n\nTHREAD LENGTH NOTE: this conversation is getting long. When it fits naturally " +
      "(never mid-answer), warmly suggest starting a fresh chat from the sidebar; " +
      "reassure the client that you remember their case and nothing is lost."
    : "";

  const completion = await completeChat({
    messages: [
      {
        role: "system",
        content: `${DAWN_SYSTEM_PROMPT}${playbookBlock}${memoryBlock}${longThreadNote}\n\n${context}`,
      },
      ...history.map((m) => ({
        role: m.role === "client" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      })),
      { role: "user", content: message },
    ],
    temperature: 0.4,
    maxOutputTokens: 700,
    thinking: "disabled",
  });

  const narrativeNext = context
    .split("\n")
    .find((line) => line.startsWith("The next step:"))
    ?.replace("The next step: ", "") ?? "Open your workspace and I will walk you through it.";

  const reply = completion.ok
    ? enforceStyle(completion.text)
    : fallbackReply(narrativeNext);

  await appendMessage({
    conversationId: conversation.id,
    caseId: input.caseRow.id,
    role: "client",
    content: message,
    context: { view: input.currentView ?? null },
  });
  await appendMessage({
    conversationId: conversation.id,
    caseId: input.caseRow.id,
    role: "dawn",
    content: reply,
    context: {
      version: DAWN_VERSION,
      model: completion.ok ? completion.model : null,
      degraded: !completion.ok,
      stuck: stuck.stuck,
      tokens: completion.ok ? completion.usage : null,
    },
  });

  if (history.length === 0) {
    const title = message.slice(0, 60) + (message.length > 60 ? "..." : "");
    retitleConversation(conversation.id, title).catch(() => undefined);
  }

  // Learning never blocks the client.
  runLearningPass({
    caseRow: input.caseRow,
    conversationId: conversation.id,
    clientMessage: message,
    dawnReply: reply,
    stuck,
    history,
  }).catch(() => undefined);

  return {
    conversationId: conversation.id,
    reply,
    stuck: stuck.stuck,
    model: completion.ok ? completion.model : null,
    degraded: !completion.ok,
    suggestNewChat: longConversation,
  };
}

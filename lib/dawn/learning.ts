/**
 * DAWN — the learning loop. PURE INTELLIGENCE, per founder spec.
 *
 * Every turn runs the intelligence pass, never blocking the reply:
 *
 *   1. Deterministic signals: repeated questions, trust anxiety, stuck
 *      movement patterns. Cheap, always on.
 *   2. Model intelligence pass (every turn): user INTENT, sentiment, demand
 *      signals (what this business wants, struggles with, objects to), a
 *      serious-risk flag, and at most ONE playbook improvement when signals
 *      warrant it.
 *
 * Where it all lands:
 *   - foundation1_dawn_demand_signals   → demand intelligence (founder view)
 *   - foundation1_improvement_insights  → ontology (what to improve and why)
 *   - foundation1_improvement_decisions → what Dawn changed about itself
 *   - foundation1_dawn_playbook         → the change itself, versioned
 *   - oneos_notifications (admin)       → serious-risk escalations. Dawn NEVER
 *     tells a client not to proceed; it reports to the founder and waits.
 *
 * Design rule: insights describe patterns, not people. Quotes are clipped and
 * used only as evidence for the pattern.
 */
import { randomUUID } from "node:crypto";
import { completeChat, parseJsonObject } from "@/lib/model/client";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { createNotification } from "@/lib/notifications";
import type { MigrationCaseRow } from "@/lib/migration-case-store";
import type { DawnStuckSignal } from "./context";
import {
  applyPlaybookUpdate,
  recordDemandSignal,
  upsertMemory,
  type DawnStoredMessage,
  type DemandSignalKind,
} from "./store";
import { DAWN_VERSION } from "./prompt";

const PLAYBOOK_KEYS = [
  "nda_explanations",
  "eoi_explanations",
  "proposal_explanations",
  "bill_upload_help",
  "trust_and_reassurance",
  "pricing_questions",
  "process_overview",
  "stuck_reengagement",
  "tone_adjustments",
  "intent_reading",
] as const;

const DEMAND_KINDS: readonly DemandSignalKind[] = [
  "want",
  "challenge",
  "objection",
  "competitor_mention",
  "budget_signal",
  "timing_signal",
  "complaint",
  "excitement",
  "risk_flag",
];

const INTENTS = [
  "process_question",
  "price_question",
  "seeking_reassurance",
  "objection",
  "complaint",
  "excitement",
  "readiness_signal",
  "document_help",
  "small_talk",
  "distress",
  "off_topic",
] as const;

function environment(): string {
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

function normalise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common += 1;
  return common / Math.min(a.size, b.size);
}

export type DawnSignal = {
  kind: "repeated_question" | "trust_concern" | "stuck";
  detail: string;
};

export function detectSignals(input: {
  clientMessage: string;
  history: DawnStoredMessage[];
  stuck: DawnStuckSignal;
}): DawnSignal[] {
  const signals: DawnSignal[] = [];
  const current = normalise(input.clientMessage);
  const priorClient = input.history.filter((m) => m.role === "client").slice(-8);
  for (const prior of priorClient) {
    if (overlap(current, normalise(prior.content)) >= 0.65) {
      signals.push({
        kind: "repeated_question",
        detail: `Client re-asked: "${input.clientMessage.slice(0, 140)}"`,
      });
      break;
    }
  }
  if (/\b(scam|fraud|legit|too good|catch|fine print|trust|risky|suspicious)\b/i.test(input.clientMessage)) {
    signals.push({
      kind: "trust_concern",
      detail: `Trust language: "${input.clientMessage.slice(0, 140)}"`,
    });
  }
  if (input.stuck.stuck) {
    signals.push({ kind: "stuck", detail: input.stuck.reason ?? "Stuck pattern detected." });
  }
  return signals;
}

async function writeInsight(input: {
  kind: string;
  severity: "info" | "low" | "medium" | "high";
  status: "proposed" | "implemented";
  headline: string;
  evidence: string;
  recommendation: string;
  metrics: Record<string, unknown>;
}): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const today = new Date().toISOString().slice(0, 10);
  const id = randomUUID();
  const { error } = await admin.from("foundation1_improvement_insights").insert({
    id,
    insight_key: `dawn:${input.kind}:${randomUUID().slice(0, 8)}`,
    environment: environment(),
    period_start: today,
    period_end: today,
    category: "conversation",
    severity: input.severity,
    status: input.status,
    headline: input.headline.slice(0, 300),
    evidence: input.evidence.slice(0, 2000),
    recommendation: input.recommendation.slice(0, 2000),
    metrics: input.metrics,
    generated_by: "dawn",
    generator_version: DAWN_VERSION,
  });
  if (error) return null;
  return id;
}

async function recordDecision(insightId: string, notes: string) {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  await admin.from("foundation1_improvement_decisions").insert({
    insight_id: insightId,
    decision: "implemented",
    decided_by: "dawn",
    notes: notes.slice(0, 1000),
  });
}

/**
 * The intelligence pass: ONE model call per turn extracting intent, sentiment,
 * demand signals, serious risk, and (when warranted) one playbook improvement.
 */
async function intelligencePass(input: {
  signals: DawnSignal[];
  clientMessage: string;
  dawnReply: string;
  caseRow: MigrationCaseRow;
  conversationId: string;
}): Promise<void> {
  const completion = await completeChat({
    messages: [
      {
        role: "system",
        content: [
          "You are the intelligence analyst behind Dawn, a client-facing migration",
          "assistant for South African businesses lowering electricity costs.",
          "You receive one exchange plus deterministic signals. Extract, as strict JSON:",
          '{"intent": string, "sentiment": "negative"|"neutral"|"positive",',
          '"capability": "simple"|"standard"|"sophisticated",',
          '"demand_signals": [{"kind": string, "content": string}],',
          '"risk": {"serious": boolean, "reason": string|null},',
          '"memory": [{"key": string, "content": string}],',
          '"insight": {"headline": string, "evidence": string, "recommendation": string,',
          '"severity": "info"|"low"|"medium"|"high"} | null,',
          '"playbook": {"key": string, "content": string, "reason": string} | null}',
          `Allowed intents: ${INTENTS.join(", ")}.`,
          `Allowed demand signal kinds: ${DEMAND_KINDS.join(", ")}.`,
          "Demand signals capture what the BUSINESS wants, struggles with, objects to,",
          "mentions about competitors, budget or timing, complains about, or is excited",
          "about. Content is a short factual phrase in third person. Empty array if none.",
          "risk.serious is true ONLY for genuine red flags that the migration could fail",
          "this client (wrong load profile, insolvent, site closing, no mandate).",
          "memory holds durable facts Dawn should remember about THIS client across",
          "conversations (max 3): preferences, capability level, names, concerns already",
          "resolved, promises made. Keys are snake_case; content one short sentence.",
          "Empty array when nothing new is worth remembering.",
          `Allowed playbook keys: ${PLAYBOOK_KEYS.join(", ")}.`,
          "Playbook content is guidance for Dawn (max 3 sentences, imperative, general,",
          "never client-specific, never new facts or numbers, never partner names).",
          "Propose a playbook change ONLY when the exchange shows Dawn could do better.",
          "insight is founder-facing: propose only when there is a real pattern worth",
          "human attention. Return null fields freely.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Signals: ${input.signals.map((s) => `${s.kind}: ${s.detail}`).join(" | ") || "none"}`,
          `Client: ${input.clientMessage.slice(0, 700)}`,
          `Dawn: ${input.dawnReply.slice(0, 700)}`,
        ].join("\n"),
      },
    ],
    temperature: 0.2,
    maxOutputTokens: 600,
    json: true,
    thinking: "disabled",
  });
  if (!completion.ok) return;
  const parsed = parseJsonObject(completion.text);
  if (!parsed) return;

  const intent = typeof parsed.intent === "string" ? parsed.intent.slice(0, 80) : null;
  const sentiment = (["negative", "neutral", "positive"] as const).includes(
    parsed.sentiment as never,
  )
    ? (parsed.sentiment as "negative" | "neutral" | "positive")
    : null;

  // Demand intelligence.
  const demandSignals = Array.isArray(parsed.demand_signals) ? parsed.demand_signals : [];
  for (const signal of demandSignals.slice(0, 5)) {
    const kind = (signal as { kind?: string }).kind;
    const content = (signal as { content?: string }).content;
    if (
      typeof kind === "string" &&
      typeof content === "string" &&
      content.trim() &&
      (DEMAND_KINDS as readonly string[]).includes(kind)
    ) {
      await recordDemandSignal({
        caseId: input.caseRow.id,
        conversationId: input.conversationId,
        signalKind: kind as DemandSignalKind,
        content: content.trim(),
        intent,
        sentiment,
      }).catch(() => undefined);
    }
  }

  // Memory: durable per-case facts, upserted by key.
  const memories = Array.isArray(parsed.memory) ? parsed.memory : [];
  for (const entry of memories.slice(0, 3)) {
    const key = (entry as { key?: string }).key;
    const content = (entry as { content?: string }).content;
    if (typeof key === "string" && typeof content === "string" && content.trim()) {
      await upsertMemory({ caseId: input.caseRow.id, key, content: content.trim() }).catch(
        () => undefined,
      );
    }
  }

  // Serious risk: founder first, client never (until the founder says so).
  const risk = parsed.risk as { serious?: boolean; reason?: string | null } | null;
  if (risk?.serious && risk.reason) {
    const insightId = await writeInsight({
      kind: "risk_flag",
      severity: "high",
      status: "proposed",
      headline: `Dawn flags a serious risk on case ${input.caseRow.public_reference}`,
      evidence: `${risk.reason} Client said: "${input.clientMessage.slice(0, 300)}"`,
      recommendation:
        "Founder decision required: Dawn will keep moving the client forward until " +
        "explicitly authorised to advise otherwise.",
      metrics: { caseRef: input.caseRow.public_reference, conversationId: input.conversationId },
    });
    await recordDemandSignal({
      caseId: input.caseRow.id,
      conversationId: input.conversationId,
      signalKind: "risk_flag",
      content: risk.reason.slice(0, 500),
      intent,
      sentiment,
    }).catch(() => undefined);
    await createNotification({
      audience: "admin",
      kind: "system",
      title: `Dawn risk flag: ${input.caseRow.business_name}`,
      body: `${risk.reason.slice(0, 400)} (case ${input.caseRow.public_reference}). ` +
        "Dawn has NOT discouraged the client and will not without your go-ahead.",
      link: null,
      metadata: { caseRef: input.caseRow.public_reference, insightId },
    }).catch(() => undefined);
  }

  // Founder-facing insight.
  const insight = parsed.insight as
    | { headline?: string; evidence?: string; recommendation?: string; severity?: string }
    | null;
  const playbook = parsed.playbook as
    | { key?: string; content?: string; reason?: string }
    | null;

  let insightId: string | null = null;
  if (insight?.headline && insight.recommendation) {
    const severity = (["info", "low", "medium", "high"] as const).includes(
      insight.severity as never,
    )
      ? (insight.severity as "info" | "low" | "medium" | "high")
      : "low";
    insightId = await writeInsight({
      kind: input.signals[0]?.kind ?? "reflection",
      severity,
      status: playbook?.key ? "implemented" : "proposed",
      headline: insight.headline,
      evidence: insight.evidence ?? input.signals.map((s) => s.detail).join(" | "),
      recommendation: insight.recommendation,
      metrics: {
        caseRef: input.caseRow.public_reference,
        signals: input.signals.map((s) => s.kind),
        intent,
        sentiment,
      },
    });
  }

  // Self-improvement, applied and fully accounted for.
  if (
    playbook?.key &&
    playbook.content &&
    playbook.reason &&
    (PLAYBOOK_KEYS as readonly string[]).includes(playbook.key)
  ) {
    const { version } = await applyPlaybookUpdate({
      key: playbook.key,
      content: playbook.content,
      reason: playbook.reason,
      sourceInsightId: insightId,
    });
    if (insightId) {
      await recordDecision(
        insightId,
        `Dawn applied playbook ${playbook.key} v${version}: ${playbook.reason}`,
      );
    }
  }
}

export async function runLearningPass(input: {
  caseRow: MigrationCaseRow;
  conversationId: string;
  clientMessage: string;
  dawnReply: string;
  stuck: DawnStuckSignal;
  history: DawnStoredMessage[];
}): Promise<void> {
  const signals = detectSignals({
    clientMessage: input.clientMessage,
    history: input.history,
    stuck: input.stuck,
  });

  // Deterministic signals always reach the ontology, model or no model.
  for (const signal of signals) {
    await writeInsight({
      kind: signal.kind,
      severity: signal.kind === "trust_concern" ? "medium" : "low",
      status: "proposed",
      headline:
        signal.kind === "repeated_question"
          ? "A client had to ask the same question twice"
          : signal.kind === "trust_concern"
            ? "A client voiced trust concerns"
            : "A client shows a stuck pattern on their pending step",
      evidence: `${signal.detail} (case ${input.caseRow.public_reference})`,
      recommendation:
        signal.kind === "repeated_question"
          ? "Review whether Dawn's first answer landed; consider a playbook or interface copy fix."
          : signal.kind === "trust_concern"
            ? "Review the reassurance flow: non-binding EOI framing, POPIA, human approval gates."
            : "Review the pending step's interface copy and Dawn's nudge for this stage.",
      metrics: { caseRef: input.caseRow.public_reference, conversationId: input.conversationId },
    });
  }

  // The intelligence pass runs EVERY turn: intent, demand, risk, improvement.
  await intelligencePass({
    signals,
    clientMessage: input.clientMessage,
    dawnReply: input.dawnReply,
    caseRow: input.caseRow,
    conversationId: input.conversationId,
  });
}

/**
 * Feedback intelligence: every like teaches, every dislike escalates.
 */
export async function processFeedback(input: {
  caseRow: MigrationCaseRow;
  messageId: string;
  messageContent: string;
  rating: "like" | "dislike";
  comment?: string | null;
}): Promise<void> {
  await recordDemandSignal({
    caseId: input.caseRow.id,
    signalKind: input.rating === "like" ? "excitement" : "complaint",
    content:
      `${input.rating === "like" ? "Liked" : "Disliked"} Dawn reply` +
      (input.comment ? `: "${input.comment.slice(0, 400)}"` : "") +
      ` (reply: "${input.messageContent.slice(0, 200)}")`,
    intent: "feedback",
    sentiment: input.rating === "like" ? "positive" : "negative",
  }).catch(() => undefined);

  if (input.rating === "dislike") {
    await writeInsight({
      kind: "feedback_dislike",
      severity: input.comment ? "medium" : "low",
      status: "proposed",
      headline: "A client disliked a Dawn reply",
      evidence:
        `Reply: "${input.messageContent.slice(0, 400)}"` +
        (input.comment ? ` Client explanation: "${input.comment.slice(0, 400)}"` : " No explanation given.") +
        ` (case ${input.caseRow.public_reference})`,
      recommendation:
        "Review the reply against the client's explanation; consider a playbook update or copy fix.",
      metrics: { caseRef: input.caseRow.public_reference, messageId: input.messageId },
    });
  }
}

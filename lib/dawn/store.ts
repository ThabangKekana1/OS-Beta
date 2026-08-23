/**
 * DAWN — conversation and playbook persistence (service-role Supabase).
 */
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { DawnMovement } from "./context";
import { createHash, randomUUID } from "node:crypto";

export type DawnStoredMessage = {
  id: string;
  conversationId: string;
  role: "client" | "dawn";
  content: string;
  createdAt: string;
  context: Record<string, unknown>;
};

export type DawnConversation = {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
};

function client() {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin configuration is unavailable.");
  return admin;
}

export async function listConversations(caseId: string): Promise<DawnConversation[]> {
  const { data, error } = await client()
    .from("foundation1_dawn_conversations")
    .select("id,title,created_at,last_message_at")
    .eq("case_id", caseId)
    .order("last_message_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    createdAt: row.created_at as string,
    lastMessageAt: row.last_message_at as string,
  }));
}

export async function ensureConversation(
  caseId: string,
  conversationId?: string | null,
): Promise<DawnConversation> {
  if (conversationId) {
    const { data } = await client()
      .from("foundation1_dawn_conversations")
      .select("id,title,created_at,last_message_at,case_id")
      .eq("id", conversationId)
      .eq("case_id", caseId)
      .maybeSingle();
    if (data) {
      return {
        id: data.id as string,
        title: data.title as string,
        createdAt: data.created_at as string,
        lastMessageAt: data.last_message_at as string,
      };
    }
  }
  const { data, error } = await client()
    .from("foundation1_dawn_conversations")
    .insert({ case_id: caseId })
    .select("id,title,created_at,last_message_at")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id as string,
    title: data.title as string,
    createdAt: data.created_at as string,
    lastMessageAt: data.last_message_at as string,
  };
}

export async function listMessages(
  conversationId: string,
  limit = 40,
): Promise<DawnStoredMessage[]> {
  const { data, error } = await client()
    .from("foundation1_dawn_messages")
    .select("id,conversation_id,role,content,created_at,context")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .reverse()
    .map((row) => ({
      id: row.id as string,
      conversationId: row.conversation_id as string,
      role: row.role as "client" | "dawn",
      content: row.content as string,
      createdAt: row.created_at as string,
      context: (row.context ?? {}) as Record<string, unknown>,
    }));
}

export async function appendMessage(input: {
  conversationId: string;
  caseId: string;
  role: "client" | "dawn";
  content: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await client().from("foundation1_dawn_messages").insert({
    conversation_id: input.conversationId,
    case_id: input.caseId,
    role: input.role,
    content: input.content.slice(0, 20000),
    context: input.context ?? {},
  });
  if (error) throw new Error(error.message);
  await client()
    .from("foundation1_dawn_conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", input.conversationId);
}

export async function retitleConversation(conversationId: string, title: string) {
  await client()
    .from("foundation1_dawn_conversations")
    .update({ title: title.slice(0, 160) })
    .eq("id", conversationId);
}

// ---------------------------------------------------------------------------
// Playbook: Dawn's versioned, auditable learned guidance.
// ---------------------------------------------------------------------------

export type DawnPlaybookEntry = {
  key: string;
  version: number;
  content: string;
  reason: string;
};

export async function loadActivePlaybook(): Promise<DawnPlaybookEntry[]> {
  const { data, error } = await client()
    .from("foundation1_dawn_playbook")
    .select("key,version,content,reason,active")
    .eq("active", true)
    .order("key", { ascending: true })
    .order("version", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  const entries: DawnPlaybookEntry[] = [];
  for (const row of data ?? []) {
    const key = row.key as string;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      key,
      version: row.version as number,
      content: row.content as string,
      reason: row.reason as string,
    });
  }
  return entries;
}

/** Applies a playbook update as a new version and deactivates the old one. */
export async function applyPlaybookUpdate(input: {
  key: string;
  content: string;
  reason: string;
  sourceInsightId?: string | null;
}): Promise<{ version: number }> {
  const admin = client();
  const { data } = await admin
    .from("foundation1_dawn_playbook")
    .select("version")
    .eq("key", input.key)
    .order("version", { ascending: false })
    .limit(1);
  const nextVersion = ((data?.[0]?.version as number | undefined) ?? 0) + 1;
  await admin
    .from("foundation1_dawn_playbook")
    .update({ active: false })
    .eq("key", input.key)
    .eq("active", true);
  const { error } = await admin.from("foundation1_dawn_playbook").insert({
    key: input.key,
    version: nextVersion,
    content: input.content.slice(0, 4000),
    reason: input.reason.slice(0, 2000),
    source_insight_id: input.sourceInsightId ?? null,
    active: true,
  });
  if (error) throw new Error(error.message);
  return { version: nextVersion };
}

// ---------------------------------------------------------------------------
// Memory: what Dawn remembers about each case, across conversations.
// ---------------------------------------------------------------------------

export type DawnMemoryEntry = { key: string; content: string; updatedAt: string };

const MEMORY_KEY_PATTERN = /^[a-z0-9_]{2,60}$/;

export async function loadMemory(caseId: string): Promise<DawnMemoryEntry[]> {
  const { data, error } = await client()
    .from("foundation1_dawn_memory")
    .select("key,content,updated_at")
    .eq("case_id", caseId)
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    key: row.key as string,
    content: row.content as string,
    updatedAt: row.updated_at as string,
  }));
}

export async function upsertMemory(input: {
  caseId: string;
  key: string;
  content: string;
}): Promise<void> {
  const key = input.key.toLowerCase().trim();
  if (!MEMORY_KEY_PATTERN.test(key)) return;
  await client().from("foundation1_dawn_memory").upsert(
    {
      case_id: input.caseId,
      key,
      content: input.content.slice(0, 1000),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "case_id,key" },
  );
}

// ---------------------------------------------------------------------------
// Feedback: the client grades Dawn and explains why. Every grade is learning.
// ---------------------------------------------------------------------------

export async function recordFeedback(input: {
  messageId: string;
  caseId: string;
  rating: "like" | "dislike";
  comment?: string | null;
}): Promise<{ ok: boolean }> {
  const admin = client();
  const { data: message } = await admin
    .from("foundation1_dawn_messages")
    .select("id,case_id,role")
    .eq("id", input.messageId)
    .eq("case_id", input.caseId)
    .maybeSingle();
  if (!message || message.role !== "dawn") return { ok: false };
  const { error } = await admin.from("foundation1_dawn_feedback").upsert(
    {
      message_id: input.messageId,
      case_id: input.caseId,
      rating: input.rating,
      comment: input.comment ? input.comment.slice(0, 2000) : null,
    },
    { onConflict: "message_id" },
  );
  return { ok: !error };
}

// ---------------------------------------------------------------------------
// Demand intelligence: structured signals about what SA businesses want.
// ---------------------------------------------------------------------------

export type DemandSignalKind =
  | "want"
  | "challenge"
  | "objection"
  | "competitor_mention"
  | "budget_signal"
  | "timing_signal"
  | "complaint"
  | "excitement"
  | "risk_flag";

export async function recordDemandSignal(input: {
  caseId: string;
  conversationId?: string | null;
  signalKind: DemandSignalKind;
  content: string;
  intent?: string | null;
  sentiment?: "negative" | "neutral" | "positive" | null;
}): Promise<void> {
  await client().from("foundation1_dawn_demand_signals").insert({
    case_id: input.caseId,
    conversation_id: input.conversationId ?? null,
    signal_kind: input.signalKind,
    content: input.content.slice(0, 2000),
    intent: input.intent ? input.intent.slice(0, 80) : null,
    sentiment: input.sentiment ?? null,
  });
}

// ---------------------------------------------------------------------------
// Movements: stored on the existing behaviour rails, keyed by case-token hash.
// ---------------------------------------------------------------------------

function environment(): "production" | "development" | "test" {
  if (process.env.NODE_ENV === "production") return "production";
  if (process.env.NODE_ENV === "test") return "test";
  return "development";
}

export function caseVisitorHash(caseId: string): string {
  return createHash("sha256").update(`dawn:${caseId}`).digest("hex");
}

const MOVEMENT_EVENTS = new Set(["page_view", "interaction", "engagement", "client_error"]);

export async function recordMovement(input: {
  caseId: string;
  sessionId: string;
  eventName: string;
  pageKey: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  if (!MOVEMENT_EVENTS.has(input.eventName)) return;
  const sessionHash = createHash("sha256").update(`dawn:${input.sessionId}`).digest("hex");
  const { error } = await client().from("foundation1_behavior_events").insert({
    id: randomUUID(),
    occurred_at: new Date().toISOString(),
    environment: environment(),
    surface: "migration_workspace",
    event_name: input.eventName,
    page_key: input.pageKey.slice(0, 180) || "home",
    visitor_hash: caseVisitorHash(input.caseId),
    session_hash: sessionHash,
    consent_basis: environment() === "test" ? "test" : "analytics_consent",
    properties: input.detail ?? {},
    schema_version: "dawn-1",
  });
  if (error) throw new Error(error.message);
}

export async function recentMovements(caseId: string, limit = 25): Promise<DawnMovement[]> {
  const { data, error } = await client()
    .from("foundation1_behavior_events")
    .select("occurred_at,event_name,page_key,properties")
    .eq("visitor_hash", caseVisitorHash(caseId))
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    at: row.occurred_at as string,
    eventName: row.event_name as string,
    pageKey: row.page_key as string,
    detail: (row.properties ?? {}) as Record<string, unknown>,
  }));
}

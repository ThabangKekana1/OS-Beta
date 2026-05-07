import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { callOpenRouterText, type LlmProvider } from "@/lib/assistant/openrouter";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type ChatMemory = {
  workspaceId: string;
  facts: string[];
  summary: string | null;
};

const TRANSCRIPT_TABLE = "oneos_chat_transcripts";
const MEMORY_TABLE = "oneos_chat_memory";

export async function loadChatMemory(workspaceId: string): Promise<ChatMemory | null> {
  const client = getSupabaseAdminClient();
  if (!client || !workspaceId) {
    return null;
  }

  const { data, error } = await client
    .from(MEMORY_TABLE)
    .select("workspace_id, facts, summary")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error || !data) {
    return { workspaceId, facts: [], summary: null };
  }

  const facts = Array.isArray(data.facts)
    ? (data.facts.filter((f: unknown) => typeof f === "string") as string[])
    : [];

  return {
    workspaceId,
    facts,
    summary: typeof data.summary === "string" ? data.summary : null,
  };
}

export async function loadRecentTranscript(
  workspaceId: string,
  caseId: string | null,
  limit = 24,
): Promise<ChatTurn[]> {
  const client = getSupabaseAdminClient();
  if (!client || !workspaceId) {
    return [];
  }

  let query = client
    .from(TRANSCRIPT_TABLE)
    .select("role, content, created_at")
    .eq("workspace_id", workspaceId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (caseId) {
    query = query.eq("case_id", caseId);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  return data
    .map((row) => ({
      role: row.role as "user" | "assistant",
      content: typeof row.content === "string" ? row.content : "",
    }))
    .filter((row) => row.content.length > 0)
    .reverse();
}

type LogTurnInput = {
  workspaceId: string;
  caseId: string | null;
  caseName: string | null;
  mode: string | null;
  role: "user" | "assistant";
  content: string;
  context?: string | null;
  provider?: string | null;
  latencyMs?: number | null;
  sessionEmail?: string | null;
  clientIp?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logChatTurn(input: LogTurnInput): Promise<void> {
  const client = getSupabaseAdminClient();
  if (!client || !input.workspaceId) {
    return;
  }

  await client.from(TRANSCRIPT_TABLE).insert({
    workspace_id: input.workspaceId,
    case_id: input.caseId,
    case_name: input.caseName,
    conversation_mode: input.mode,
    role: input.role,
    content: input.content,
    context: input.context ?? null,
    provider: input.provider ?? null,
    latency_ms: input.latencyMs ?? null,
    session_email: input.sessionEmail ?? null,
    client_ip: input.clientIp ?? null,
    metadata: input.metadata ?? {},
  });
}

async function appendMemoryFacts(
  workspaceId: string,
  facts: string[],
): Promise<void> {
  const client = getSupabaseAdminClient();
  if (!client || !workspaceId || facts.length === 0) {
    return;
  }

  const existing = await loadChatMemory(workspaceId);
  const merged = Array.from(
    new Set([...(existing?.facts ?? []), ...facts.map((f) => f.trim()).filter(Boolean)]),
  ).slice(-200);

  await client
    .from(MEMORY_TABLE)
    .upsert({ workspace_id: workspaceId, facts: merged, summary: existing?.summary ?? null });
}

async function updateMemorySummary(
  workspaceId: string,
  summary: string,
): Promise<void> {
  const client = getSupabaseAdminClient();
  if (!client || !workspaceId) {
    return;
  }

  const existing = await loadChatMemory(workspaceId);
  await client
    .from(MEMORY_TABLE)
    .upsert({
      workspace_id: workspaceId,
      facts: existing?.facts ?? [],
      summary: summary.trim() || null,
    });
}

// ---------------------------------------------------------------------------
// Auto-maintenance: extract durable facts + roll up summary in background.
// ---------------------------------------------------------------------------

const SUMMARY_REFRESH_EVERY_TURNS = 10;

type GoogleTextRequest = {
  apiKey: string;
  model: string;
  prompt: string;
  maxOutputTokens: number;
};

type ModelTextRequest = GoogleTextRequest & {
  provider: LlmProvider;
};

async function callGoogleText({ apiKey, model, prompt, maxOutputTokens }: GoogleTextRequest) {
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens },
      }),
    }).finally(() => clearTimeout(timer));

    if (!response.ok) return null;
    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json?.candidates?.[0]?.content?.parts
      ?.map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();
    return text || null;
  } catch {
    return null;
  }
}

async function callModelText({ provider, apiKey, model, prompt, maxOutputTokens }: ModelTextRequest) {
  if (provider === "openrouter") {
    return callOpenRouterText({
      apiKey,
      model,
      prompt,
      maxOutputTokens,
      temperature: 0,
      timeoutMs: 30_000,
    });
  }

  return callGoogleText({ apiKey, model, prompt, maxOutputTokens });
}

async function countTurnsSinceSummary(workspaceId: string): Promise<number> {
  const client = getSupabaseAdminClient();
  if (!client) return 0;

  const memory = await loadChatMemory(workspaceId);
  const since = memory?.summary ? null : null; // we count total instead

  const { count } = await client
    .from(TRANSCRIPT_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  void since;
  return count ?? 0;
}

async function extractAndStoreFacts(input: {
  workspaceId: string;
  caseName: string | null;
  provider: LlmProvider;
  apiKey: string;
  model: string;
  latestUser: string;
  latestAssistant: string;
}) {
  const existing = await loadChatMemory(input.workspaceId);
  const known = (existing?.facts ?? []).slice(-30);

  const prompt = `You are a memory extractor for a customer migration agent.\n\nKnown durable facts about this client (do not repeat):\n${
    known.length > 0 ? known.map((f) => `- ${f}`).join("\n") : "(none yet)"
  }\n\nLatest exchange${input.caseName ? ` for ${input.caseName}` : ""}:\nUser: ${input.latestUser}\nAssistant: ${input.latestAssistant}\n\nExtract any NEW durable facts worth remembering long-term about this client (preferences, decisions, contact details, constraints, deadlines, named systems, family/staff names, business specifics). Each fact must be:\n- a single short declarative sentence\n- objectively about the client (not the assistant)\n- not already in the known list\n- not transient chit-chat\n\nReturn ONLY a strict JSON array of strings. If there is nothing new, return [].\nDo not wrap in markdown. Example: ["Customer prefers email over phone","Decision maker is Linda Mokoena (CFO)"]`;

  const raw = await callModelText({
    provider: input.provider,
    apiKey: input.apiKey,
    model: input.model,
    prompt,
    maxOutputTokens: 300,
  });

  if (!raw) return;

  let parsed: unknown;
  try {
    const cleaned = raw
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return;
  }

  if (!Array.isArray(parsed)) return;
  const facts = parsed
    .filter((f): f is string => typeof f === "string" && f.trim().length > 0 && f.length < 240)
    .map((f) => f.trim());

  if (facts.length === 0) return;
  await appendMemoryFacts(input.workspaceId, facts);
}

async function rollUpSummaryIfDue(input: {
  workspaceId: string;
  provider: LlmProvider;
  apiKey: string;
  model: string;
}) {
  const total = await countTurnsSinceSummary(input.workspaceId);
  // Refresh summary every N user-or-assistant turns logged.
  if (total === 0 || total % SUMMARY_REFRESH_EVERY_TURNS !== 0) return;

  const recent = await loadRecentTranscript(input.workspaceId, null, 60);
  if (recent.length === 0) return;

  const transcript = recent
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n");

  const prompt = `Summarize the following conversation between a customer and Dawn (the 1OS migration agent) into 4-7 short bullet points capturing: where they are in the migration, key decisions, blockers, commitments made, and open questions. Be specific. Do not invent facts. Output bullets only, no preamble.\n\nTranscript:\n${transcript}`;

  const summary = await callModelText({
    provider: input.provider,
    apiKey: input.apiKey,
    model: input.model,
    prompt,
    maxOutputTokens: 400,
  });

  if (summary) {
    await updateMemorySummary(input.workspaceId, summary);
  }
}

export async function scheduleMemoryMaintenance(input: {
  workspaceId: string;
  caseId: string | null;
  caseName: string | null;
  provider: LlmProvider;
  apiKey: string;
  model: string;
  latestUser: string;
  latestAssistant: string;
}): Promise<void> {
  if (!input.workspaceId || !input.apiKey) return;

  try {
    await Promise.all([
      extractAndStoreFacts({
        workspaceId: input.workspaceId,
        caseName: input.caseName,
        provider: input.provider,
        apiKey: input.apiKey,
        model: input.model,
        latestUser: input.latestUser,
        latestAssistant: input.latestAssistant,
      }),
      rollUpSummaryIfDue({
        workspaceId: input.workspaceId,
        provider: input.provider,
        apiKey: input.apiKey,
        model: input.model,
      }),
    ]);
  } catch {
    // Background maintenance is best-effort.
  }
}

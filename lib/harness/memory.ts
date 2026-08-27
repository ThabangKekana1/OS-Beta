/**
 * HARNESS — memory and playbook persistence, generalised from the Dawn
 * pattern (lib/dawn/store.ts). Each agent keeps:
 *   - a versioned playbook (what the agent currently says/does per situation,
 *     every change carrying a reason and optionally its source insight), and
 *   - episodic memory rows scoped to a case/prospect (where it has been).
 *
 * The founder can read exactly what an agent changed about itself and why —
 * self-improvement must stay inspectable.
 */
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type PlaybookEntry = {
  key: string;
  content: string;
  version: number;
  reason: string;
  updatedAt: string;
};

function client() {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin configuration is unavailable.");
  return admin;
}

export async function loadPlaybook(agent: string): Promise<PlaybookEntry[]> {
  const { data, error } = await client()
    .from("foundation1_agent_playbooks")
    .select("*")
    .eq("agent", agent)
    .order("key", { ascending: true })
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  // History is kept forever; only the newest version of each key is active.
  const active = new Map<string, PlaybookEntry>();
  for (const row of data ?? []) {
    const key = row.key as string;
    if (active.has(key)) continue;
    active.set(key, {
      key,
      content: row.content as string,
      version: row.version as number,
      reason: row.reason as string,
      updatedAt: row.updated_at as string,
    });
  }
  return [...active.values()];
}

export async function loadPlaybookText(agent: string): Promise<string> {
  const entries = await loadPlaybook(agent);
  if (!entries.length) return "No learned playbook yet. Follow the system prompt.";
  return entries
    .map((entry) => `[${entry.key}] v${entry.version}\n${entry.content}`)
    .join("\n\n");
}

/** Applies a change by writing the next version; the old version stays in history. */
export async function applyPlaybookUpdate(input: {
  agent: string;
  key: string;
  content: string;
  reason: string;
  sourceInsight?: string | null;
}): Promise<PlaybookEntry> {
  const { data: current } = await client()
    .from("foundation1_agent_playbooks")
    .select("version")
    .eq("agent", input.agent)
    .eq("key", input.key)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = ((current?.version as number | undefined) ?? 0) + 1;
  const row = {
    agent: input.agent,
    key: input.key,
    content: input.content,
    version,
    reason: input.reason,
    source_insight: input.sourceInsight ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client()
    .from("foundation1_agent_playbooks")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return {
    key: data.key as string,
    content: data.content as string,
    version: data.version as number,
    reason: data.reason as string,
    updatedAt: data.updated_at as string,
  };
}

export type MemoryEntry = {
  kind: string;
  scopeKey: string;
  content: Record<string, unknown>;
  createdAt: string;
};

/** Append episodic memory: what happened with this prospect/case, for continuity. */
export async function appendMemory(input: {
  agent: string;
  kind: string;
  scopeKey: string;
  content: Record<string, unknown>;
}): Promise<void> {
  const { error } = await client().from("foundation1_agent_memory").insert({
    agent: input.agent,
    kind: input.kind,
    scope_key: input.scopeKey,
    content: input.content,
  });
  if (error) throw new Error(error.message);
}

export async function listMemory(agent: string, scopeKey: string, limit = 20): Promise<MemoryEntry[]> {
  const { data, error } = await client()
    .from("foundation1_agent_memory")
    .select("*")
    .eq("agent", agent)
    .eq("scope_key", scopeKey)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    kind: row.kind as string,
    scopeKey: row.scope_key as string,
    content: (row.content ?? {}) as Record<string, unknown>,
    createdAt: row.created_at as string,
  }));
}

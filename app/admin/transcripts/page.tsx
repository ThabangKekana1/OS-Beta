import { requireServerAuthSession } from "@/lib/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { TranscriptsView, type TranscriptThread, type TranscriptTurn, type MemoryEntry } from "@/components/admin/routes/AdminTranscriptsRoute";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ workspace?: string; case?: string }>;

async function fetchThreads(): Promise<TranscriptThread[]> {
  const client = getSupabaseAdminClient();
  if (!client) return [];

  const { data } = await client
    .from("oneos_chat_transcripts")
    .select("workspace_id, case_id, case_name, role, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);

  if (!data) return [];

  const map = new Map<string, TranscriptThread>();
  for (const row of data) {
    const workspaceId = String(row.workspace_id ?? "");
    const caseId = row.case_id ? String(row.case_id) : "";
    const key = `${workspaceId}::${caseId}`;
    const existing = map.get(key);
    if (existing) {
      existing.turnCount += 1;
      if (row.role === "user") existing.userTurnCount += 1;
    } else {
      map.set(key, {
        workspaceId,
        caseId: caseId || null,
        caseName: row.case_name ? String(row.case_name) : null,
        lastAt: String(row.created_at),
        turnCount: 1,
        userTurnCount: row.role === "user" ? 1 : 0,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

async function fetchTurns(workspaceId: string, caseId: string | null): Promise<TranscriptTurn[]> {
  const client = getSupabaseAdminClient();
  if (!client) return [];

  let query = client
    .from("oneos_chat_transcripts")
    .select(
      "id, role, content, conversation_mode, provider, latency_ms, context, session_email, client_ip, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (caseId) query = query.eq("case_id", caseId);

  const { data } = await query;
  if (!data) return [];

  return data.map((row) => ({
    id: String(row.id),
    role: row.role as "user" | "assistant" | "system",
    content: String(row.content ?? ""),
    mode: row.conversation_mode ? String(row.conversation_mode) : null,
    provider: row.provider ? String(row.provider) : null,
    latencyMs: typeof row.latency_ms === "number" ? row.latency_ms : null,
    context: row.context ? String(row.context) : null,
    sessionEmail: row.session_email ? String(row.session_email) : null,
    clientIp: row.client_ip ? String(row.client_ip) : null,
    createdAt: String(row.created_at),
  }));
}

async function fetchMemory(workspaceId: string): Promise<MemoryEntry | null> {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  const { data } = await client
    .from("oneos_chat_memory")
    .select("workspace_id, facts, summary, updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) return null;
  return {
    workspaceId: String(data.workspace_id),
    facts: Array.isArray(data.facts)
      ? data.facts.filter((f: unknown): f is string => typeof f === "string")
      : [],
    summary: data.summary ? String(data.summary) : null,
    updatedAt: String(data.updated_at),
  };
}

export default async function AdminTranscriptsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireServerAuthSession("admin");
  const params = await searchParams;
  const workspaceId = params.workspace ?? null;
  const caseId = params.case ?? null;

  const [threads, turns, memory] = await Promise.all([
    fetchThreads(),
    workspaceId ? fetchTurns(workspaceId, caseId) : Promise.resolve([] as TranscriptTurn[]),
    workspaceId ? fetchMemory(workspaceId) : Promise.resolve(null),
  ]);

  return (
    <TranscriptsView
      threads={threads}
      activeWorkspaceId={workspaceId}
      activeCaseId={caseId}
      turns={turns}
      memory={memory}
    />
  );
}

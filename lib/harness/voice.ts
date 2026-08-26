/**
 * HARNESS — the voice (doc 21, man-machine protocol).
 *
 * One thread, three authors: founder, harness ("MI"), and platform events.
 * The harness speaks when spoken to AND on its own initiative — dispatch
 * summaries, draft batches landing, escalations. Real-time today means
 * short-poll; the message shape is stream-ready so SSE can slot in later
 * without touching consumers.
 */
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type DeckRole = "founder" | "harness" | "event";

export type DeckMessage = {
  id: string;
  role: DeckRole;
  content: string;
  meta: Record<string, unknown>;
  createdAt: string;
};

function client() {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin configuration is unavailable.");
  return admin;
}

export async function appendDeckMessage(role: DeckRole, content: string, meta: Record<string, unknown> = {}): Promise<DeckMessage> {
  const { data, error } = await client()
    .from("foundation1_deck_messages")
    .insert({ role, content, meta })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id as string,
    role: data.role as DeckRole,
    content: data.content as string,
    meta: (data.meta ?? {}) as Record<string, unknown>,
    createdAt: data.created_at as string,
  };
}

/**
 * Fire-and-forget voice for platform events. Never blocks or throws into a
 * business flow: if the thread lags, the pipeline must not.
 */
export function say(content: string, meta: Record<string, unknown> = {}): void {
  void appendDeckMessage("event", content, meta).catch(() => undefined);
}

export async function listDeckMessages(sinceIso?: string | null, limit = 120): Promise<DeckMessage[]> {
  let query = client()
    .from("foundation1_deck_messages")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (sinceIso) query = query.gt("created_at", sinceIso);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    role: row.role as DeckRole,
    content: row.content as string,
    meta: (row.meta ?? {}) as Record<string, unknown>,
    createdAt: row.created_at as string,
  }));
}

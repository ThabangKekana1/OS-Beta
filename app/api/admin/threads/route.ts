/**
 * Threads (doc 21): every live human conversation, one list. Today that is
 * email (Resend inbound) + Dawn case conversations; WhatsApp joins when its
 * credentials land. The founder answers as himself — the harness never
 * speaks for him here.
 */
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { listThreads } from "@/lib/email-threads";

type ThreadRow = {
  id: string;
  source: "email" | "dawn";
  title: string;
  snippet: string;
  updatedAt: string;
  unread: boolean;
  caseToken?: string | null;
};

export async function GET() {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const admin = getSupabaseAdminClient();

  const emailThreads: ThreadRow[] = await listThreads({ limit: 30 })
    .then((rows) =>
      rows.map((thread) => ({
        id: `email:${thread.id}`,
        source: "email" as const,
        title: thread.subject ?? thread.participants?.[0] ?? "Email thread",
        snippet:
          thread.lastDirection === "inbound"
            ? "awaiting your reply"
            : thread.lastDirection === "outbound"
              ? "you replied last"
              : "",
        updatedAt: thread.lastMessageAt ?? "",
        unread: thread.unreadCount > 0,
        caseToken: null,
      })),
    )
    .catch(() => []);

  // Dawn conversations carry their migration-case token for deep-linking.
  type DawnRow = { id: string; title: string | null; last_message_at: string | null; case_id: string | null };
  let dawnRows: DawnRow[] = [];
  if (admin) {
    try {
      const { data, error } = await admin
        .from("foundation1_dawn_conversations")
        .select("id,title,last_message_at,case_id")
        .order("last_message_at", { ascending: false })
        .limit(30);
      dawnRows = error ? [] : ((data ?? []) as DawnRow[]);
    } catch {
      dawnRows = [];
    }
  }

  const caseTokens = new Map<string, string>();
  const caseIds = [...new Set(dawnRows.map((row) => row.case_id as string).filter(Boolean))];
  if (admin && caseIds.length) {
    const { data: cases } = await admin
      .from("migration_cases")
      .select("id,access_token")
      .in("id", caseIds);
    for (const row of (cases ?? []) as Array<{ id: string; access_token: string }>) caseTokens.set(row.id, row.access_token);
  }

  const dawnThreads: ThreadRow[] = dawnRows.map((row) => ({
    id: `dawn:${row.id}`,
    source: "dawn" as const,
    title: row.title || "Dawn conversation",
    snippet: "",
    updatedAt: (row.last_message_at as string) ?? "",
    unread: false,
    caseToken: row.case_id ? caseTokens.get(row.case_id as string) ?? null : null,
  }));

  const all = [...emailThreads, ...dawnThreads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return NextResponse.json({ ok: true, threads: all });
}

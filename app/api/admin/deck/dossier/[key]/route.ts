/**
 * Prospect dossier (doc 21): everything the platform knows about one
 * prospect in a single read — book row with its evidence, every queued or
 * sent touch, outcome events, and what the harness has written to memory.
 */
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string }> },
) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { key } = await context.params;
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Store unavailable." }, { status: 503 });
  }

  const [bookRes, queueRes, outcomesRes, memoryRes] = await Promise.all([
    admin.from("foundation1_sales_book").select("*").eq("book_id", key).maybeSingle(),
    admin
      .from("foundation1_send_queue")
      .select("id,subject,status,to_address,created_at,sent_at,rejected_reason,payload")
      .eq("prospect_key", key)
      .order("created_at", { ascending: false }),
    admin
      .from("foundation1_outcomes")
      .select("event,occurred_at,meta")
      .eq("prospect_key", key)
      .order("occurred_at", { ascending: false })
      .limit(50),
    admin
      .from("foundation1_agent_memory")
      .select("kind,content,created_at")
      .eq("agent", "sales-harness")
      .eq("scope_key", key)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (queueRes.error || outcomesRes.error || memoryRes.error) {
    return NextResponse.json(
      { ok: false, error: queueRes.error?.message ?? outcomesRes.error?.message ?? memoryRes.error?.message ?? "Dossier query failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    key,
    book: bookRes.data ?? null,
    touches: queueRes.data ?? [],
    outcomes: outcomesRes.data ?? [],
    memory: memoryRes.data ?? [],
  });
}

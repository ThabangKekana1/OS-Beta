import { NextRequest, NextResponse } from "next/server";
import { requireServerAuthSession } from "@/lib/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await requireServerAuthSession("admin");

  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspace");
  const caseId = url.searchParams.get("case");

  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  let query = client
    .from("oneos_chat_transcripts")
    .select(
      "workspace_id, case_id, case_name, conversation_mode, role, content, context, provider, latency_ms, session_email, client_ip, created_at",
    )
    .order("created_at", { ascending: true })
    .limit(50_000);

  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  if (caseId) query = query.eq("case_id", caseId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lines = (data ?? []).map((row) => JSON.stringify(row)).join("\n");
  const filename = `oneos-transcripts${workspaceId ? `-${workspaceId}` : ""}${caseId ? `-${caseId}` : ""}.jsonl`;

  return new NextResponse(lines, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

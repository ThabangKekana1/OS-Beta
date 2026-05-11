import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { EmailDirection } from "@/lib/email-threads";

export const runtime = "nodejs";

type ThreadRow = {
  id: string;
  lead_id: string | null;
  last_message_at: string;
  last_direction: EmailDirection | null;
  unread_count: number;
};

type EngagementRecord = {
  leadId: string;
  latestThreadId: string;
  lastMessageAt: string;
  lastDirection: EmailDirection | null;
  unreadCount: number;
  state: "awaiting_reply" | "responded";
};

function parseLeadIds(value: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => /^[A-Za-z0-9_-]{3,80}$/.test(entry));
}

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session || (session.role !== "sales" && session.role !== "admin" && session.role !== "partner")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ engagement: {} });
  }

  const url = new URL(request.url);
  const leadIds = parseLeadIds(url.searchParams.get("leadIds"));

  let query = supabase
    .from("oneos_email_threads")
    .select("id, lead_id, last_message_at, last_direction, unread_count")
    .not("lead_id", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(1000);

  if (leadIds.length > 0) {
    query = query.in("lead_id", leadIds);
  }

  if (session.role === "sales" || session.role === "partner") {
    if (session.userId) {
      query = query.eq("mailbox_owner_user_id", session.userId);
    } else {
      query = query.eq("mailbox_address", session.email.trim().toLowerCase());
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("[email/lead-engagement] list failed", error);
    return NextResponse.json({ error: "Could not load lead engagement" }, { status: 500 });
  }

  const engagement: Record<string, EngagementRecord> = {};
  for (const row of (data ?? []) as ThreadRow[]) {
    if (!row.lead_id || engagement[row.lead_id]) continue;
    engagement[row.lead_id] = {
      leadId: row.lead_id,
      latestThreadId: row.id,
      lastMessageAt: row.last_message_at,
      lastDirection: row.last_direction,
      unreadCount: row.unread_count,
      state: row.last_direction === "inbound" ? "responded" : "awaiting_reply",
    };
  }

  return NextResponse.json({ engagement });
}

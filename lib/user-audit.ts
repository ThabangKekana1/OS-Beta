import type { AuthSession } from "@/lib/auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type UserAuditEventType = "login" | "logout";

type DbError = {
  code?: string;
  message?: string;
};

function isMissingRelationOrColumn(error: DbError | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip")?.trim() || null;
}

function clientUserAgent(request: Request) {
  const value = request.headers.get("user-agent")?.trim();
  return value ? value.slice(0, 500) : null;
}

async function updateSeenColumns(input: {
  userId: string | null;
  email: string;
  eventType: UserAuditEventType;
  at: string;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const update =
    input.eventType === "login"
      ? { last_login_at: input.at, last_seen_at: input.at }
      : { last_logout_at: input.at, last_seen_at: input.at };

  const query = supabase.from("oneos_users").update(update);
  const { error } = input.userId
    ? await query.eq("id", input.userId)
    : await query.eq("email", input.email);

  if (!error) return;

  if (isMissingRelationOrColumn(error) && input.eventType === "login") {
    const fallbackQuery = supabase
      .from("oneos_users")
      .update({ last_login_at: input.at });
    const { error: fallbackError } = input.userId
      ? await fallbackQuery.eq("id", input.userId)
      : await fallbackQuery.eq("email", input.email);
    if (!fallbackError || isMissingRelationOrColumn(fallbackError)) return;
    throw fallbackError;
  }

  if (isMissingRelationOrColumn(error)) return;
  throw error;
}

export async function recordUserAuditEvent({
  session,
  request,
  eventType,
}: {
  session: AuthSession;
  request: Request;
  eventType: UserAuditEventType;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: true, persisted: false };

  const at = new Date().toISOString();
  const email = session.email.trim().toLowerCase();

  await updateSeenColumns({
    userId: session.userId,
    email,
    eventType,
    at,
  });

  const { error } = await supabase.from("oneos_user_audit_events").insert({
    user_id: session.userId,
    email,
    role: session.role,
    agent_id: session.agentId,
    event_type: eventType,
    ip_address: clientIp(request),
    user_agent: clientUserAgent(request),
    created_at: at,
  });

  if (error) {
    if (isMissingRelationOrColumn(error)) return { ok: true, persisted: false };
    throw error;
  }

  return { ok: true, persisted: true };
}

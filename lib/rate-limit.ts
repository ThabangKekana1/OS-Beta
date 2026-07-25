import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
};

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("does not exist");
}

/**
 * Fixed-window rate limiter backed by Postgres.
 *
 * Not perfectly atomic (no SELECT FOR UPDATE through PostgREST) but adequate
 * for guarding auth/chat endpoints from abuse. For higher precision use a
 * dedicated rate-limit service.
 *
 * FAILURE POSTURE: closed. A read or write error means the limiter cannot
 * count, so it must not pretend the request is within budget — that turned a
 * database blip into an unlimited-traffic window. Every gated route needs the
 * same database to do its real work, so failing closed costs no availability
 * that was not already lost.
 *
 * The one exception is a genuinely absent table, which means the limiter has
 * not been provisioned rather than that it is failing; that stays permissive so
 * a fresh environment is not bricked.
 */
export async function consumeRateLimit(input: {
  scope: string;
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const now = Date.now();
  const expiresAt = new Date(now + input.windowSeconds * 1000);
  /** Used only when the limiter is not provisioned at all. */
  const unprovisioned: RateLimitResult = {
    allowed: true,
    remaining: input.limit - 1,
    resetAt: expiresAt,
  };
  const denied: RateLimitResult = { allowed: false, remaining: 0, resetAt: expiresAt };

  const supabase = getSupabaseAdminClient();
  if (!supabase) return unprovisioned;

  // Read current bucket.
  const { data, error } = await supabase
    .from("oneos_rate_limits")
    .select("count, window_started_at, expires_at")
    .eq("scope", input.scope)
    .eq("key", input.key)
    .maybeSingle();

  if (isMissingRelationError(error)) return unprovisioned;
  if (error) {
    console.error("[rate-limit] read failed; denying", { scope: input.scope, error });
    return denied;
  }

  const existing = data && new Date(data.expires_at as string).getTime() > now ? data : null;
  const currentCount = existing ? Number(existing.count) : 0;
  const windowStartedAt = existing
    ? new Date(existing.window_started_at as string)
    : new Date(now);
  const resetAt = existing ? new Date(existing.expires_at as string) : expiresAt;

  if (currentCount >= input.limit) {
    return { allowed: false, remaining: 0, resetAt };
  }

  const nextCount = currentCount + 1;
  const upsertResult = await supabase.from("oneos_rate_limits").upsert(
    {
      scope: input.scope,
      key: input.key,
      count: nextCount,
      window_started_at: windowStartedAt.toISOString(),
      expires_at: resetAt.toISOString(),
    },
    { onConflict: "scope,key" },
  );

  if (upsertResult.error) {
    if (isMissingRelationError(upsertResult.error)) return unprovisioned;
    console.error("[rate-limit] write failed; denying", { scope: input.scope, error: upsertResult.error });
    return denied;
  }

  return {
    allowed: true,
    remaining: Math.max(0, input.limit - nextCount),
    resetAt,
  };
}

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
 */
export async function consumeRateLimit(input: {
  scope: string;
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const now = Date.now();
  const expiresAt = new Date(now + input.windowSeconds * 1000);
  const fallback: RateLimitResult = {
    allowed: true,
    remaining: input.limit - 1,
    resetAt: expiresAt,
  };

  const supabase = getSupabaseAdminClient();
  if (!supabase) return fallback;

  // Read current bucket.
  const { data, error } = await supabase
    .from("oneos_rate_limits")
    .select("count, window_started_at, expires_at")
    .eq("scope", input.scope)
    .eq("key", input.key)
    .maybeSingle();

  if (isMissingRelationError(error)) return fallback;
  if (error) {
    // Don't block the request on rate-limit infra errors. Log and allow.
    console.error("[rate-limit] read failed", { error });
    return fallback;
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

  if (upsertResult.error && !isMissingRelationError(upsertResult.error)) {
    console.error("[rate-limit] write failed", { error: upsertResult.error });
    return fallback;
  }

  return {
    allowed: true,
    remaining: Math.max(0, input.limit - nextCount),
    resetAt,
  };
}

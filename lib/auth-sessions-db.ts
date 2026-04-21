import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("does not exist");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function recordAuthSession(input: {
  userId: string;
  token: string;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const tokenHash = await sha256Hex(input.token);

  const { error } = await supabase.from("oneos_auth_sessions").insert({
    user_id: input.userId,
    token_hash: tokenHash,
    user_agent: input.userAgent,
    ip_address: input.ipAddress,
    expires_at: input.expiresAt.toISOString(),
  });

  if (error && !isMissingRelationError(error)) throw error;
}

export async function isSessionRevoked(token: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const tokenHash = await sha256Hex(token);

  const { data, error } = await supabase
    .from("oneos_auth_sessions")
    .select("revoked_at, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (isMissingRelationError(error)) return false;
  if (error) throw error;
  if (!data) {
    // If we can't find the session row, treat as revoked in production.
    // In development we tolerate this so existing tokens keep working after
    // the migration.
    return process.env.NODE_ENV === "production";
  }

  if (data.revoked_at) return true;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return true;
  return false;
}

export async function revokeAuthSession(token: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const tokenHash = await sha256Hex(token);

  await supabase
    .from("oneos_auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);
}

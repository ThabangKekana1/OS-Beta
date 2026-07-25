import { randomBytes, createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { migrationCaseTokenExpiry, type MigrationCaseRow } from "@/lib/migration-case-store";

/**
 * Email deep links.
 *
 * The primary case access token is stored only as a hash, so a background job
 * can never rebuild a workspace URL. Lifecycle email therefore carries a
 * separate, stable credential: /c/<emailLinkToken>.
 *
 * Following that link rotates the primary access token and redirects into the
 * workspace. Sending an email does not rotate anything, so a client working in
 * the case is never logged out by a reminder arriving in their inbox.
 */

const EMAIL_LINK_PREFIX = "migration-case-email-link:";

export function hashEmailLinkToken(token: string) {
  return createHash("sha256").update(`${EMAIL_LINK_PREFIX}${token}`).digest("hex");
}

export function isEmailLinkTokenShape(token: string) {
  return /^[A-Za-z0-9_-]{32,60}$/.test(token);
}

/**
 * Issues a fresh email-link token for the case, replacing any previous one.
 *
 * Each lifecycle email therefore carries the only link that works: the newest
 * one. Following an older email lands on client-access recovery rather than a
 * dead end. Issuing does not touch the workspace access token, so a client
 * already working in the case is never interrupted.
 */
export async function issueCaseEmailLinkToken(caseRow: MigrationCaseRow): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const token = randomBytes(24).toString("base64url");
  const { error } = await supabase
    .from("migration_cases")
    .update({ email_link_hash: hashEmailLinkToken(token), email_link_hint: token.slice(-6) })
    .eq("id", caseRow.id);

  return error ? null : token;
}

/**
 * Resolves an email-link token to its case and issues a fresh workspace access
 * token. Previous workspace links stop working, which is the same posture as
 * client-access recovery.
 */
export async function redeemCaseEmailLink(
  token: string,
): Promise<{ caseRow: MigrationCaseRow; accessToken: string } | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !isEmailLinkTokenShape(token)) return null;

  const { data, error } = await supabase
    .from("migration_cases")
    .select("*")
    .eq("email_link_hash", hashEmailLinkToken(token))
    .limit(1);
  if (error || !data?.[0]) return null;

  const caseRow = data[0] as MigrationCaseRow;
  const accessToken = randomBytes(32).toString("base64url");
  const accessHash = createHash("sha256").update(`migration-case:${accessToken}`).digest("hex");

  const { error: rotateError } = await supabase
    .from("migration_cases")
    .update({
      access_token_hash: accessHash,
      token_hint: accessToken.slice(-6),
      access_token_expires_at: migrationCaseTokenExpiry(),
      last_client_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", caseRow.id);
  if (rotateError) return null;

  return { caseRow, accessToken };
}

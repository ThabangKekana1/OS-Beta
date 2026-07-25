import { createHash, randomBytes } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { PartnerType } from "@/lib/partner-distribution/types";

export const PARTNER_ONBOARDING_COOKIE = "f1_partner_onboarding";
export const PARTNER_ONBOARDING_MAX_AGE_SECONDS = 60 * 60 * 24;

export type PartnerOnboardingInviteView = {
  email: string | null;
  expiresAt: string;
};

export type PartnerOnboardingCompletionView = {
  organisationId: string;
  email: string;
  referralCode: string;
};

function client() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase admin configuration is unavailable.");
  }
  return supabase;
}

function validToken(token: string) {
  return /^[A-Za-z0-9_-]{32,80}$/.test(token);
}

function cleanText(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function partnerOnboardingTokenHash(token: string) {
  return createHash("sha256")
    .update(`partner-onboarding:${token}`)
    .digest("hex");
}

export function createPartnerOnboardingToken() {
  return randomBytes(32).toString("base64url");
}

export function createPartnerReferralCode() {
  return `F1-${randomBytes(5).toString("hex").toUpperCase()}`;
}

export async function issuePartnerOnboardingInvite(input: {
  createdByUserId: string;
  email?: string | null;
  expiresAt: string;
}) {
  const token = createPartnerOnboardingToken();
  const email = input.email?.trim().toLowerCase() || null;
  const { data, error } = await client()
    .from("partner_onboarding_invites")
    .insert({
      token_hash: partnerOnboardingTokenHash(token),
      email,
      expires_at: input.expiresAt,
      created_by_user_id: input.createdByUserId,
    })
    .select("id,expires_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Unable to issue partner invitation.");
  }
  return {
    id: data.id as string,
    token,
    email,
    expiresAt: data.expires_at as string,
  };
}

export async function findPartnerOnboardingInvite(
  token: string,
): Promise<PartnerOnboardingInviteView | null> {
  if (!validToken(token)) return null;
  const { data, error } = await client()
    .from("partner_onboarding_invites")
    .select("email,expires_at,status,revoked_at")
    .eq("token_hash", partnerOnboardingTokenHash(token))
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (
    !data
    || data.status !== "pending"
    || data.revoked_at
    || new Date(data.expires_at as string).getTime() <= Date.now()
  ) {
    return null;
  }
  return {
    email: (data.email as string | null) ?? null,
    expiresAt: data.expires_at as string,
  };
}

export async function claimPartnerOnboardingInvite(input: {
  inviteToken: string;
  authUserId: string;
  email: string;
  contactName: string;
  organisationName: string;
  partnerType: PartnerType;
}) {
  if (!validToken(input.inviteToken)) {
    throw new Error("Partner onboarding invitation is invalid.");
  }

  const completionToken = createPartnerOnboardingToken();
  const referralCode = createPartnerReferralCode();
  const { data, error } = await client().rpc(
    "claim_partner_onboarding_invite",
    {
      p_invite_token_hash: partnerOnboardingTokenHash(input.inviteToken),
      p_completion_token_hash:
        partnerOnboardingTokenHash(completionToken),
      p_auth_user_id: input.authUserId,
      p_email: input.email.trim().toLowerCase(),
      p_contact_name: cleanText(input.contactName, 160),
      p_organisation_name: cleanText(input.organisationName, 180),
      p_partner_type: input.partnerType,
      p_referral_code: referralCode,
    },
  );

  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.organisation_id) {
    throw new Error("Partner onboarding could not be started.");
  }

  return {
    organisationId: row.organisation_id as string,
    referralCode: row.organisation_referral_code as string,
    completionToken,
  };
}

export async function findPartnerOnboardingCompletion(
  completionToken: string,
): Promise<PartnerOnboardingCompletionView | null> {
  if (!validToken(completionToken)) return null;
  const { data, error } = await client()
    .from("partner_onboarding_invites")
    .select(
      "status,expires_at,association_id,claimed_by_auth_user_id",
    )
    .eq(
      "completion_token_hash",
      partnerOnboardingTokenHash(completionToken),
    )
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (
    !data
    || data.status !== "claimed"
    || !data.association_id
    || new Date(data.expires_at as string).getTime() <= Date.now()
  ) {
    return null;
  }

  const [{ data: association, error: associationError }, authUserResult] =
    await Promise.all([
      client()
        .from("associations")
        .select("referral_code")
        .eq("id", data.association_id)
        .single(),
      client().auth.admin.getUserById(
        data.claimed_by_auth_user_id as string,
      ),
    ]);
  if (
    associationError
    || !association?.referral_code
    || authUserResult.error
    || !authUserResult.data.user?.email
  ) {
    return null;
  }

  return {
    organisationId: data.association_id as string,
    email: authUserResult.data.user.email,
    referralCode: association.referral_code,
  };
}

export async function completePartnerOnboarding(input: {
  completionToken: string;
  referrals: Array<{ email: string; source: "paste" | "csv" }>;
}) {
  if (!validToken(input.completionToken)) {
    throw new Error("Partner onboarding session is invalid.");
  }
  const { data, error } = await client().rpc(
    "complete_partner_onboarding",
    {
      p_completion_token_hash:
        partnerOnboardingTokenHash(input.completionToken),
      p_referrals: input.referrals,
    },
  );
  if (error) throw new Error(error.message);
  return Number(data);
}

import { createHash, randomBytes } from "node:crypto";
import type { AuthSession } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import {
  normalisePartnerInviteEmail,
  type ParsedPartnerInvite,
} from "@/lib/partner-distribution/invitations";
import {
  partnerOrganisationIdForSession,
} from "@/lib/partner-distribution/permissions";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,80}$/;
const CAMPAIGN_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,63}$/;
const DEFAULT_INVITATION_EXPIRY_DAYS = 14;
const MAX_INVITATIONS_PER_BATCH = 100;
const DELIVERY_CONCURRENCY = 5;
const DEFAULT_WEBSITE_ORIGIN = "https://foundation-1.co.za";

type InvitationSource = ParsedPartnerInvite["source"] | "individual_link";

export type PartnerAttributionInput = {
  inviteToken: string | null;
  campaignCode: string | null;
};

export type PartnerInvitationDelivery = {
  referralId: string | null;
  email: string;
  delivered: boolean;
  error: string | null;
};

export class PartnerAttributionError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PartnerAttributionError";
    this.status = status;
  }
}

function client() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error("Supabase admin configuration is unavailable.");
  }
  return supabase;
}

function cleanCampaignCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase() ?? "";
  return CAMPAIGN_PATTERN.test(code) ? code : null;
}

function deliveryError(result: Awaited<ReturnType<typeof sendEmail>>) {
  if (result.ok) return null;
  if ("reason" in result) return result.reason;
  return result.error;
}

function attributionError(message: string) {
  if (/already|active migration case/i.test(message)) {
    return new PartnerAttributionError(message, 409);
  }
  if (/invalid|expired|closed|inactive/i.test(message)) {
    return new PartnerAttributionError(
      "This partner link is invalid, expired, or no longer active.",
      410,
    );
  }
  return new PartnerAttributionError(message, 400);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  worker: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index]);
    }
  }

  const workerCount = Math.min(limit, values.length);
  await Promise.all(Array.from({ length: workerCount }, () => run()));
  return results;
}

export function createPartnerReferralToken() {
  return randomBytes(32).toString("base64url");
}

export function partnerReferralTokenHash(token: string) {
  return createHash("sha256")
    .update(`partner-member-referral:${token}`)
    .digest("hex");
}

export function parsePartnerAttribution(
  inviteTokenValue: unknown,
  campaignCodeValue: unknown,
): PartnerAttributionInput {
  const inviteToken =
    typeof inviteTokenValue === "string"
    && TOKEN_PATTERN.test(inviteTokenValue.trim())
      ? inviteTokenValue.trim()
      : null;
  const campaignCode =
    typeof campaignCodeValue === "string"
      ? cleanCampaignCode(campaignCodeValue)
      : null;

  if (inviteTokenValue && !inviteToken) {
    throw new PartnerAttributionError(
      "This partner invitation link is invalid.",
      400,
    );
  }
  if (campaignCodeValue && !campaignCode) {
    throw new PartnerAttributionError(
      "This partner campaign link is invalid.",
      400,
    );
  }
  if (inviteToken && campaignCode) {
    throw new PartnerAttributionError(
      "Use either an individual invitation or a campaign link, not both.",
      400,
    );
  }
  return { inviteToken, campaignCode };
}

export function partnerReferralOrigin() {
  const origin = (
    process.env.PARTNER_REFERRAL_ORIGIN
    || process.env.NEXT_PUBLIC_WEBSITE_ORIGIN
    || DEFAULT_WEBSITE_ORIGIN
  ).trim().replace(/\/+$/, "");
  return origin || DEFAULT_WEBSITE_ORIGIN;
}

export function partnerReferralDeliveryEnabled() {
  const configured = process.env.PARTNER_REFERRAL_DELIVERY_ENABLED
    ?.trim()
    .toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  return process.env.VERCEL_ENV !== "production";
}

export function partnerCampaignUrl(referralCode: string) {
  const code = cleanCampaignCode(referralCode);
  if (!code) throw new Error("Partner campaign code is invalid.");
  return `${partnerReferralOrigin()}/migrate/${encodeURIComponent(code)}`;
}

export function partnerInvitationUrl(token: string) {
  if (!TOKEN_PATTERN.test(token)) {
    throw new Error("Partner invitation token is invalid.");
  }
  return `${partnerReferralOrigin()}/pricing?r=${encodeURIComponent(token)}`;
}

export async function resolvePartnerCaseAttribution(input: {
  attribution: PartnerAttributionInput;
  contactEmail: string;
  businessName: string;
}) {
  const { inviteToken, campaignCode } = input.attribution;
  if (!inviteToken && !campaignCode) return null;

  const { data, error } = await client().rpc(
    "resolve_partner_case_attribution",
    {
      p_invite_token_hash: inviteToken
        ? partnerReferralTokenHash(inviteToken)
        : null,
      p_campaign_code: campaignCode,
      p_contact_email: input.contactEmail.trim().toLowerCase(),
      p_business_name: input.businessName.trim(),
    },
  );
  if (error) throw attributionError(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.referral_id) {
    throw new PartnerAttributionError(
      "Partner attribution could not be resolved.",
      409,
    );
  }
  return {
    referralId: row.referral_id as string,
    associationId: row.association_id as string,
    source: row.attribution_source as "individual_link" | "campaign_link",
  };
}

async function issueAndDeliver(input: {
  associationId: string;
  actorUserId: string;
  organisationName: string;
  invitation: { email: string; source: InvitationSource };
  expiresAt: string;
}): Promise<PartnerInvitationDelivery> {
  const token = createPartnerReferralToken();
  const tokenHash = partnerReferralTokenHash(token);
  const { data, error } = await client().rpc(
    "issue_partner_member_invitation",
    {
      p_association_id: input.associationId,
      p_actor_user_id: input.actorUserId,
      p_email: input.invitation.email,
      p_source: input.invitation.source,
      p_token_hash: tokenHash,
      p_expires_at: input.expiresAt,
    },
  );
  if (error || !data) {
    return {
      referralId: null,
      email: input.invitation.email,
      delivered: false,
      error: error?.message ?? "Unable to issue the member invitation.",
    };
  }

  const referralId = data as string;
  const url = partnerInvitationUrl(token);
  const result = await sendEmail({
    to: input.invitation.email,
    replyTo: "support@foundation-1.co.za",
    subject: `${input.organisationName} invited you to assess your energy migration`,
    text: [
      "Hello,",
      "",
      `${input.organisationName} has invited your business to assess a Foundation-1 energy migration.`,
      "",
      "Use your secure invitation to run the first indicative pricing screen. No utility bill is required for this first step.",
      "",
      `Secure invitation: ${url}`,
      "",
      `This invitation expires on ${new Date(input.expiresAt).toLocaleDateString("en-ZA")}. It is issued to ${input.invitation.email} and can open one migration case.`,
      "",
      "Foundation-1 (Pty) Ltd",
      "support@foundation-1.co.za",
    ].join("\n"),
    tags: [
      { name: "category", value: "partner-referral" },
    ],
  });
  const errorMessage = deliveryError(result);

  await client().rpc("record_partner_invitation_delivery", {
    p_association_id: input.associationId,
    p_actor_user_id: input.actorUserId,
    p_referral_id: referralId,
    p_token_hash: tokenHash,
    p_success: result.ok,
    p_error: errorMessage,
  });

  return {
    referralId,
    email: input.invitation.email,
    delivered: result.ok,
    error: errorMessage,
  };
}

export async function sendPartnerMemberInvitations(input: {
  session: AuthSession;
  invitations: Array<{ email: string; source: InvitationSource }>;
  expiresInDays?: number;
}) {
  if (!partnerReferralDeliveryEnabled()) {
    throw new Error(
      "Partner invitation delivery is disabled in this environment.",
    );
  }
  if (!input.session.userId) {
    throw new Error("Partner invitation access is not authorised.");
  }
  const associationId = partnerOrganisationIdForSession(input.session);
  const invitations = input.invitations
    .slice(0, MAX_INVITATIONS_PER_BATCH)
    .map((invitation) => ({
      email: normalisePartnerInviteEmail(invitation.email),
      source: invitation.source,
    }))
    .filter(
      (invitation): invitation is { email: string; source: InvitationSource } =>
        Boolean(invitation.email),
    );
  const uniqueInvitations = [
    ...new Map(
      invitations.map((invitation) => [invitation.email, invitation]),
    ).values(),
  ];
  if (uniqueInvitations.length < 1) {
    throw new Error("Add at least one valid member email address.");
  }

  const expiresInDays = input.expiresInDays
    ?? DEFAULT_INVITATION_EXPIRY_DAYS;
  if (
    !Number.isInteger(expiresInDays)
    || expiresInDays < 1
    || expiresInDays > 30
  ) {
    throw new Error("Invitation expiry must be between 1 and 30 days.");
  }

  const { data: organisation, error } = await client()
    .from("associations")
    .select("name")
    .eq("id", associationId)
    .eq("status", "active")
    .eq("onboarding_status", "active")
    .single();
  if (error || !organisation?.name) {
    throw new Error(error?.message ?? "Partner organisation is not active.");
  }

  const expiresAt = new Date(
    Date.now() + expiresInDays * 24 * 60 * 60 * 1_000,
  ).toISOString();
  return mapWithConcurrency(
    uniqueInvitations,
    DELIVERY_CONCURRENCY,
    (invitation) =>
      issueAndDeliver({
        associationId,
        actorUserId: input.session.userId as string,
        organisationName: organisation.name as string,
        invitation,
        expiresAt,
      }),
  );
}

export async function sendPendingPartnerInvitations(input: {
  organisationId: string;
}) {
  if (!partnerReferralDeliveryEnabled()) {
    return {
      disabled: true,
      attempted: 0,
      delivered: 0,
      failed: 0,
      results: [] as PartnerInvitationDelivery[],
    };
  }

  const { data, error } = await client()
    .from("association_referrals")
    .select("invited_email,source,invited_by_user_id")
    .eq("association_id", input.organisationId)
    .eq("status", "invited")
    .is("invitation_sent_at", null)
    .not("invited_email", "is", null)
    .limit(MAX_INVITATIONS_PER_BATCH);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) {
    return {
      disabled: false,
      attempted: 0,
      delivered: 0,
      failed: 0,
      results: [] as PartnerInvitationDelivery[],
    };
  }

  const actorUserId = rows.find((row) => row.invited_by_user_id)
    ?.invited_by_user_id as string | undefined;
  if (!actorUserId) {
    throw new Error("Partner invitation owner is missing.");
  }

  const results = await sendPartnerMemberInvitations({
    session: {
      userId: actorUserId,
      email: "",
      name: "",
      role: "partner",
      agentId: null,
      partnerOrgId: input.organisationId,
    },
    invitations: rows.map((row) => ({
      email: row.invited_email as string,
      source:
        row.source === "csv" || row.source === "paste"
          ? row.source
          : "individual_link",
    })),
  });
  return {
    disabled: false,
    attempted: results.length,
    delivered: results.filter((result) => result.delivered).length,
    failed: results.filter((result) => !result.delivered).length,
    results,
  };
}

export async function cancelPartnerMemberInvitation(input: {
  session: AuthSession;
  referralId: string;
}) {
  if (!input.session.userId) {
    throw new Error("Partner invitation access is not authorised.");
  }
  const associationId = partnerOrganisationIdForSession(input.session);
  const { error } = await client().rpc(
    "cancel_partner_member_invitation",
    {
      p_association_id: associationId,
      p_actor_user_id: input.session.userId,
      p_referral_id: input.referralId,
    },
  );
  if (error) throw new Error(error.message);
}

export async function resendPartnerMemberInvitation(input: {
  session: AuthSession;
  referralId: string;
}) {
  const associationId = partnerOrganisationIdForSession(input.session);
  const { data, error } = await client()
    .from("association_referrals")
    .select("invited_email,source,status")
    .eq("id", input.referralId)
    .eq("association_id", associationId)
    .single();
  if (
    error
    || !data?.invited_email
    || data.status !== "invited"
  ) {
    throw new Error(
      error?.message ?? "Only an unused member invitation can be resent.",
    );
  }
  const [result] = await sendPartnerMemberInvitations({
    session: input.session,
    invitations: [{
      email: data.invited_email as string,
      source:
        data.source === "paste" || data.source === "csv"
          ? data.source
          : "individual_link",
    }],
  });
  return result;
}

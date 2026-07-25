import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSessionFromRequest } from "@/lib/auth-server";
import {
  normalisePartnerInviteEmail,
  partnerCampaignUrl,
  partnerOrganisationIdForSession,
  sendPartnerMemberInvitations,
} from "@/lib/partner-distribution";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

async function partnerSession(request: NextRequest) {
  const session = await getServerAuthSessionFromRequest(request);
  return session?.role === "partner" && session.userId ? session : null;
}

export async function GET(request: NextRequest) {
  const session = await partnerSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Not authorised." },
      { status: 401 },
    );
  }
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Partner service is unavailable." },
      { status: 503 },
    );
  }

  try {
    const associationId = partnerOrganisationIdForSession(session);
    const [
      { data: organisation, error: organisationError },
      { data: invitations, error: invitationError },
    ] = await Promise.all([
      supabase
        .from("associations")
        .select("referral_code")
        .eq("id", associationId)
        .single(),
      supabase
        .from("association_referrals")
        .select(
          "id,invited_email,source,status,created_at,invitation_sent_at,invitation_expires_at,last_error",
        )
        .eq("association_id", associationId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    const error = organisationError || invitationError;
    if (error || !organisation?.referral_code) {
      throw new Error(error?.message ?? "Partner invitations were not found.");
    }

    return NextResponse.json({
      ok: true,
      campaignUrl: partnerCampaignUrl(organisation.referral_code as string),
      invitations: invitations ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load partner invitations.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await partnerSession(request);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Not authorised." },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const rawInvitations = Array.isArray(body.invitations)
    ? body.invitations
    : Array.isArray(body.emails)
      ? body.emails
      : [];
  if (rawInvitations.length > 100) {
    return NextResponse.json(
      { ok: false, error: "Send at most 100 invitations in one batch." },
      { status: 400 },
    );
  }

  const invitations: Array<{
    email: string;
    source: "paste" | "csv" | "individual_link";
  }> = rawInvitations.flatMap((value) => {
    if (typeof value === "string") {
      const email = normalisePartnerInviteEmail(value);
      return email ? [{ email, source: "individual_link" as const }] : [];
    }
    if (!value || typeof value !== "object") return [];
    const candidate = value as Record<string, unknown>;
    const email = typeof candidate.email === "string"
      ? normalisePartnerInviteEmail(candidate.email)
      : null;
    if (!email) return [];
    const source =
      candidate.source === "paste"
        ? "paste"
        : candidate.source === "csv"
          ? "csv"
          : "individual_link";
    return [{ email, source }];
  });

  try {
    const results = await sendPartnerMemberInvitations({
      session,
      invitations,
      expiresInDays: Number(body.expiresInDays ?? 14),
    });
    return NextResponse.json({
      ok: true,
      attempted: results.length,
      delivered: results.filter((result) => result.delivered).length,
      failed: results.filter((result) => !result.delivered).length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to send partner invitations.",
      },
      { status: 409 },
    );
  }
}

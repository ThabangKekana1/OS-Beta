import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  claimPartnerOnboardingInvite,
  PARTNER_ONBOARDING_COOKIE,
  PARTNER_ONBOARDING_MAX_AGE_SECONDS,
  PARTNER_TYPES,
  type PartnerType,
} from "@/lib/partner-distribution";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function requestIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown"
  );
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const inviteToken = cleanText(body.inviteToken, 100);
  const authUserId = cleanText(body.authUserId, 80);
  const email = cleanText(body.email, 220).toLowerCase();
  const contactName = cleanText(body.contactName, 160);
  const organisationName = cleanText(body.organisationName, 180);
  const partnerType = cleanText(body.partnerType, 40) as PartnerType;

  if (
    !inviteToken
    || !authUserId
    || !email
    || !contactName
    || !organisationName
    || !PARTNER_TYPES.includes(partnerType)
  ) {
    return NextResponse.json(
      { ok: false, error: "Complete all partner onboarding fields." },
      { status: 400 },
    );
  }

  const limit = await consumeRateLimit({
    scope: "partner-onboarding-start",
    key: `${requestIp(request)}:${email}`,
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many onboarding attempts. Try again later." },
      { status: 429 },
    );
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Partner onboarding is unavailable." },
      { status: 503 },
    );
  }

  const { data: userData, error: userError } =
    await supabase.auth.admin.getUserById(authUserId);
  const authUser = userData.user;
  if (
    userError
    || !authUser?.email
    || authUser.email.toLowerCase() !== email
  ) {
    return NextResponse.json(
      { ok: false, error: "The account does not match this invitation." },
      { status: 403 },
    );
  }

  try {
    const claimed = await claimPartnerOnboardingInvite({
      inviteToken,
      authUserId,
      email,
      contactName,
      organisationName,
      partnerType,
    });
    const response = NextResponse.json({
      ok: true,
      organisationId: claimed.organisationId,
      referralCode: claimed.referralCode,
      emailConfirmationRequired: !authUser.email_confirmed_at,
    });
    response.cookies.set(
      PARTNER_ONBOARDING_COOKIE,
      claimed.completionToken,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: PARTNER_ONBOARDING_MAX_AGE_SECONDS,
      },
    );
    return response;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Partner onboarding could not be started.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: /invalid|expired|another email/i.test(message) ? 403 : 409 },
    );
  }
}


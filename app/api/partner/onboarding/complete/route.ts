import { NextRequest, NextResponse } from "next/server";
import {
  completePartnerOnboarding,
  findPartnerOnboardingCompletion,
  mergePartnerInvites,
  normalisePartnerInviteEmail,
  PARTNER_ONBOARDING_COOKIE,
  sendPendingPartnerInvitations,
  type ParsedPartnerInvite,
} from "@/lib/partner-distribution";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const completionToken =
    request.cookies.get(PARTNER_ONBOARDING_COOKIE)?.value ?? "";
  const onboarding = await findPartnerOnboardingCompletion(completionToken);
  if (!onboarding) {
    return NextResponse.json(
      { ok: false, error: "Partner onboarding session has expired." },
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
    : [];
  const invitations: ParsedPartnerInvite[] = [];
  for (const value of rawInvitations) {
    if (!value || typeof value !== "object") continue;
    const candidate = value as Record<string, unknown>;
    const email =
      typeof candidate.email === "string"
        ? normalisePartnerInviteEmail(candidate.email)
        : null;
    const source =
      candidate.source === "csv" ? "csv" : candidate.source === "paste"
        ? "paste"
        : null;
    if (email && source) invitations.push({ email, source });
  }
  const uniqueInvitations = mergePartnerInvites(invitations);
  if (uniqueInvitations.length < 1) {
    return NextResponse.json(
      { ok: false, error: "Add at least one valid member email." },
      { status: 400 },
    );
  }

  try {
    const createdCount = await completePartnerOnboarding({
      completionToken,
      referrals: uniqueInvitations,
    });
    const delivery = await sendPendingPartnerInvitations({
      organisationId: onboarding.organisationId,
    }).catch((error) => ({
      disabled: false,
      attempted: createdCount,
      delivered: 0,
      failed: createdCount,
      results: [],
      error:
        error instanceof Error
          ? error.message
          : "Member invitation delivery failed.",
    }));
    const response = NextResponse.json({
      ok: true,
      createdCount,
      email: onboarding.email,
      delivery,
    });
    response.cookies.set(PARTNER_ONBOARDING_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete partner onboarding.",
      },
      { status: 409 },
    );
  }
}

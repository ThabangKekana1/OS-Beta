import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import {
  issuePartnerOnboardingInvite,
  normalisePartnerInviteEmail,
} from "@/lib/partner-distribution";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin" || !session.userId) {
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

  const rawEmail =
    typeof body.email === "string" ? body.email.trim() : "";
  const email = rawEmail ? normalisePartnerInviteEmail(rawEmail) : null;
  if (rawEmail && !email) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid partner email address." },
      { status: 400 },
    );
  }
  const expiresInDays = Number(body.expiresInDays ?? 14);
  if (
    !Number.isInteger(expiresInDays)
    || expiresInDays < 1
    || expiresInDays > 30
  ) {
    return NextResponse.json(
      { ok: false, error: "Expiry must be between 1 and 30 days." },
      { status: 400 },
    );
  }

  try {
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1_000,
    ).toISOString();
    const invitation = await issuePartnerOnboardingInvite({
      createdByUserId: session.userId,
      email,
      expiresAt,
    });
    const invitePath =
      `/partner/onboarding?invite=${encodeURIComponent(invitation.token)}`;

    return NextResponse.json({
      ok: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        invitePath,
        inviteUrl: `${request.nextUrl.origin}${invitePath}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to issue partner invitation.",
      },
      { status: 500 },
    );
  }
}


import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSessionFromRequest } from "@/lib/auth-server";
import {
  cancelPartnerMemberInvitation,
  isUuid,
  resendPartnerMemberInvitation,
} from "@/lib/partner-distribution";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSessionFromRequest(request);
  if (!session || session.role !== "partner" || !session.userId) {
    return NextResponse.json(
      { ok: false, error: "Not authorised." },
      { status: 401 },
    );
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json(
      { ok: false, error: "Invitation ID is invalid." },
      { status: 400 },
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
  if (body.action !== "resend" && body.action !== "cancel") {
    return NextResponse.json(
      { ok: false, error: "Action must be resend or cancel." },
      { status: 400 },
    );
  }

  try {
    if (body.action === "cancel") {
      await cancelPartnerMemberInvitation({
        session,
        referralId: id,
      });
      return NextResponse.json({ ok: true, status: "cancelled" });
    }

    const delivery = await resendPartnerMemberInvitation({
      session,
      referralId: id,
    });
    return NextResponse.json({
      ok: true,
      status: delivery.delivered ? "sent" : "failed",
      delivery,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to update the invitation.",
      },
      { status: 409 },
    );
  }
}

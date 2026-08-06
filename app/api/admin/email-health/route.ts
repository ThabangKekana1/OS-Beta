import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { sendEmail } from "@/lib/email";
import {
  FOUNDATION_MIGRATIONS,
  FOUNDATION_NOREPLY,
  FOUNDATION_OUTREACH,
  FOUNDATION_SALES,
  FOUNDATION_SUPPORT,
} from "@/lib/foundation-addresses";
import { lifecycleReplyTo } from "@/lib/case-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function senderDomain() {
  const from = (process.env.EMAIL_FROM ?? "").trim();
  const match = from.match(/@([^>\s]+)/);
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Confirms email is actually configured and, with ?send=<address>, proves
 * delivery end to end. Emails silently no-op without a key, so without this the
 * first failure would be a client who never received their case link.
 */
export async function GET(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  const domain = senderDomain();
  const configured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  const mailboxes = {
    noreply: FOUNDATION_NOREPLY,
    support: FOUNDATION_SUPPORT,
    migrate: FOUNDATION_MIGRATIONS,
    sales: FOUNDATION_SALES,
    outreach: FOUNDATION_OUTREACH,
  };
  const offSenderDomain = Object.entries(mailboxes)
    .filter(([, address]) => domain && !address.endsWith(`@${domain}`))
    .map(([name]) => name);

  const to = request.nextUrl.searchParams.get("send")?.trim();
  const delivery = to
    ? await sendEmail({
        to,
        replyTo: lifecycleReplyTo(),
        subject: "Foundation-1 email health check",
        text: [
          "This is a Foundation-1 delivery test.",
          "",
          `Sent from: ${process.env.EMAIL_FROM ?? "(unset)"}`,
          `Reply-to: ${lifecycleReplyTo()}`,
          "",
          "If you received this, client case links, proposals and partner sign-ins will deliver.",
        ].join("\n"),
      })
    : null;

  return NextResponse.json({
    ok: true,
    configured,
    from: process.env.EMAIL_FROM ?? null,
    replyTo: lifecycleReplyTo(),
    adminNotify: process.env.ADMIN_NOTIFY_EMAIL ?? null,
    senderDomain: domain,
    mailboxes,
    // Anything here cannot be used as a From address on the verified domain.
    offSenderDomain,
    delivery,
  });
}

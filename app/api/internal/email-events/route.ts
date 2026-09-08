import { NextRequest, NextResponse } from "next/server";
import { recordDeliveryEvent, type DeliveryEventKind } from "@/lib/harness/gate";
import { normaliseWebhookSecret, verifyWebhookRequest } from "@/lib/email-webhooks";

export const runtime = "nodejs";

/**
 * Delivery truth, from Resend's own mouth (doc 21: trust but verify).
 *
 * Resend webhooks for email.delivered, email.bounced and email.complained land
 * here, signed with the webhook's Svix secret (RESEND_DELIVERY_WEBHOOK_SECRET).
 * Every event correlates back to its send_queue row through the Resend email id
 * stored on the row at dispatch, and lands in foundation1_outcomes so the
 * funnel, the receipts and MI's morning brief speak delivery, not acceptance.
 * A send is not done when Resend accepts it; it is done when the mailbox
 * confirms it.
 */

const EVENT_KINDS: Record<string, DeliveryEventKind> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = normaliseWebhookSecret(process.env.RESEND_DELIVERY_WEBHOOK_SECRET);
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Delivery webhook secret not configured." }, { status: 503 });
  }
  if (!verifyWebhookRequest(rawBody, request.headers, secret)) {
    return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 401 });
  }

  let parsed: { type?: string; data?: { id?: string; created_at?: string } };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const kind = parsed.type ? EVENT_KINDS[parsed.type] : undefined;
  if (!kind) {
    // Svix pings, email.sent, opens and clicks: acknowledged, not recorded.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const resendId = parsed.data?.id ?? null;
  if (!resendId) {
    return NextResponse.json({ ok: false, error: "Missing email id." }, { status: 400 });
  }

  const result = await recordDeliveryEvent({
    resendId,
    kind,
    occurredAt: parsed.data?.created_at,
  });

  return NextResponse.json({ ok: true, kind, ...result });
}

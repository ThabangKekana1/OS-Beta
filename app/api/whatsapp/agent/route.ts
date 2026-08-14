import { NextResponse } from "next/server";
import { archiveMessage, listPendingMessages, sendWhatsAppText, whatsappConfigured } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Agent bridge for the WhatsApp rail. Secured by the x-agent-secret header.
 * GET  - list pending inbound messages.
 * POST - { to, body, archiveKey? } send a reply; optionally archive the handled inbox entry.
 */

function authorized(request: Request) {
  const secret = process.env.WHATSAPP_AGENT_SECRET;
  return Boolean(secret && request.headers.get("x-agent-secret") === secret);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const pending = await listPendingMessages();
  return NextResponse.json({ ok: true, configured: whatsappConfigured(), pending });
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 401 });
  let payload: { to?: string; body?: string; archiveKey?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid json" }, { status: 400 });
  }
  const results: Record<string, unknown> = {};
  if (payload.to && payload.body) {
    results.send = await sendWhatsAppText(payload.to, payload.body);
  }
  if (payload.archiveKey?.startsWith("whatsapp/inbox/")) {
    results.archive = await archiveMessage(payload.archiveKey);
  }
  return NextResponse.json({ ok: true, ...results });
}

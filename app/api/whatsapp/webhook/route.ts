import { NextResponse } from "next/server";
import { isAllowedNumber, storeInboundMessage } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp Business Cloud API webhook.
 * GET  - Meta subscription verification (hub.mode / hub.verify_token / hub.challenge).
 * POST - inbound notifications; text messages from allowlisted numbers are stored
 *        for the agent bridge. Everything else is acknowledged and dropped.
 */

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ ok: false }, { status: 403 });
}

type CloudApiMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string };
  document?: { id?: string; filename?: string; caption?: string };
};

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const body = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
          messages?: CloudApiMessage[];
        };
      }>;
    }>;
  };

  const stored: string[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;
      const contactName = value.contacts?.[0]?.profile?.name ?? null;
      for (const message of value.messages) {
        const from = message.from ?? "";
        if (!from || !isAllowedNumber(from)) continue;
        let text = "";
        if (message.type === "text") text = message.text?.body ?? "";
        else if (message.type === "image") text = `[image received${message.image?.caption ? `: ${message.image.caption}` : ""}] media id ${message.image?.id ?? "?"}`;
        else if (message.type === "document") text = `[document received: ${message.document?.filename ?? "?"}${message.document?.caption ? ` - ${message.document.caption}` : ""}] media id ${message.document?.id ?? "?"}`;
        else text = `[${message.type ?? "unknown"} message received]`;
        const result = await storeInboundMessage({
          id: message.id ?? `${Date.now()}`,
          from,
          name: contactName,
          body: text,
          type: message.type ?? "unknown",
          timestamp: message.timestamp ?? "",
        });
        if (result.ok) stored.push(result.key);
      }
    }
  }
  return NextResponse.json({ ok: true, stored: stored.length });
}

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { recordMessage } from "@/lib/email-threads";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inbound email webhook for Resend (and compatible parsers).
 *
 * Configure in Resend:
 *   - Add MX records for your reply subdomain (e.g. replies.1os.co.za) → Resend.
 *   - Set the inbound webhook URL to https://<your-domain>/api/email/inbound
 *   - Set RESEND_INBOUND_SECRET to the signing secret. Resend signs with HMAC-SHA256
 *     and passes the signature in the `resend-signature` header.
 *
 * Expected payload (Resend inbound):
 *   {
 *     "type": "email.received",
 *     "data": {
 *       "from": { "email": "client@example.com", "name": "Client" },
 *       "to":   [{ "email": "sales+lead-abc@replies.1os.co.za" }],
 *       "cc":   [],
 *       "subject": "Re: Welcome to 1OS",
 *       "text": "...",
 *       "html": "...",
 *       "headers": { "message-id": "<...>", "in-reply-to": "<...>", "references": "<...> <...>" },
 *       "received_at": "2026-05-03T17:00:00Z"
 *     }
 *   }
 *
 * The route is intentionally lenient about the exact shape so that it also accepts
 * the SendGrid Inbound Parse and Postmark Inbound Webhook payloads — the three
 * providers diverge but only on field naming.
 */

type Address = { email?: string; address?: string; name?: string | null } | string;

type InboundPayload = {
  type?: string;
  data?: {
    from?: Address | Address[];
    to?: Address[] | Address;
    cc?: Address[] | Address;
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
    received_at?: string;
    raw?: string;
  };
  // SendGrid / Postmark style flat fields
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: string;
  envelope?: string;
};

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function extractAddress(addr: Address | undefined | null): { email: string; name: string | null } | null {
  if (!addr) return null;
  if (typeof addr === "string") {
    const match = addr.match(/^\s*(?:"?([^"<]+?)"?\s+)?<?([^\s<>]+@[^\s<>]+)>?\s*$/);
    if (match) return { email: match[2].toLowerCase(), name: match[1]?.trim() || null };
    return { email: addr.trim().toLowerCase(), name: null };
  }
  const email = (addr.email ?? addr.address ?? "").trim().toLowerCase();
  if (!email) return null;
  return { email, name: addr.name?.trim() ?? null };
}

function parseAddressList(value: Address | Address[] | string | undefined): Array<{ email: string; name: string | null }> {
  if (!value) return [];
  if (typeof value === "string") {
    return value
      .split(/,(?![^<]*>)/)
      .map((part) => extractAddress(part))
      .filter((entry): entry is { email: string; name: string | null } => entry !== null);
  }
  return asArray(value)
    .map((entry) => extractAddress(entry))
    .filter((entry): entry is { email: string; name: string | null } => entry !== null);
}

function pickHeader(headers: Record<string, string> | undefined, key: string): string | null {
  if (!headers) return null;
  const found = Object.entries(headers).find(([k]) => k.toLowerCase() === key.toLowerCase());
  return found ? found[1].trim() : null;
}

function leadIdFromAddress(email: string): string | null {
  // Pattern: sales+lead-<id>@replies.<host>
  const localPart = email.split("@")[0] ?? "";
  const match = localPart.match(/\+lead-([A-Za-z0-9_-]{3,64})/);
  return match ? match[1] : null;
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = (process.env.RESEND_INBOUND_SECRET ?? "").trim();
  if (!secret) {
    // No secret configured — accept (development). In production, set the secret.
    return true;
  }
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  // Allow either raw hex or "sha256=hex" formats.
  const provided = signature.replace(/^sha256=/i, "").trim();
  if (expected.length !== provided.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("resend-signature") ?? request.headers.get("x-signature");
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let parsed: InboundPayload;
  try {
    parsed = JSON.parse(rawBody) as InboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data = parsed.data ?? (parsed as InboundPayload);
  const fromCandidates = parseAddressList(("from" in data && data.from) || parsed.from);
  const fromAddress = fromCandidates[0];
  const toAddresses = parseAddressList(("to" in data && data.to) || parsed.to);
  const ccAddresses = parseAddressList(("cc" in data && data.cc) || parsed.cc);
  const subject = (("subject" in data && data.subject) || parsed.subject || "(no subject)").toString();
  const bodyText = (("text" in data && data.text) || parsed.text || "").toString();
  const bodyHtml = (("html" in data && data.html) || parsed.html || "").toString();
  const headers = ("headers" in data && data.headers && typeof data.headers === "object" ? data.headers : undefined) as
    | Record<string, string>
    | undefined;
  const messageId = pickHeader(headers, "message-id");
  const inReplyTo = pickHeader(headers, "in-reply-to");
  const referencesRaw = pickHeader(headers, "references");
  const referenceIds = referencesRaw ? referencesRaw.split(/\s+/).filter(Boolean) : [];
  const sentAt = (("received_at" in data && data.received_at) || new Date().toISOString()).toString();

  if (!fromAddress) {
    return NextResponse.json({ error: "Missing from address" }, { status: 400 });
  }

  // Try to recover the lead id from the recipient sub-address (sales+lead-<id>@…).
  const leadId = toAddresses
    .map((entry) => leadIdFromAddress(entry.email))
    .find((id): id is string => Boolean(id))
    ?? null;

  const recorded = await recordMessage({
    leadId,
    direction: "inbound",
    fromAddress: fromAddress.email,
    fromName: fromAddress.name,
    toAddresses: toAddresses.map((entry) => entry.email),
    ccAddresses: ccAddresses.map((entry) => entry.email),
    subject,
    bodyText: bodyText || null,
    bodyHtml: bodyHtml || null,
    messageId,
    inReplyTo,
    referenceIds,
    sentAt,
  });

  if (!recorded) {
    return NextResponse.json({ ok: false, error: "Failed to persist inbound email" }, { status: 500 });
  }

  void createNotification({
    audience: "admin",
    kind: "system",
    title: `New email reply from ${fromAddress.name ?? fromAddress.email}`,
    body: subject,
    link: `/sales/inbox?thread=${recorded.thread.id}`,
    metadata: { threadId: recorded.thread.id, leadId },
  }).catch((err) => console.error("[email/inbound] notification failed", err));

  return NextResponse.json({ ok: true, threadId: recorded.thread.id, messageId: recorded.message.id });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST inbound emails here from your provider." });
}

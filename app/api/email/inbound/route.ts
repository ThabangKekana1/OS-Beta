import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { recordMessage } from "@/lib/email-threads";
import { createNotification } from "@/lib/notifications";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

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
  created_at?: string;
  data?: {
    email_id?: string;
    from?: Address | Address[];
    to?: Address[] | Address;
    cc?: Address[] | Address;
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
    message_id?: string;
    received_at?: string;
    created_at?: string;
    raw?: string;
    attachments?: ReceivedAttachment[];
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

type ReceivedAttachment = {
  id?: string;
  filename?: string;
  size?: number;
  content_type?: string;
  content_disposition?: string | null;
  content_id?: string | null;
  download_url?: string;
  expires_at?: string;
};

type ReceivedEmail = {
  id?: string;
  from?: Address | Address[];
  to?: Address[] | Address;
  cc?: Address[] | Address;
  bcc?: Address[] | Address;
  subject?: string;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string>;
  message_id?: string;
  created_at?: string;
  attachments?: ReceivedAttachment[];
};

type AttachmentListResponse = {
  data?: ReceivedAttachment[];
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

function normalizeEnv(value?: string) {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "");
}

function webhookSecret() {
  return normalizeEnv(process.env.RESEND_INBOUND_SECRET) || normalizeEnv(process.env.RESEND_WEBHOOK_SECRET);
}

function decodeSvixSecret(secret: string): Buffer {
  const value = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  try {
    return Buffer.from(value, "base64");
  } catch {
    return Buffer.from(value, "utf8");
  }
}

function verifySvixSignature({
  rawBody,
  secret,
  id,
  timestamp,
  signature,
}: {
  rawBody: string;
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}): boolean {
  if (!id || !timestamp || !signature) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (ageSeconds > 5 * 60) return false;

  const signedPayload = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", decodeSvixSecret(secret))
    .update(signedPayload, "utf8")
    .digest("base64");

  return signature
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      const candidate = part.includes(",") ? part.split(",")[1] : part;
      if (!candidate || candidate.length !== expected.length) return false;
      return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
    });
}

function verifyLegacySignature(rawBody: string, signature: string | null, secret: string): boolean {
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

function verifySignature(rawBody: string, request: Request): boolean {
  const secret = webhookSecret();
  if (!secret) return true;

  const svixSignature = request.headers.get("svix-signature");
  if (svixSignature) {
    return verifySvixSignature({
      rawBody,
      secret,
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: svixSignature,
    });
  }

  const legacySignature = request.headers.get("resend-signature") ?? request.headers.get("x-signature");
  return verifyLegacySignature(rawBody, legacySignature, secret);
}

async function fetchResendJson<T>(path: string): Promise<T | null> {
  const apiKey = normalizeEnv(process.env.RESEND_API_KEY);
  if (!apiKey) return null;

  const response = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[email/inbound] Resend fetch failed", response.status, body.slice(0, 200));
    return null;
  }

  return (await response.json()) as T;
}

async function getReceivedEmail(emailId: string): Promise<ReceivedEmail | null> {
  return fetchResendJson<ReceivedEmail>(`/emails/receiving/${encodeURIComponent(emailId)}`);
}

async function listReceivedAttachments(emailId: string): Promise<ReceivedAttachment[]> {
  const payload = await fetchResendJson<AttachmentListResponse>(
    `/emails/receiving/${encodeURIComponent(emailId)}/attachments`,
  );
  return payload?.data ?? [];
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let parsed: InboundPayload;
  try {
    parsed = JSON.parse(rawBody) as InboundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (parsed.type && parsed.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const data = parsed.data ?? (parsed as InboundPayload);
  const receivedEmailId = ("email_id" in data && data.email_id ? data.email_id : null) ?? null;
  const fullEmail = receivedEmailId ? await getReceivedEmail(receivedEmailId) : null;
  const source = fullEmail ?? data;

  const fromCandidates = parseAddressList(("from" in source && source.from) || parsed.from);
  const fromAddress = fromCandidates[0];
  const toAddresses = parseAddressList(("to" in source && source.to) || parsed.to);
  const ccAddresses = parseAddressList(("cc" in source && source.cc) || parsed.cc);
  const subject = (("subject" in source && source.subject) || parsed.subject || "(no subject)").toString();
  const bodyText = (("text" in source && source.text) || parsed.text || "").toString();
  const bodyHtml = (("html" in source && source.html) || parsed.html || "").toString();
  const headers = ("headers" in source && source.headers && typeof source.headers === "object" ? source.headers : undefined) as
    | Record<string, string>
    | undefined;
  const messageId = pickHeader(headers, "message-id") ?? (("message_id" in source && source.message_id) || null);
  const inReplyTo = pickHeader(headers, "in-reply-to");
  const referencesRaw = pickHeader(headers, "references");
  const referenceIds = referencesRaw ? referencesRaw.split(/\s+/).filter(Boolean) : [];
  const sentAt = (
    ("received_at" in data && data.received_at) ||
    ("created_at" in source && source.created_at) ||
    parsed.created_at ||
    new Date().toISOString()
  ).toString();

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
    providerId: receivedEmailId,
    sentAt,
  });

  if (!recorded) {
    return NextResponse.json({ ok: false, error: "Failed to persist inbound email" }, { status: 500 });
  }

  const attachments = receivedEmailId
    ? await listReceivedAttachments(receivedEmailId)
    : "attachments" in source && Array.isArray(source.attachments)
      ? source.attachments
      : [];
  if (recorded.created && attachments.length > 0) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const rows = attachments
        .filter((attachment) => attachment.filename)
        .map((attachment) => ({
          message_id: recorded.message.id,
          filename: attachment.filename ?? "attachment",
          mime_type: attachment.content_type ?? "application/octet-stream",
          size_bytes: attachment.size ?? null,
          storage_path: receivedEmailId && attachment.id
            ? `resend-received:${receivedEmailId}:${attachment.id}`
            : attachment.download_url ?? null,
        }));
      if (rows.length > 0) {
        const { error: attachErr } = await supabase.from("oneos_email_attachments").insert(rows);
        if (attachErr) console.error("[email/inbound] attachment metadata insert failed", attachErr);
      }
    }
  }

  if (recorded.created) {
    void createNotification({
      audience: "admin",
      kind: "system",
      title: `New email reply from ${fromAddress.name ?? fromAddress.email}`,
      body: subject,
      link: `/sales/inbox?thread=${recorded.thread.id}`,
      metadata: { threadId: recorded.thread.id, leadId },
    }).catch((err) => console.error("[email/inbound] notification failed", err));
  }

  return NextResponse.json({ ok: true, threadId: recorded.thread.id, messageId: recorded.message.id });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST inbound emails here from your provider." });
}

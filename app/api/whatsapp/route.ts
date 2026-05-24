/**
 * WhatsApp Cloud API webhook — receives inbound document messages from clients,
 * downloads the media from Meta, and saves it to Supabase Storage under the
 * matching lead's document folder (same pipeline as the secure upload page).
 *
 * Environment variables required:
 *   WHATSAPP_PHONE_NUMBER_ID   — Meta phone number ID (from WhatsApp Manager)
 *   WHATSAPP_ACCESS_TOKEN      — Permanent / long-lived system user access token
 *   WHATSAPP_APP_SECRET        — App secret (for X-Hub-Signature-256 verification)
 *   WHATSAPP_VERIFY_TOKEN      — Any secret string you set when registering the webhook in Meta
 */

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import { createNotification } from "@/lib/notifications";
import { makeId, timelineLabel } from "@/lib/formatting";
import { uploadPrivateObject } from "@/lib/server-json-store";
import type { AdminLead, AdminLeadDocument } from "@/lib/admin-types";

export const runtime = "nodejs";

const DOCUMENT_BUCKET = "oneos-client-documents";
const MAX_FILE_BYTES = 100 * 1024 * 1024; // WhatsApp Cloud API max

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

function env(key: string) {
  return process.env[key]?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// Meta webhook signature verification (X-Hub-Signature-256)
// ---------------------------------------------------------------------------

async function verifySignature(request: NextRequest, rawBody: Buffer): Promise<boolean> {
  const appSecret = env("WHATSAPP_APP_SECRET");
  if (!appSecret) return false;

  const sigHeader = request.headers.get("x-hub-signature-256") ?? "";
  if (!sigHeader.startsWith("sha256=")) return false;

  const expected = Buffer.from(sigHeader.slice(7), "hex");
  const actual = createHmac("sha256", appSecret).update(rawBody).digest();

  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// ---------------------------------------------------------------------------
// Meta API helpers
// ---------------------------------------------------------------------------

async function getMediaUrl(mediaId: string): Promise<string | null> {
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  const accessToken = env("WHATSAPP_ACCESS_TOKEN");
  if (!accessToken) return null;

  const url = `https://graph.facebook.com/v20.0/${mediaId}?phone_number_id=${phoneNumberId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { url?: string };
  return data.url ?? null;
}

async function downloadMedia(mediaUrl: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const accessToken = env("WHATSAPP_ACCESS_TOKEN");
  if (!accessToken) return null;

  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;

  const mimeType = res.headers.get("content-type") ?? "application/octet-stream";
  const arrayBuffer = await res.arrayBuffer();

  if (arrayBuffer.byteLength > MAX_FILE_BYTES) return null;

  return { buffer: Buffer.from(arrayBuffer), mimeType };
}

async function sendWhatsAppReply(to: string, body: string): Promise<void> {
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  const accessToken = env("WHATSAPP_ACCESS_TOKEN");
  if (!phoneNumberId || !accessToken) return;

  await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body },
    }),
  });
}

// ---------------------------------------------------------------------------
// Phone number normalisation — strip non-digits, remove leading 0, add 27
// ---------------------------------------------------------------------------

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // WhatsApp sends numbers in international format without +, e.g. 27821234567
  return digits;
}

function phoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  const variants = new Set<string>();
  variants.add(digits);
  // +27XXXXXXXXX vs 27XXXXXXXXX vs 0XXXXXXXXX
  if (digits.startsWith("27")) {
    variants.add("+" + digits);
    variants.add("0" + digits.slice(2));
  } else if (digits.startsWith("0") && digits.length === 10) {
    variants.add("27" + digits.slice(1));
    variants.add("+27" + digits.slice(1));
  }
  return [...variants];
}

// ---------------------------------------------------------------------------
// Find lead by sender phone — matches against userProfile.phone
// ---------------------------------------------------------------------------

function findLeadByPhone(leads: AdminLead[], senderPhone: string): AdminLead | null {
  const variants = new Set(phoneVariants(senderPhone));
  return (
    leads.find((lead) => {
      if (!lead.userProfile.phone) return false;
      return phoneVariants(lead.userProfile.phone).some((v) => variants.has(v));
    }) ?? null
  );
}

// ---------------------------------------------------------------------------
// Mime type → file extension
// ---------------------------------------------------------------------------

function extensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "text/plain": "txt",
    "image/jpeg": "jpg",
    "image/png": "png",
  };
  return map[mimeType] ?? "bin";
}

function fileTypeFromMime(mimeType: string): AdminLeadDocument["fileType"] {
  if (mimeType === "application/pdf") return "PDF";
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  )
    return "DOCX";
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  )
    return "XLSX";
  if (mimeType === "image/jpeg" || mimeType === "image/png") return "PNG";
  if (mimeType === "text/plain") return "TXT";
  return "PDF";
}

// ---------------------------------------------------------------------------
// Webhook payload types (minimal — only what we use)
// ---------------------------------------------------------------------------

interface WaMediaPayload {
  id: string;
  mime_type: string;
  sha256: string;
  filename?: string;
  caption?: string;
}

interface WaMessage {
  id: string;
  from: string;
  type: string;
  timestamp: string;
  document?: WaMediaPayload;
  image?: WaMediaPayload;
}

interface WaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        messages?: WaMessage[];
      };
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// GET — Meta webhook verification challenge
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = env("WHATSAPP_VERIFY_TOKEN");
  if (!verifyToken) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ---------------------------------------------------------------------------
// POST — inbound messages
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Read raw body for signature verification
  const rawBody = Buffer.from(await request.arrayBuffer());

  const valid = await verifySignature(request, rawBody);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WaWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as WaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Meta expects a 200 immediately — process async
  void processWebhook(payload);

  return NextResponse.json({ ok: true }, { status: 200 });
}

// ---------------------------------------------------------------------------
// Core processing — async, does not block the 200 response
// ---------------------------------------------------------------------------

async function processWebhook(payload: WaWebhookPayload): Promise<void> {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value.messages ?? []) {
        await handleMessage(message);
      }
    }
  }
}

async function handleMessage(message: WaMessage): Promise<void> {
  // Only handle document and image messages
  const media = message.document ?? message.image ?? null;
  if (!media) return;

  const senderPhone = normalisePhone(message.from);

  // Load admin state and match lead by phone
  const { snapshot } = await readAdminStateSnapshot();
  const lead = findLeadByPhone(snapshot.leads, senderPhone);

  if (!lead) {
    // Unknown sender — reply with a polite message
    await sendWhatsAppReply(
      message.from,
      "Hi! We received your file but couldn't match your number to a Foundation-1 account. Please contact us at support@foundation-1.co.za.",
    );
    return;
  }

  // Download the media from Meta
  const mediaUrl = await getMediaUrl(media.id);
  if (!mediaUrl) {
    await sendWhatsAppReply(
      message.from,
      "We received your message but had trouble accessing your file. Please try again or use the secure upload link.",
    );
    return;
  }

  const downloaded = await downloadMedia(mediaUrl);
  if (!downloaded) {
    await sendWhatsAppReply(
      message.from,
      "We couldn't download your file (it may be too large or unsupported). Please use the secure upload link instead.",
    );
    return;
  }

  const { buffer, mimeType } = downloaded;
  const ext = extensionFromMime(mimeType);
  const documentId = makeId("doc");
  const originalName = media.filename ?? `whatsapp-document-${documentId}.${ext}`;
  const safeFilename = originalName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);

  const storagePath = `${lead.clientProfileId}/${documentId}-${safeFilename}`;

  // Convert Buffer → File for the existing uploadPrivateObject API
  const file = new File([buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer], originalName, { type: mimeType });
  const savedPath = await uploadPrivateObject(DOCUMENT_BUCKET, storagePath, file);

  const newDoc: AdminLeadDocument = {
    id: documentId,
    title: media.caption ? `WhatsApp Upload — ${media.caption}` : "WhatsApp Upload",
    category: "Qualification",
    fileType: fileTypeFromMime(mimeType),
    status: "received",
    uploadedAt: timelineLabel(),
    uploadedBy: `${lead.contactName} (WhatsApp)`,
    uploadedByType: "Client",
    sourceAccount: lead.migrateAccountId,
    sourceWorkspace: `Foundation-1 WhatsApp / ${lead.company}`,
    storagePath: savedPath,
    fileName: originalName,
    contentType: mimeType,
  };

  const updatedLead: AdminLead = {
    ...lead,
    lastTouched: "Just now",
    documents: [newDoc, ...lead.documents],
    events: [
      {
        id: makeId("event"),
        title: "Document received via WhatsApp",
        detail: `${lead.contactName} sent a document via WhatsApp (${originalName}).`,
        createdAt: timelineLabel(),
        tone: "client",
      },
      ...lead.events,
    ],
  };

  const nextSnapshot = {
    ...snapshot,
    leads: snapshot.leads.map((l) => (l.id === lead.id ? updatedLead : l)),
  };

  await writeAdminStateSnapshot(nextSnapshot, "whatsapp-upload");

  void createNotification({
    audience: "admin",
    kind: "customer_uploaded_document",
    title: `Document received via WhatsApp — ${lead.company}`,
    body: `${lead.contactName} sent ${originalName} via WhatsApp.`,
    link: `/admin/leads/${lead.clientProfileId}`,
    metadata: {
      leadId: lead.id,
      clientProfileId: lead.clientProfileId,
      company: lead.company,
      source: "whatsapp",
      fileName: originalName,
    },
  });

  // Confirm receipt to the sender
  await sendWhatsAppReply(
    message.from,
    `Thanks, ${lead.contactName.split(" ")[0]}! We've received your document and it's been added to your Foundation-1 file. Our team will be in touch shortly.`,
  );
}

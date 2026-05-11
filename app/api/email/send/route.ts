import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { sendEmail } from "@/lib/email";
import {
  appendSignatureToText,
  buildEmailHtmlWithSignature,
  getEmailSignature,
} from "@/lib/email-signatures";
import { recordMessage } from "@/lib/email-threads";
import { recordLeadEmailSent } from "@/lib/lead-email-activity";
import { resolveAdminSenderOption } from "@/lib/admin-mailboxes";
import { emailOnOutboundDomain, formatMailboxAddress } from "@/lib/email-addressing";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function siteHost(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (fromEnv) {
    try {
      return new URL(fromEnv).host;
    } catch {
      // fall through
    }
  }
  return "1os.local";
}

function generateMessageId(threadId: string | null): string {
  const host = siteHost();
  const random = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
  const prefix = threadId ? `t-${threadId}.${random}` : random;
  return `<${prefix}@${host}>`;
}

async function salesCanUseLead(leadId: string, agentId: string | null): Promise<boolean> {
  if (!agentId) return false;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from("oneos_admin_leads")
    .select("owner_id")
    .eq("id", leadId)
    .maybeSingle();

  if (error || !data) return false;
  return (data as { owner_id?: string | null }).owner_id === agentId;
}

async function partnerLeadAccess(
  leadId: string,
  partnerOrgId: string | null | undefined,
): Promise<{ ok: true; linkedAdminLeadId: string | null } | { ok: false }> {
  if (!partnerOrgId) return { ok: false };
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false };

  const { data, error } = await supabase
    .from("oneos_sales_leads")
    .select("payload")
    .eq("id", leadId)
    .maybeSingle();

  if (error || !data) return { ok: false };
  const payload = (data as { payload?: { partnerOrgId?: string | null; linkedAdminLeadId?: string | null } | null }).payload;
  if (payload?.partnerOrgId !== partnerOrgId) return { ok: false };
  return { ok: true, linkedAdminLeadId: payload.linkedAdminLeadId ?? null };
}

type SendAttachment = {
  filename: string;
  content: string; // base64 (no data: prefix)
  contentType?: string;
  contentId?: string;
  size?: number;
};

type SendBody = {
  to?: string | string[];
  cc?: string | string[];
  from?: string | null;
  subject?: string;
  body?: string;
  html?: string;
  threadId?: string | null;
  leadId?: string | null;
  clientProfileId?: string | null;
  inReplyTo?: string | null;
  referenceIds?: string[];
  attachments?: SendAttachment[];
};

// Vercel Functions cap request bodies at 4.5 MB. Base64 inflates payload by
// ~33%, so the practical raw-attachment ceiling is ~3.3 MB. We leave headroom
// for the rest of the JSON body (subject/body/html).
const MAX_ATTACHMENT_BYTES_PER_FILE = 3 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES_TOTAL = 3 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session || (session.role !== "sales" && session.role !== "admin" && session.role !== "partner")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: SendBody;
  try {
    payload = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const toList = Array.isArray(payload.to)
    ? payload.to
    : typeof payload.to === "string"
      ? payload.to.split(/[,;]/).map((t) => t.trim()).filter(Boolean)
      : [];
  const ccList = Array.isArray(payload.cc)
    ? payload.cc
    : typeof payload.cc === "string"
      ? payload.cc.split(/[,;]/).map((t) => t.trim()).filter(Boolean)
      : [];
  const subject = (payload.subject ?? "").trim();
  const body = (payload.body ?? "").trim();

  if (toList.length === 0) return NextResponse.json({ error: "Recipient required" }, { status: 400 });
  if (!subject) return NextResponse.json({ error: "Subject required" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "Body required" }, { status: 400 });

  // Validate attachments (sizes are computed from base64 length: bytes ≈ base64Len * 3/4).
  const attachments: SendAttachment[] = Array.isArray(payload.attachments) ? payload.attachments : [];
  let totalBytes = 0;
  for (const att of attachments) {
    if (!att?.filename || typeof att.content !== "string" || att.content.length === 0) {
      return NextResponse.json({ error: "Each attachment must have filename and base64 content" }, { status: 400 });
    }
    const approxBytes = Math.floor((att.content.length * 3) / 4);
    if (approxBytes > MAX_ATTACHMENT_BYTES_PER_FILE) {
      return NextResponse.json(
        { error: `Attachment '${att.filename}' is too large (max 3 MB per file)` },
        { status: 413 },
      );
    }
    totalBytes += approxBytes;
  }
  if (totalBytes > MAX_ATTACHMENT_BYTES_TOTAL) {
    return NextResponse.json({ error: "Attachments exceed total 3 MB limit" }, { status: 413 });
  }

  let recordLeadId = payload.leadId ?? null;

  if (payload.leadId && session.role === "sales") {
    const canUseLead = await salesCanUseLead(payload.leadId, session.agentId);
    if (!canUseLead) {
      return NextResponse.json({ error: "You can only link emails to your own leads" }, { status: 403 });
    }
  }

  if (payload.leadId && session.role === "partner") {
    const access = await partnerLeadAccess(payload.leadId, session.partnerOrgId);
    if (!access.ok) {
      return NextResponse.json({ error: "You can only link emails to your partner leads" }, { status: 403 });
    }
    recordLeadId = access.linkedAdminLeadId;
  }

  const adminSender = session.role === "admin" ? resolveAdminSenderOption(payload.from) : null;
  if (session.role === "admin" && payload.from && !adminSender) {
    return NextResponse.json({ error: "Selected sender is not available for admin mail" }, { status: 403 });
  }

  const personalFromEmail = session.role === "sales" || session.role === "partner"
    ? emailOnOutboundDomain(session.email)
    : null;
  const fromAddress = personalFromEmail
    ? formatMailboxAddress(session.name, personalFromEmail)
    : adminSender?.value ?? (process.env.EMAIL_FROM ?? "").trim();
  if (!fromAddress) {
    return NextResponse.json({ error: "EMAIL_FROM is not configured on the server" }, { status: 500 });
  }

  const messageId = generateMessageId(payload.threadId ?? null);
  const headers: Record<string, string> = { "Message-ID": messageId };
  if (payload.inReplyTo) headers["In-Reply-To"] = payload.inReplyTo;
  if (payload.referenceIds && payload.referenceIds.length > 0) headers["References"] = payload.referenceIds.join(" ");

  // Reply-To routes responses through the inbound webhook subdomain (e.g. replies.1os.co.za)
  const replyDomain = (process.env.EMAIL_REPLY_DOMAIN ?? "").trim();
  const personalMailbox = session.role === "sales" || session.role === "partner";
  const ownerToken = personalMailbox && session.userId ? `+u-${session.userId}` : "";
  const leadToken = recordLeadId ? `+lead-${recordLeadId}` : "";
  const replyMailbox = session.role === "partner" ? "partner" : session.role === "admin" ? "admin" : "sales";
  const replyTo =
    replyDomain
      ? `${replyMailbox}${ownerToken}${leadToken}@${replyDomain}`
      : undefined;

  const mailboxOwnerUserId = personalMailbox ? session.userId : null;
  const mailboxAddress = personalMailbox ? session.email : adminSender?.email ?? null;
  const savedSignature = session.userId ? await getEmailSignature(session.userId) : null;
  const signatureFooterImage = savedSignature?.footerImage ?? null;
  const signatureFooterContentId = signatureFooterImage ? "oneos-signature-footer" : null;
  const finalBodyText = appendSignatureToText(body, savedSignature);
  const finalBodyHtml = buildEmailHtmlWithSignature({
    bodyText: body,
    bodyHtml: payload.html,
    signature: savedSignature,
    footerImageContentId: signatureFooterContentId,
  });
  const resendAttachments: SendAttachment[] = attachments.map((a) => ({
    filename: a.filename,
    content: a.content,
    contentType: a.contentType,
    size: a.size,
  }));
  if (signatureFooterImage && signatureFooterContentId) {
    resendAttachments.push({
      filename: signatureFooterImage.filename,
      content: signatureFooterImage.base64,
      contentType: signatureFooterImage.mimeType,
      contentId: signatureFooterContentId,
      size: signatureFooterImage.sizeBytes,
    });
  }

  const sendResult = await sendEmail({
    from: fromAddress,
    to: toList,
    cc: ccList.length > 0 ? ccList : undefined,
    subject,
    text: finalBodyText,
    html: finalBodyHtml ?? undefined,
    replyTo,
    headers,
    tags: recordLeadId ? [{ name: "lead_id", value: recordLeadId }] : undefined,
    attachments: resendAttachments.length > 0
      ? resendAttachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
          contentId: a.contentId,
        }))
      : undefined,
  });

  if (!sendResult.ok) {
    const error = "skipped" in sendResult && sendResult.skipped ? sendResult.reason : "error" in sendResult ? sendResult.error : "Unknown send error";
    return NextResponse.json({ error }, { status: 502 });
  }

  const recorded = await recordMessage({
    threadId: payload.threadId ?? null,
    leadId: recordLeadId,
    clientProfileId: payload.clientProfileId ?? null,
    direction: "outbound",
    mailboxOwnerUserId,
    mailboxAddress,
    mailboxRole: session.role === "sales" || session.role === "partner" ? session.role : "admin",
    fromAddress,
    fromName: session.name ?? null,
    toAddresses: toList,
    ccAddresses: ccList,
    subject,
    bodyText: finalBodyText,
    bodyHtml: finalBodyHtml,
    messageId,
    inReplyTo: payload.inReplyTo ?? null,
    referenceIds: payload.referenceIds ?? [],
    providerId: sendResult.id,
    sentByUserId: session.userId ?? null,
  });

  if (!recorded) {
    // Email went out but we couldn't store it. Return success but flag.
    return NextResponse.json({ ok: true, providerId: sendResult.id, persisted: false });
  }

  await recordLeadEmailSent(recordLeadId, session.email).catch((error) => {
    console.error("[email/send] lead activity update failed", error);
  });

  // Persist attachment metadata (we don't store the file itself for outbound — Resend
  // already sent it. We only record filename/type/size so the conversation history
  // can render attachment chips next to the message.)
  if (attachments.length > 0) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const rows = attachments.map((a) => ({
        message_id: recorded.message.id,
        filename: a.filename,
        mime_type: a.contentType ?? "application/octet-stream",
        size_bytes: a.size ?? Math.floor((a.content.length * 3) / 4),
        storage_path: null,
      }));
      const { error: attachErr } = await supabase.from("oneos_email_attachments").insert(rows);
      if (attachErr) console.error("[email/send] attachment metadata insert failed", attachErr);
    }
  }

  return NextResponse.json({
    ok: true,
    providerId: sendResult.id,
    thread: recorded.thread,
    message: recorded.message,
  });
}

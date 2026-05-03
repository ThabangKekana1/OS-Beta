import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { sendEmail } from "@/lib/email";
import { recordMessage } from "@/lib/email-threads";

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

type SendBody = {
  to?: string | string[];
  cc?: string | string[];
  subject?: string;
  body?: string;
  html?: string;
  threadId?: string | null;
  leadId?: string | null;
  clientProfileId?: string | null;
  inReplyTo?: string | null;
  referenceIds?: string[];
};

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session || (session.role !== "sales" && session.role !== "admin")) {
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

  const fromAddress = (process.env.EMAIL_FROM ?? "").trim();
  if (!fromAddress) {
    return NextResponse.json({ error: "EMAIL_FROM is not configured on the server" }, { status: 500 });
  }

  const messageId = generateMessageId(payload.threadId ?? null);
  const headers: Record<string, string> = { "Message-ID": messageId };
  if (payload.inReplyTo) headers["In-Reply-To"] = payload.inReplyTo;
  if (payload.referenceIds && payload.referenceIds.length > 0) headers["References"] = payload.referenceIds.join(" ");

  // Reply-To routes responses through the inbound webhook subdomain (e.g. replies.1os.co.za)
  const replyDomain = (process.env.EMAIL_REPLY_DOMAIN ?? "").trim();
  const replyTo =
    replyDomain && payload.leadId
      ? `sales+lead-${payload.leadId}@${replyDomain}`
      : replyDomain
        ? `sales@${replyDomain}`
        : undefined;

  const sendResult = await sendEmail({
    to: toList,
    cc: ccList.length > 0 ? ccList : undefined,
    subject,
    text: body,
    html: payload.html,
    replyTo,
    headers,
    tags: payload.leadId ? [{ name: "lead_id", value: payload.leadId }] : undefined,
  });

  if (!sendResult.ok) {
    const error = "skipped" in sendResult && sendResult.skipped ? sendResult.reason : "error" in sendResult ? sendResult.error : "Unknown send error";
    return NextResponse.json({ error }, { status: 502 });
  }

  const recorded = await recordMessage({
    threadId: payload.threadId ?? null,
    leadId: payload.leadId ?? null,
    clientProfileId: payload.clientProfileId ?? null,
    direction: "outbound",
    fromAddress,
    fromName: session.name ?? null,
    toAddresses: toList,
    ccAddresses: ccList,
    subject,
    bodyText: body,
    bodyHtml: payload.html ?? null,
    messageId,
    inReplyTo: payload.inReplyTo ?? null,
    referenceIds: payload.referenceIds ?? [],
    providerId: sendResult.id,
  });

  if (!recorded) {
    // Email went out but we couldn't store it. Return success but flag.
    return NextResponse.json({ ok: true, providerId: sendResult.id, persisted: false });
  }

  return NextResponse.json({
    ok: true,
    providerId: sendResult.id,
    thread: recorded.thread,
    message: recorded.message,
  });
}

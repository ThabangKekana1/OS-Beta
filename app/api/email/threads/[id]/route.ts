import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { getThread, listMessages, markThreadRead, type EmailMessage } from "@/lib/email-threads";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type ReceivedEmailBody = {
  html?: string | null;
  text?: string | null;
};

function normalizeEnv(value?: string) {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "");
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

async function fetchReceivedEmailBody(providerId: string): Promise<{ bodyText: string | null; bodyHtml: string | null } | null> {
  const apiKey = normalizeEnv(process.env.RESEND_RECEIVING_API_KEY) || normalizeEnv(process.env.RESEND_API_KEY);
  if (!apiKey) return null;

  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(providerId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text();
    console.error("[email/thread] received email body fetch failed", response.status, body.slice(0, 200));
    return null;
  }

  const email = (await response.json()) as ReceivedEmailBody;
  const bodyHtml = typeof email.html === "string" && email.html.trim() ? email.html : null;
  const bodyText = typeof email.text === "string" && email.text.trim()
    ? email.text
    : bodyHtml
      ? stripHtml(bodyHtml)
      : null;
  if (!bodyText && !bodyHtml) return null;
  return { bodyText, bodyHtml };
}

async function hydrateMissingInboundBodies(messages: EmailMessage[]): Promise<EmailMessage[]> {
  const needsHydration = messages.filter(
    (message) =>
      message.direction === "inbound" &&
      Boolean(message.providerId) &&
      !message.bodyText?.trim() &&
      !message.bodyHtml?.trim(),
  );
  if (needsHydration.length === 0) return messages;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return messages;

  const hydratedById = new Map<string, { bodyText: string | null; bodyHtml: string | null }>();
  for (const message of needsHydration) {
    const body = message.providerId ? await fetchReceivedEmailBody(message.providerId) : null;
    if (!body) continue;
    hydratedById.set(message.id, body);
    const { error } = await supabase
      .from("oneos_email_messages")
      .update({ body_text: body.bodyText, body_html: body.bodyHtml })
      .eq("id", message.id);
    if (error) console.error("[email/thread] missing body backfill failed", error);
  }

  if (hydratedById.size === 0) return messages;
  return messages.map((message) => {
    const hydrated = hydratedById.get(message.id);
    return hydrated ? { ...message, ...hydrated } : message;
  });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session || (session.role !== "sales" && session.role !== "admin" && session.role !== "partner" && session.role !== "client")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const thread = await getThread(id);
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  if (session.role === "sales" || session.role === "partner") {
    const ownsThread =
      (thread.mailboxOwnerUserId && session.userId && thread.mailboxOwnerUserId === session.userId) ||
      (!thread.mailboxOwnerUserId && thread.mailboxAddress === session.email);

    if (!ownsThread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  if (session.role === "client") {
    const email = session.email.trim().toLowerCase();
    const isParticipant = thread.participants.some(
      (participant) => participant.trim().toLowerCase() === email,
    );

    if (!isParticipant) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const messages = await hydrateMissingInboundBodies(await listMessages(id));
  if (session.role !== "client") {
    await markThreadRead(id);
  }
  return NextResponse.json({ thread, messages });
}

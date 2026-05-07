/**
 * Minimal email sender. Uses Resend via plain HTTPS (no SDK).
 * Configure with RESEND_API_KEY + EMAIL_FROM. If unset, sendEmail is a no-op
 * that resolves with { ok: false, skipped: true } so callers never break.
 */

type SendEmailInput = {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string | string[];
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
  attachments?: Array<{
    filename: string;
    content: string; // base64
    contentType?: string;
    contentId?: string;
  }>;
};

type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; error: string };

function normalizeEnv(value?: string) {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "");
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = normalizeEnv(process.env.RESEND_API_KEY);
  const defaultFrom = normalizeEnv(process.env.EMAIL_FROM);
  const from = input.from ?? defaultFrom;

  if (!apiKey || !from) {
    return { ok: false, skipped: true, reason: "RESEND_API_KEY or EMAIL_FROM not configured" };
  }
  const to = Array.isArray(input.to) ? input.to : [input.to];
  if (!to.length || !to[0]) {
    return { ok: false, skipped: true, reason: "no recipient" };
  }

  try {
    const body: Record<string, unknown> = {
      from,
      to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(input.text)}</pre>`,
    };
    if (input.cc) body.cc = Array.isArray(input.cc) ? input.cc : [input.cc];
    if (input.replyTo) body.reply_to = Array.isArray(input.replyTo) ? input.replyTo : [input.replyTo];
    if (input.headers && Object.keys(input.headers).length > 0) body.headers = input.headers;
    if (input.tags && input.tags.length > 0) body.tags = input.tags;
    if (input.attachments && input.attachments.length > 0) {
      body.attachments = input.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        ...(a.contentType ? { content_type: a.contentType } : {}),
        ...(a.contentId ? { content_id: a.contentId } : {}),
      }));
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return { ok: false, error: `Resend ${response.status}: ${errBody.slice(0, 240)}` };
    }
    const json = (await response.json()) as { id?: string };
    return { ok: true, id: json.id ?? "unknown" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown email error" };
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

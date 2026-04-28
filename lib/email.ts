/**
 * Minimal email sender. Uses Resend via plain HTTPS (no SDK).
 * Configure with RESEND_API_KEY + EMAIL_FROM. If unset, sendEmail is a no-op
 * that resolves with { ok: false, skipped: true } so callers never break.
 */

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
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
  const from = normalizeEnv(process.env.EMAIL_FROM);

  if (!apiKey || !from) {
    return { ok: false, skipped: true, reason: "RESEND_API_KEY or EMAIL_FROM not configured" };
  }
  if (!input.to) {
    return { ok: false, skipped: true, reason: "no recipient" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html ?? `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(input.text)}</pre>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `Resend ${response.status}: ${body.slice(0, 240)}` };
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

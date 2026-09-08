import crypto from "node:crypto";

/**
 * Svix signature verification for Resend webhooks. Resend signs every delivery
 * with the webhook's signing secret (whsec_…) across the svix-id, svix-timestamp
 * and svix-signature headers; a message older than five minutes is rejected so
 * replays die at the door.
 */

export function normaliseWebhookSecret(value?: string): string {
  return (value ?? "").trim();
}

function decodeSvixSecret(secret: string): Buffer {
  const value = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  try {
    return Buffer.from(value, "base64");
  } catch {
    return Buffer.from(value, "utf8");
  }
}

export function verifySvixSignature({
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
      try {
        return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
      } catch {
        return false;
      }
    });
}

export function verifyWebhookRequest(rawBody: string, headers: Headers, secret: string): boolean {
  if (!secret) return true; // development convenience; production configures the secret
  return verifySvixSignature({
    rawBody,
    secret,
    id: headers.get("svix-id"),
    timestamp: headers.get("svix-timestamp"),
    signature: headers.get("svix-signature"),
  });
}

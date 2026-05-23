const DEFAULT_OUTBOUND_EMAIL_DOMAIN = "foundation-1.co.za";

function normalizeEnv(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "") ?? "";
}

export function getOutboundEmailDomain() {
  const configured = normalizeEnv(process.env.EMAIL_OUTBOUND_DOMAIN).replace(/^@/, "").toLowerCase();
  if (configured && !configured.startsWith("replies.")) {
    return configured;
  }
  return DEFAULT_OUTBOUND_EMAIL_DOMAIN;
}

export function emailOnOutboundDomain(email: string) {
  const trimmed = email.trim().toLowerCase();
  const localPart = trimmed.split("@")[0];
  const domain = getOutboundEmailDomain();
  return localPart && domain ? `${localPart}@${domain}` : trimmed;
}

export function formatMailboxAddress(name: string | null | undefined, email: string) {
  const trimmedEmail = email.trim().toLowerCase();
  const trimmedName = name?.trim();
  if (!trimmedName) return trimmedEmail;
  return `${trimmedName.replace(/["<>]/g, "")} <${trimmedEmail}>`;
}

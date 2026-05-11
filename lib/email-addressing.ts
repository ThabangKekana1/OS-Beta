const DEFAULT_OUTBOUND_EMAIL_DOMAIN = "replies.1os.co.za";

function normalizeEnv(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "") ?? "";
}

export function getOutboundEmailDomain() {
  return (
    normalizeEnv(process.env.EMAIL_OUTBOUND_DOMAIN) ||
    normalizeEnv(process.env.EMAIL_REPLY_DOMAIN) ||
    DEFAULT_OUTBOUND_EMAIL_DOMAIN
  ).replace(/^@/, "");
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

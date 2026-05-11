import { emailOnOutboundDomain, formatMailboxAddress } from "@/lib/email-addressing";

export type AdminSenderOption = {
  label: string;
  email: string;
  value: string;
};

const DEFAULT_ADMIN_SENDERS = [
  {
    label: "Foundation-1 Sales",
    email: "sales@replies.1os.co.za",
  },
  {
    label: "Karman",
    email: "karman@replies.1os.co.za",
  },
];

function extractEmail(value: string) {
  const bracketMatch = value.match(/<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>/);
  if (bracketMatch?.[1]) return bracketMatch[1].trim().toLowerCase();
  const plainMatch = value.match(/([^<>\s,;]+@[^<>\s,;]+\.[^<>\s,;]+)/);
  return plainMatch?.[1]?.trim().toLowerCase() ?? "";
}

function labelForValue(value: string, email: string) {
  const label = value.replace(/<[^<>]+>/g, "").replace(email, "").trim();
  return label || email;
}

function senderFromValue(value: string): AdminSenderOption | null {
  const trimmed = value.trim();
  const configuredEmail = extractEmail(trimmed);
  if (!configuredEmail) return null;
  const email = emailOnOutboundDomain(configuredEmail);
  const label = labelForValue(trimmed, configuredEmail);
  return {
    label,
    email,
    value: formatMailboxAddress(label, email),
  };
}

function parseConfiguredSenders(raw: string | undefined) {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;]/)
    .map(senderFromValue)
    .filter((sender): sender is AdminSenderOption => Boolean(sender));
}

export function getAdminSenderOptions(): AdminSenderOption[] {
  const configured = parseConfiguredSenders(process.env.ADMIN_EMAIL_FROM_ADDRESSES);
  const senders = configured.length > 0
    ? configured
    : DEFAULT_ADMIN_SENDERS.map((sender) => {
        const email = emailOnOutboundDomain(sender.email);
        return {
          label: sender.label,
          email,
          value: formatMailboxAddress(sender.label, email),
        };
      });
  const seen = new Set<string>();
  return senders.filter((sender) => {
    if (seen.has(sender.email)) return false;
    seen.add(sender.email);
    return true;
  });
}

export function resolveAdminSenderOption(value: string | null | undefined) {
  const options = getAdminSenderOptions();
  if (!value?.trim()) return options[0] ?? null;

  const rawEmail = extractEmail(value);
  const email = rawEmail ? emailOnOutboundDomain(rawEmail) : "";
  return (
    options.find(
      (option) =>
        option.email === email ||
        option.value.trim().toLowerCase() === value.trim().toLowerCase(),
    ) ?? null
  );
}

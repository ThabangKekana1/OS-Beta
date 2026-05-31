import { formatMailboxAddress } from "@/lib/email-addressing";
import { foundationDisplayNameForEmail } from "@/lib/email-signature-copy";

export type AdminSenderOption = {
  label: string;
  email: string;
  value: string;
};

const ADMIN_SENDERS = [
  {
    label: "Karman Kekana",
    email: "karman@foundation-1.co.za",
    aliases: ["karman@replies.1os.co.za"],
  },
  {
    label: "Sales",
    email: "sales@foundation-1.co.za",
    aliases: ["sales@replies.1os.co.za", "sales@1os.co.za"],
  },
  {
    label: "Support",
    email: "support@foundation-1.co.za",
    aliases: ["support@replies.1os.co.za", "support@1os.co.za"],
  },
] as const;

function extractEmail(value: string) {
  const bracketMatch = value.match(/<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>/);
  if (bracketMatch?.[1]) return bracketMatch[1].trim().toLowerCase();
  const plainMatch = value.match(/([^<>\s,;]+@[^<>\s,;]+\.[^<>\s,;]+)/);
  return plainMatch?.[1]?.trim().toLowerCase() ?? "";
}

export function getAdminSenderOptions(): AdminSenderOption[] {
  return ADMIN_SENDERS.map((sender) => ({
    label: foundationDisplayNameForEmail(sender.email, sender.label),
    email: sender.email,
    value: formatMailboxAddress(foundationDisplayNameForEmail(sender.email, sender.label), sender.email),
  }));
}

export function resolveAdminSenderOption(value: string | null | undefined) {
  const options = getAdminSenderOptions();
  if (!value?.trim()) return options[0] ?? null;

  const email = extractEmail(value);
  const normalizedValue = value.trim().toLowerCase();
  return (
    options.find(
      (option, index) => {
        const sender = ADMIN_SENDERS[index];
        const aliases: readonly string[] = sender.aliases;
        return (
          option.email === email ||
          option.value.trim().toLowerCase() === normalizedValue ||
          aliases.includes(email) ||
          aliases.includes(normalizedValue)
        );
      },
    ) ?? null
  );
}

export function resolveAdminSenderByRoutingAddress(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const email = extractEmail(value) || value.trim().toLowerCase();
  const localPart = email.split("@")[0]?.split("+")[0]?.trim().toLowerCase();
  if (!localPart) return null;

  return (
    getAdminSenderOptions().find((option) => {
      const senderLocalPart = option.email.split("@")[0]?.trim().toLowerCase();
      return senderLocalPart === localPart;
    }) ?? null
  );
}

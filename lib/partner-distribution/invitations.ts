const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedPartnerInvite = {
  email: string;
  source: "paste" | "csv";
};

export function normalisePartnerInviteEmail(value: string) {
  const email = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

export function extractPartnerInviteEmails(
  value: string,
  source: ParsedPartnerInvite["source"],
): ParsedPartnerInvite[] {
  const seen = new Set<string>();
  const invitations: ParsedPartnerInvite[] = [];
  const candidates = value.split(/[\s,;]+/);

  for (const candidate of candidates) {
    const email = normalisePartnerInviteEmail(
      candidate.replace(/^["']|["']$/g, ""),
    );
    if (!email || seen.has(email)) continue;
    seen.add(email);
    invitations.push({ email, source });
    if (invitations.length === 100) break;
  }
  return invitations;
}

export function mergePartnerInvites(
  ...groups: ParsedPartnerInvite[][]
): ParsedPartnerInvite[] {
  const byEmail = new Map<string, ParsedPartnerInvite>();
  for (const invitation of groups.flat()) {
    if (!byEmail.has(invitation.email)) {
      byEmail.set(invitation.email, invitation);
    }
    if (byEmail.size === 100) break;
  }
  return [...byEmail.values()];
}


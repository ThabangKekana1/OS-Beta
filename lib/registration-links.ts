import type { RegistrationSourceRole } from "@/lib/admin-types";

export type RegistrationProfile = {
  email: string;
  role: RegistrationSourceRole;
  agentId: string | null;
};

function hashBase36(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function registrationLinkIdForProfile(profile: RegistrationProfile) {
  const stableKey = profile.agentId?.trim() || profile.email.trim().toLowerCase();
  return `${profile.role}-${hashBase36(stableKey)}`;
}

export function registrationLinkPath(linkId: string) {
  return `/register/${encodeURIComponent(linkId)}`;
}

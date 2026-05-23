import type { RegistrationSourceRole } from "@/lib/admin-types";

export type RegistrationProfile = {
  email: string;
  role: RegistrationSourceRole;
  agentId: string | null;
};

export type RegistrationLeadProfile = {
  leadId: string;
  clientProfileId: string;
  email?: string | null;
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

export function registrationLinkIdForLead(lead: RegistrationLeadProfile) {
  const stableKey = [lead.leadId, lead.clientProfileId, lead.email?.trim().toLowerCase() ?? ""]
    .filter(Boolean)
    .join(":");
  return `lead-${hashBase36(stableKey)}`;
}

export function registrationLinkPath(linkId: string) {
  return `/register/${encodeURIComponent(linkId)}`;
}

export function documentUploadLinkIdForLead(lead: RegistrationLeadProfile) {
  const stableKey = ["documents", lead.leadId, lead.clientProfileId, lead.email?.trim().toLowerCase() ?? ""]
    .filter(Boolean)
    .join(":");
  return `docs-${hashBase36(stableKey)}`;
}

export function documentUploadLinkPath(linkId: string) {
  return `/upload/${encodeURIComponent(linkId)}`;
}

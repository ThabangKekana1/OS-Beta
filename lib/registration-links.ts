import type { RegistrationSourceRole } from "@/lib/admin-types";
import { normalizeOrigin } from "@/lib/url";

const PUBLIC_MIGRATION_LINK_ORIGIN = "https://www.1os.co.za";

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

function slugifyPathSegment(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

function migrationEstimatePathSegment(linkId: string, label?: string | null) {
  const companySlug = slugifyPathSegment(label);
  return companySlug ? `${companySlug}-${linkId}` : linkId;
}

function isLocalOrigin(origin: string) {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

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

export function migrationLinkIdForLead(lead: RegistrationLeadProfile) {
  const stableKey = ["migration", lead.leadId, lead.clientProfileId]
    .filter(Boolean)
    .join(":");
  return `mig-${hashBase36(stableKey)}`;
}

export function migrationLinkPath(linkId: string, label?: string | null) {
  return `/estimate/${encodeURIComponent(migrationEstimatePathSegment(linkId, label))}`;
}

export function migrationStartPath(linkId: string) {
  return `/migration/start?lead=${encodeURIComponent(linkId)}`;
}

export function migrationLinkIdFromPathSegment(segment: string) {
  const trimmed = segment.trim();
  const match = trimmed.match(/(?:^|-)(mig-[0-9a-z]+)$/i);
  return (match?.[1] ?? trimmed).toLowerCase();
}

export function publicMigrationLinkOrigin(currentOrigin?: string | null) {
  const normalizedCurrentOrigin = normalizeOrigin(currentOrigin);
  if (normalizedCurrentOrigin && isLocalOrigin(normalizedCurrentOrigin)) {
    return normalizedCurrentOrigin;
  }

  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configuredOrigin && isLocalOrigin(configuredOrigin)) return configuredOrigin;

  return PUBLIC_MIGRATION_LINK_ORIGIN;
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

export function proposalDownloadLinkIdForLead(lead: RegistrationLeadProfile) {
  const stableKey = ["proposal", lead.leadId, lead.clientProfileId, lead.email?.trim().toLowerCase() ?? ""]
    .filter(Boolean)
    .join(":");
  return `prop-${hashBase36(stableKey)}`;
}

export function proposalDownloadLinkPath(linkId: string) {
  return `/proposal/${encodeURIComponent(linkId)}`;
}

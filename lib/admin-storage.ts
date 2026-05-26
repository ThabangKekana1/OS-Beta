import type {
  AdminLead,
  AdminLeadContactStatus,
  AdminLeadOrigin,
  AdminLeadPartner,
  PartnerOrg,
  PartnerOrgStatus,
  PartnerOrgTier,
  SalesLead,
} from "@/lib/admin-types";
import {
  adminLeadContactStatuses,
  adminLeadOrigins,
  adminLeadPartners,
  partnerOrgStatuses,
  partnerOrgTiers,
} from "@/lib/admin-types";

export const ADMIN_STORAGE_KEY = "oneos:admin:v1";

export type AdminStorageSnapshot = {
  leads: AdminLead[];
  activeLeadId: string | null;
  salesLeads: SalesLead[];
  partnerOrgs?: PartnerOrg[];
};

const contactStatusSet = new Set<string>(adminLeadContactStatuses);
const originSet = new Set<string>(adminLeadOrigins);
const partnerSet = new Set<string>(adminLeadPartners);
const partnerOrgTierSet = new Set<string>(partnerOrgTiers);
const partnerOrgStatusSet = new Set<string>(partnerOrgStatuses);

function coercePartner(value: unknown): AdminLeadPartner | null {
  if (typeof value === "string" && partnerSet.has(value)) {
    return value as AdminLeadPartner;
  }
  return null;
}

function coerceOrigin(value: unknown): AdminLeadOrigin {
  if (typeof value === "string" && originSet.has(value)) {
    return value as AdminLeadOrigin;
  }
  return "created";
}

function coerceContactStatus(value: unknown): AdminLeadContactStatus {
  if (typeof value === "string" && contactStatusSet.has(value)) {
    return value as AdminLeadContactStatus;
  }
  return "Not Contacted";
}

function coerceIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function normalizeAdminLead(lead: AdminLead): AdminLead {
  const nameParts = lead.contactName.trim().split(/\s+/).filter(Boolean);
  const contactFirstName =
    typeof lead.contactFirstName === "string" && lead.contactFirstName.trim().length > 0
      ? lead.contactFirstName.trim()
      : nameParts[0] ?? lead.contactName;
  const contactSurname =
    typeof lead.contactSurname === "string" && lead.contactSurname.trim().length > 0
      ? lead.contactSurname.trim()
      : nameParts.slice(1).join(" ");
  const contactPosition =
    typeof lead.contactPosition === "string" && lead.contactPosition.trim().length > 0
      ? lead.contactPosition.trim()
      : lead.userProfile.role || "Owner";
  const createdAt =
    coerceIsoTimestamp((lead as Partial<AdminLead>).createdAt) ??
    coerceIsoTimestamp(lead.userProfile.joinedAt) ??
    new Date().toISOString();
  const hasRegistrationSignal = Boolean(
    (lead as Partial<AdminLead>).isClientRegistered === true ||
      (lead as Partial<AdminLead>).registrationSource?.channel === "public_link" ||
      (lead as Partial<AdminLead>).migrationAssessment,
  );
  const registeredAt =
    coerceIsoTimestamp((lead as Partial<AdminLead>).registeredAt) ??
    (hasRegistrationSignal ? createdAt : null);
  const manuallyAddedAt =
    coerceIsoTimestamp((lead as Partial<AdminLead>).manuallyAddedAt) ??
    ((lead as Partial<AdminLead>).origin === "created" &&
    (lead as Partial<AdminLead>).registrationSource?.channel !== "public_link"
      ? createdAt
      : null);

  return {
    ...lead,
    createdAt,
    registeredAt,
    manuallyAddedAt,
    contactFirstName,
    contactSurname,
    contactPosition,
    contactStatus: coerceContactStatus((lead as Partial<AdminLead>).contactStatus),
    origin: coerceOrigin((lead as Partial<AdminLead>).origin),
    partner: coercePartner((lead as Partial<AdminLead>).partner),
    isClientRegistered:
      typeof (lead as Partial<AdminLead>).isClientRegistered === "boolean"
        ? (lead as AdminLead).isClientRegistered
        : Boolean(
            (lead.businessRegistrationNumber ?? "").trim() &&
              (lead.industry ?? "").trim(),
          ),
    linkedSalesLeadId:
      typeof (lead as Partial<AdminLead>).linkedSalesLeadId === "string"
        ? (lead as AdminLead).linkedSalesLeadId
        : null,
    partnerOrgId:
      typeof (lead as Partial<AdminLead>).partnerOrgId === "string" &&
      ((lead as AdminLead).partnerOrgId ?? "").trim().length > 0
        ? (lead as AdminLead).partnerOrgId
        : null,
    registrationSource: lead.registrationSource ?? null,
    userProfile: {
      ...lead.userProfile,
      role: lead.userProfile.role || contactPosition,
    },
    eoiSigningToken: lead.eoiSigningToken ?? null,
    eoiSignatureId: lead.eoiSignatureId ?? null,
    eoiSignedBy: lead.eoiSignedBy ?? null,
    eoiSignedAt: lead.eoiSignedAt ?? null,
    eoiAcceptedTermsAt: lead.eoiAcceptedTermsAt ?? null,
    onboardingCompletedAt: lead.onboardingCompletedAt ?? null,
  };
}

function isSalesLeadQualificationStage(value: string) {
  return (
    value === "Havent Contacted" ||
    value === "Contacted" ||
    value === "Interested" ||
    value === "Not Interested" ||
    value === "Does Not Qualify" ||
    value === "Qualifies"
  );
}

export function normalizeSalesLead(lead: SalesLead): SalesLead {
  const createdByEmail =
    typeof lead.createdByEmail === "string" && lead.createdByEmail.trim().length > 0
      ? lead.createdByEmail.trim().toLowerCase()
      : null;

  return {
    ...lead,
    createdByRole:
      lead.createdByRole === "admin"
        ? "admin"
        : lead.createdByRole === "partner"
          ? "partner"
          : "sales",
    createdByEmail,
    qualificationStage: isSalesLeadQualificationStage(lead.qualificationStage)
      ? lead.qualificationStage
      : "Havent Contacted",
    qualificationReason:
      typeof lead.qualificationReason === "string" && lead.qualificationReason.trim().length > 0
        ? lead.qualificationReason.trim()
        : null,
    status: lead.status === "Converted" ? "Converted" : "Open",
    createdAt:
      typeof lead.createdAt === "string" && lead.createdAt.trim().length > 0
        ? lead.createdAt
        : new Date().toISOString(),
    lastUpdatedAt:
      typeof lead.lastUpdatedAt === "string" && lead.lastUpdatedAt.trim().length > 0
        ? lead.lastUpdatedAt
        : new Date().toISOString(),
    convertedClientProfileId: lead.convertedClientProfileId ?? null,
    linkedAdminLeadId:
      typeof (lead as Partial<SalesLead>).linkedAdminLeadId === "string"
        ? (lead as SalesLead).linkedAdminLeadId
        : null,
    partnerOrgId:
      typeof (lead as Partial<SalesLead>).partnerOrgId === "string" &&
      ((lead as SalesLead).partnerOrgId ?? "").trim().length > 0
        ? (lead as SalesLead).partnerOrgId
        : null,
  };
}

export function normalizeAdminLeads(leads: AdminLead[]) {
  return leads.map(normalizeAdminLead);
}

export function normalizeSalesLeads(leads: SalesLead[]) {
  return leads.map(normalizeSalesLead);
}

function coercePartnerOrgTier(value: unknown): PartnerOrgTier {
  if (typeof value === "string" && partnerOrgTierSet.has(value)) {
    return value as PartnerOrgTier;
  }
  return "Standard";
}

function coercePartnerOrgStatus(value: unknown): PartnerOrgStatus {
  if (typeof value === "string" && partnerOrgStatusSet.has(value)) {
    return value as PartnerOrgStatus;
  }
  return "Active";
}

export function normalizePartnerOrg(org: PartnerOrg): PartnerOrg {
  const now = new Date().toISOString();
  const commission = Number(org.commissionPct);
  return {
    id: typeof org.id === "string" ? org.id : "",
    name: typeof org.name === "string" ? org.name.trim() : "",
    contactName: typeof org.contactName === "string" ? org.contactName.trim() : "",
    contactEmail:
      typeof org.contactEmail === "string" ? org.contactEmail.trim().toLowerCase() : "",
    contactPhone: typeof org.contactPhone === "string" ? org.contactPhone.trim() : "",
    tier: coercePartnerOrgTier(org.tier),
    commissionPct:
      Number.isFinite(commission) && commission >= 0 && commission <= 100 ? commission : 5,
    status: coercePartnerOrgStatus(org.status),
    notes: typeof org.notes === "string" ? org.notes : "",
    createdAt: typeof org.createdAt === "string" && org.createdAt.length > 0 ? org.createdAt : now,
    updatedAt: typeof org.updatedAt === "string" && org.updatedAt.length > 0 ? org.updatedAt : now,
  };
}

export function normalizePartnerOrgs(orgs: PartnerOrg[]) {
  return orgs
    .map(normalizePartnerOrg)
    .filter((org) => org.id.length > 0 && org.name.length > 0);
}

export function readAdminStorageSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      leads?: AdminLead[];
      activeLeadId?: string | null;
      salesLeads?: SalesLead[];
      partnerOrgs?: PartnerOrg[];
    };

    if (!Array.isArray(parsed.leads)) {
      return null;
    }

    return {
      leads: normalizeAdminLeads(parsed.leads),
      activeLeadId:
        typeof parsed.activeLeadId === "string" || parsed.activeLeadId === null
          ? parsed.activeLeadId
          : null,
      salesLeads: Array.isArray(parsed.salesLeads)
        ? normalizeSalesLeads(parsed.salesLeads)
        : [],
      partnerOrgs: Array.isArray(parsed.partnerOrgs)
        ? normalizePartnerOrgs(parsed.partnerOrgs)
        : [],
    } satisfies AdminStorageSnapshot;
  } catch {
    return null;
  }
}

export function writeAdminStorageSnapshot(snapshot: AdminStorageSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn("[AdminStorage] Unable to persist local admin snapshot.", error);
    window.localStorage.removeItem(ADMIN_STORAGE_KEY);
  }
}

export function clearAdminStorageSnapshot() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ADMIN_STORAGE_KEY);
}

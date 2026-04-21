import type { AdminLead, AdminLeadContactStatus, SalesLead } from "@/lib/admin-types";
import { adminLeadContactStatuses } from "@/lib/admin-types";

export const ADMIN_STORAGE_KEY = "oneos:admin:v1";

export type AdminStorageSnapshot = {
  leads: AdminLead[];
  activeLeadId: string | null;
  salesLeads: SalesLead[];
};

const contactStatusSet = new Set<string>(adminLeadContactStatuses);

function coerceContactStatus(value: unknown): AdminLeadContactStatus {
  if (typeof value === "string" && contactStatusSet.has(value)) {
    return value as AdminLeadContactStatus;
  }
  return "Not Contacted";
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

  return {
    ...lead,
    contactFirstName,
    contactSurname,
    contactPosition,
    contactStatus: coerceContactStatus((lead as Partial<AdminLead>).contactStatus),
    registrationSource: lead.registrationSource ?? null,
    userProfile: {
      ...lead.userProfile,
      role: lead.userProfile.role || contactPosition,
    },
    eoiSigningToken: lead.eoiSigningToken ?? null,
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
    createdByRole: lead.createdByRole === "admin" ? "admin" : "sales",
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
  };
}

export function normalizeAdminLeads(leads: AdminLead[]) {
  return leads.map(normalizeAdminLead);
}

export function normalizeSalesLeads(leads: SalesLead[]) {
  return leads.map(normalizeSalesLead);
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
    } satisfies AdminStorageSnapshot;
  } catch {
    return null;
  }
}

export function writeAdminStorageSnapshot(snapshot: AdminStorageSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(snapshot));
}

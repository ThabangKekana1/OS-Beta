import {
  normalizeAdminLeads,
  normalizePartnerOrgs,
  normalizeSalesLeads,
  type AdminStorageSnapshot,
} from "@/lib/admin-storage";
import type { AdminLead, PartnerOrg, SalesLead } from "@/lib/admin-types";

export type AdminStateSnapshot = AdminStorageSnapshot;

function toActiveLeadId(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (value === null) {
    return null;
  }

  return null;
}

function toLeads(value: unknown): AdminLead[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return normalizeAdminLeads(value as AdminLead[]);
}

function toSalesLeads(value: unknown): SalesLead[] | null {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  return normalizeSalesLeads(value as SalesLead[]);
}

function toPartnerOrgs(value: unknown): PartnerOrg[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return normalizePartnerOrgs(value as PartnerOrg[]);
}

export function createDefaultAdminStateSnapshot(): AdminStateSnapshot {
  return {
    leads: [],
    activeLeadId: null,
    salesLeads: [],
    partnerOrgs: [],
  };
}

export function normalizeAdminStateSnapshot(input: unknown): AdminStateSnapshot | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const typed = input as {
    leads?: unknown;
    activeLeadId?: unknown;
    salesLeads?: unknown;
    partnerOrgs?: unknown;
  };

  const leads = toLeads(typed.leads);
  if (!leads) {
    return null;
  }

  const activeLeadId = toActiveLeadId(typed.activeLeadId);
  const salesLeads = toSalesLeads(typed.salesLeads);
  if (!salesLeads) {
    return null;
  }

  return {
    leads,
    activeLeadId,
    salesLeads,
    partnerOrgs: toPartnerOrgs(typed.partnerOrgs),
  };
}

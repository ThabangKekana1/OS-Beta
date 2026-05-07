import type { AdminStateSnapshot } from "@/lib/admin-state";
import type { AdminLead } from "@/lib/admin-types";

function partnerAccessSets(snapshot: AdminStateSnapshot, partnerOrgId: string) {
  const partnerSalesLeads = snapshot.salesLeads.filter(
    (lead) => lead.partnerOrgId === partnerOrgId,
  );

  return {
    partnerSalesLeadIds: new Set(partnerSalesLeads.map((lead) => lead.id)),
    linkedAdminLeadIds: new Set(
      partnerSalesLeads
        .map((lead) => lead.linkedAdminLeadId)
        .filter((id): id is string => Boolean(id)),
    ),
    convertedClientProfileIds: new Set(
      partnerSalesLeads
        .map((lead) => lead.convertedClientProfileId)
        .filter((id): id is string => Boolean(id)),
    ),
  };
}

export function partnerCanAccessClientLead(
  snapshot: AdminStateSnapshot,
  lead: AdminLead,
  partnerOrgId: string,
) {
  if (!lead.isClientRegistered) return false;

  const { partnerSalesLeadIds, linkedAdminLeadIds, convertedClientProfileIds } =
    partnerAccessSets(snapshot, partnerOrgId);

  return (
    lead.partnerOrgId === partnerOrgId ||
    linkedAdminLeadIds.has(lead.id) ||
    convertedClientProfileIds.has(lead.clientProfileId) ||
    (lead.linkedSalesLeadId ? partnerSalesLeadIds.has(lead.linkedSalesLeadId) : false)
  );
}

export function getPartnerClientLeads(
  snapshot: AdminStateSnapshot,
  partnerOrgId: string,
) {
  return snapshot.leads.filter((lead) =>
    partnerCanAccessClientLead(snapshot, lead, partnerOrgId),
  );
}

export function findPartnerClientLead(
  snapshot: AdminStateSnapshot,
  partnerOrgId: string,
  leadIdOrProfileId: string,
) {
  const lookup = decodeURIComponent(leadIdOrProfileId).trim();
  return (
    snapshot.leads.find(
      (lead) =>
        (lead.id === lookup || lead.clientProfileId === lookup) &&
        partnerCanAccessClientLead(snapshot, lead, partnerOrgId),
    ) ?? null
  );
}
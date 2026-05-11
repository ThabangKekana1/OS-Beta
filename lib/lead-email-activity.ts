import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import { makeId, timelineLabel } from "@/lib/formatting";
import type { AdminLead, SalesLead } from "@/lib/admin-types";

type EmailActivity = "sent" | "reply";

const adminOutcomeStatuses = new Set(["Interested", "Not Interested", "Converted"]);
const salesOutcomeStages = new Set([
  "Interested",
  "Not Interested",
  "Does Not Qualify",
  "Qualifies",
]);

function shouldPromoteAdminLead(lead: AdminLead) {
  return !adminOutcomeStatuses.has(lead.contactStatus);
}

function shouldPromoteSalesLead(lead: SalesLead) {
  return !salesOutcomeStages.has(lead.qualificationStage);
}

function activityCopy(activity: EmailActivity) {
  if (activity === "reply") {
    return {
      adminTitle: "Email reply received",
      adminDetail: "Client replied in the 1OS inbox.",
    };
  }

  return {
    adminTitle: "Email sent",
    adminDetail: "Outbound email sent from the 1OS inbox.",
  };
}

async function recordLeadEmailActivity(
  leadId: string | null | undefined,
  activity: EmailActivity,
  updatedBy: string,
) {
  const cleanLeadId = leadId?.trim();
  if (!cleanLeadId) return false;

  const { snapshot } = await readAdminStateSnapshot();
  const now = new Date().toISOString();
  const copy = activityCopy(activity);
  let changed = false;
  let linkedSalesLeadId: string | null = null;

  const nextLeads = snapshot.leads.map((lead) => {
    if (lead.id !== cleanLeadId) return lead;
    linkedSalesLeadId = lead.linkedSalesLeadId;
    changed = true;

    return {
      ...lead,
      contactStatus: shouldPromoteAdminLead(lead) ? ("Contacted" as const) : lead.contactStatus,
      lastTouched: "Just now",
      events: [
        {
          id: makeId("event"),
          title: copy.adminTitle,
          detail: copy.adminDetail,
          createdAt: timelineLabel(),
          tone: activity === "reply" ? ("client" as const) : ("agent" as const),
        },
        ...lead.events,
      ],
    };
  });

  const nextSalesLeads = snapshot.salesLeads.map((lead) => {
    const matches =
      lead.linkedAdminLeadId === cleanLeadId ||
      (linkedSalesLeadId ? lead.id === linkedSalesLeadId : false);
    if (!matches) return lead;

    changed = true;
    return {
      ...lead,
      qualificationStage: shouldPromoteSalesLead(lead)
        ? ("Contacted" as const)
        : lead.qualificationStage,
      lastUpdatedAt: now,
    };
  });

  if (!changed) return false;

  await writeAdminStateSnapshot(
    {
      ...snapshot,
      leads: nextLeads,
      salesLeads: nextSalesLeads,
    },
    updatedBy,
  );

  return true;
}

export function recordLeadEmailSent(
  leadId: string | null | undefined,
  updatedBy: string,
) {
  return recordLeadEmailActivity(leadId, "sent", updatedBy);
}

export function recordLeadEmailReply(
  leadId: string | null | undefined,
  updatedBy: string,
) {
  return recordLeadEmailActivity(leadId, "reply", updatedBy);
}

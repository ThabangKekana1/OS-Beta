import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import { makeId, timelineLabel } from "@/lib/formatting";
import { hasSupabaseAdminConfig } from "@/lib/supabase-admin";
import {
  readAdminLeadByIdFromDatabase,
  readSalesLeadForAdminLeadFromDatabase,
  upsertAdminLeadOnly,
  upsertSalesLeadOnly,
} from "@/lib/supabase-db-store";
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

function applyAdminLeadActivity(lead: AdminLead, activity: EmailActivity): AdminLead {
  const copy = activityCopy(activity);
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
}

function applySalesLeadActivity(lead: SalesLead): SalesLead {
  return {
    ...lead,
    qualificationStage: shouldPromoteSalesLead(lead)
      ? ("Contacted" as const)
      : lead.qualificationStage,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Targeted DB path: read the single lead (and its linked sales lead) directly
 * from Supabase, mutate in memory, and upsert only those one or two rows.
 *
 * This avoids loading the full admin snapshot (~5k leads) and upserting it
 * back on every email send — that bulk write was timing out and silently
 * dropping the new "Email sent" timeline events.
 */
async function recordLeadEmailActivityTargeted(
  leadId: string,
  activity: EmailActivity,
): Promise<boolean> {
  const lead = await readAdminLeadByIdFromDatabase(leadId);
  if (!lead) return false;

  const updatedLead = applyAdminLeadActivity(lead, activity);
  const wrote = await upsertAdminLeadOnly(updatedLead);
  if (!wrote) return false;

  const salesLead = await readSalesLeadForAdminLeadFromDatabase(
    leadId,
    lead.linkedSalesLeadId ?? null,
  );
  if (salesLead) {
    await upsertSalesLeadOnly(applySalesLeadActivity(salesLead));
  }

  return true;
}

async function recordLeadEmailActivity(
  leadId: string | null | undefined,
  activity: EmailActivity,
  updatedBy: string,
) {
  const cleanLeadId = leadId?.trim();
  if (!cleanLeadId) return false;

  if (hasSupabaseAdminConfig()) {
    try {
      const ok = await recordLeadEmailActivityTargeted(cleanLeadId, activity);
      if (ok) return true;
    } catch (error) {
      console.error("[lead-email-activity] targeted update failed, falling back", error);
    }
  }

  // Fallback: full-snapshot rewrite (local JSON store or recovery path).
  const { snapshot } = await readAdminStateSnapshot();
  let changed = false;
  let linkedSalesLeadId: string | null = null;

  const nextLeads = snapshot.leads.map((lead) => {
    if (lead.id !== cleanLeadId) return lead;
    linkedSalesLeadId = lead.linkedSalesLeadId;
    changed = true;
    return applyAdminLeadActivity(lead, activity);
  });

  const nextSalesLeads = snapshot.salesLeads.map((lead) => {
    const matches =
      lead.linkedAdminLeadId === cleanLeadId ||
      (linkedSalesLeadId ? lead.id === linkedSalesLeadId : false);
    if (!matches) return lead;

    changed = true;
    return applySalesLeadActivity(lead);
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

import type { AdminLead } from "@/lib/admin-types";

export const FOUNDATION_ASSESSMENT_COMPLETED_EVENT = "Bill-audited Foundation-1 assessment completed";

export function hasCompletedFoundationAssessment(lead: Pick<AdminLead, "eoiSignedAt" | "events">) {
  return Boolean(lead.eoiSignedAt)
    || lead.events.some((event) => event.title === FOUNDATION_ASSESSMENT_COMPLETED_EVENT);
}

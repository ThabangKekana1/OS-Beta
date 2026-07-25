import type { AdminLead, AdminLeadStage } from "@/lib/admin-types";

/**
 * Canonical pipeline order for admin lead stages. Single source of truth for
 * "never demote a lead" promotion logic (used by the public upload route and
 * the client-facing proposal-accept / mandate-sign routes).
 */
const STAGE_RANK: Record<AdminLeadStage, number> = {
  "Client Registered": 1,
  "EOI Generated": 2,
  "EOI Signed": 3,
  "Utility Bills Uploaded": 4,
  "Proposal Accepted": 5,
  "Mandate Signed": 6,
  "Direct KYC Submitted": 7,
  "Compliance Pack Uploaded": 7,
  "Term Sheet Uploaded": 8,
  "Onboarding Complete": 9,
  Disqualified: 99,
};

export function stageRank(stage: AdminLead["stage"]) {
  return STAGE_RANK[stage] ?? 0;
}

/** Promote the lead's stage, never demoting and never leaving terminal states. */
export function promoteLeadStage(
  lead: AdminLead,
  target: AdminLead["stage"],
): AdminLead["stage"] {
  if (lead.stage === "Disqualified" || lead.stage === "Onboarding Complete") return lead.stage;
  return stageRank(lead.stage) < stageRank(target) ? target : lead.stage;
}

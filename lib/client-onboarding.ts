import type { AdminLead, AdminLeadDocument, AdminLeadStage } from "@/lib/admin-types";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { loadRegistrationDraft } from "@/lib/registration-agent";

const ACTIVE_STAGE_ORDER: AdminLeadStage[] = [
  "EOI Generated",
  "Client Registered",
  "EOI Signed",
  "Utility Bills Uploaded",
  "Compliance Pack Uploaded",
  "Term Sheet Uploaded",
  "Onboarding Complete",
  "Disqualified",
];

function stagePriority(stage: AdminLeadStage) {
  const index = ACTIVE_STAGE_ORDER.indexOf(stage);
  return index === -1 ? ACTIVE_STAGE_ORDER.length : index;
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function sortLeads(left: AdminLead, right: AdminLead) {
  return stagePriority(left.stage) - stagePriority(right.stage);
}

async function findLeadByWorkspaceId(workspaceId: string | null | undefined, leads: AdminLead[]) {
  if (!workspaceId) {
    return null;
  }

  const draft = await loadRegistrationDraft(workspaceId);
  if (!draft?.completedLeadId) {
    return null;
  }

  return leads.find((lead) => lead.id === draft.completedLeadId) ?? null;
}

export async function resolveClientOnboardingLead(input: {
  sessionEmail: string;
  workspaceId?: string | null;
  caseName?: string | null;
}): Promise<AdminLead | null> {
  const sessionEmail = normalize(input.sessionEmail);
  if (!sessionEmail) {
    return null;
  }

  const { snapshot } = await readAdminStateSnapshot();
  const workspaceLead = await findLeadByWorkspaceId(input.workspaceId, snapshot.leads);
  if (workspaceLead && normalize(workspaceLead.userProfile.email) === sessionEmail) {
    return workspaceLead;
  }

  const matchingEmail = snapshot.leads.filter(
    (lead) => normalize(lead.userProfile.email) === sessionEmail,
  );
  if (matchingEmail.length === 0) {
    return null;
  }

  const caseName = normalize(input.caseName);
  if (caseName) {
    const exactCaseLead = matchingEmail.find((lead) => normalize(lead.company) === caseName);
    if (exactCaseLead) {
      return exactCaseLead;
    }
  }

  return [...matchingEmail].sort(sortLeads)[0] ?? null;
}

export function findLeadDocument(
  lead: AdminLead,
  predicate: (document: AdminLeadDocument) => boolean,
) {
  return lead.documents.find(predicate) ?? null;
}

import type { AdminLead, AdminLeadStage } from "@/lib/admin-types";

export const DEAL_VALUE_ZAR = 10_000;

const EOI_DEAL_STAGES = new Set<AdminLeadStage>([
  "EOI Signed",
  "Utility Bills Uploaded",
  "Compliance Pack Uploaded",
  "Term Sheet Uploaded",
  "Onboarding Complete",
]);

function leadDealValue() {
  return DEAL_VALUE_ZAR;
}

function isClosedDeal(lead: AdminLead) {
  return lead.stage === "Onboarding Complete";
}

export function isEoiDeal(lead: AdminLead) {
  return Boolean(lead.eoiSignedAt) || EOI_DEAL_STAGES.has(lead.stage);
}

export function sumDealValue(leads: AdminLead[]) {
  return leads.length * leadDealValue();
}

export function sumEoiDealValue(leads: AdminLead[]) {
  return sumDealValue(leads.filter(isEoiDeal));
}

export function sumClosedDealValue(leads: AdminLead[]) {
  return sumDealValue(leads.filter(isClosedDeal));
}

import type { AdminLead } from "@/lib/admin-types";

export const DEAL_VALUE_ZAR = 10_000;

export function leadDealValue() {
  return DEAL_VALUE_ZAR;
}

export function isClosedDeal(lead: AdminLead) {
  return lead.stage === "Onboarding Complete";
}

export function isEoiDeal(lead: AdminLead) {
  return lead.stage !== "Onboarding Complete" && lead.stage !== "Disqualified";
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

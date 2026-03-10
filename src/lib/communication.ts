import { CommunicationStatus, CommunicationThreadType, CommunicationVisibilityScope, UserRole } from "@prisma/client";

export const COMMUNICATION_THREAD_LABELS: Record<CommunicationThreadType, string> = {
  BUSINESS_SUPPORT: "Business Support",
  SALES_ESCALATION: "Sales Escalation",
  INTERNAL_ADMIN_NOTE: "Internal Administrator Note",
};

export const COMMUNICATION_VISIBILITY_LABELS: Record<CommunicationVisibilityScope, string> = {
  BUSINESS_ADMIN: "Business and Administrator",
  SALES_ADMIN: "Sales and Administrator",
  ADMIN_ONLY: "Administrator Only",
};

export const COMMUNICATION_STATUS_LABELS: Record<CommunicationStatus, string> = {
  OPEN: "Open",
  PENDING: "Pending",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function isAdministratorRole(role: UserRole) {
  return role === "ADMINISTRATOR" || role === "SUPER_ADMIN";
}

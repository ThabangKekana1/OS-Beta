import type {
  AdminLeadContactStatus,
  SalesLeadQualificationStage,
} from "@/lib/admin-types";

/**
 * Maps an AdminLead contact status (Repository view) to its corresponding
 * SalesLead qualification stage (My Leads view).
 *
 * Returns null if the status has no meaningful sales-side equivalent
 * (caller should treat as "no mirror needed").
 */
export function adminContactToQualification(
  status: AdminLeadContactStatus,
): SalesLeadQualificationStage | null {
  switch (status) {
    case "Not Contacted":
      return "Havent Contacted";
    case "Contacted":
      return "Contacted";
    case "Interested":
      return "Interested";
    case "Not Interested":
      return "Not Interested";
    case "Follow Up":
      return "Contacted";
    case "Converted":
      return "Qualifies";
    default:
      return null;
  }
}

/**
 * Reverse direction: SalesLead qualification stage -> AdminLead contact status.
 */
export function qualificationToAdminContact(
  stage: SalesLeadQualificationStage,
): AdminLeadContactStatus | null {
  switch (stage) {
    case "Havent Contacted":
      return "Not Contacted";
    case "Contacted":
      return "Contacted";
    case "Interested":
      return "Interested";
    case "Not Interested":
      return "Not Interested";
    case "Does Not Qualify":
      return "Not Interested";
    case "Qualifies":
      return "Converted";
    default:
      return null;
  }
}

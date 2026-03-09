import { UserRole } from "@prisma/client";
import { KYC_RESTRICTED_DOC_CODES } from "./constants";

export type Permission =
  | "leads:create"
  | "leads:view_own"
  | "leads:view_all"
  | "leads:update_own"
  | "leads:kill"
  | "businesses:view_own"
  | "businesses:view_attributed"
  | "businesses:view_all"
  | "businesses:create"
  | "businesses:update"
  | "businesses:assign"
  | "businesses:disqualify"
  | "deals:view_own"
  | "deals:view_attributed"
  | "deals:view_all"
  | "deals:advance_stage"
  | "deals:stall"
  | "deals:unstall"
  | "deals:reassign"
  | "documents:upload_own"
  | "documents:upload_any"
  | "documents:review"
  | "documents:view_own"
  | "documents:view_attributed"
  | "documents:view_all"
  | "documents:forward_to_partner"
  | "tasks:view_own"
  | "tasks:view_all"
  | "tasks:create"
  | "tasks:update"
  | "tasks:complete"
  | "notes:create_internal"
  | "notes:create_visible"
  | "notes:view_internal"
  | "notes:view_visible"
  | "analytics:view_own"
  | "analytics:view_all"
  | "users:manage"
  | "settings:manage_stages"
  | "settings:manage_documents"
  | "settings:manage_stall_reasons"
  | "notifications:view_own"
  | "escalate";

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: [
    "leads:view_all", "leads:create",
    "businesses:view_all", "businesses:create", "businesses:update", "businesses:assign", "businesses:disqualify",
    "deals:view_all", "deals:advance_stage", "deals:stall", "deals:unstall", "deals:reassign",
    "documents:upload_any", "documents:review", "documents:view_all", "documents:forward_to_partner",
    "tasks:view_all", "tasks:create", "tasks:update", "tasks:complete",
    "notes:create_internal", "notes:create_visible", "notes:view_internal", "notes:view_visible",
    "analytics:view_all",
    "users:manage",
    "settings:manage_stages", "settings:manage_documents", "settings:manage_stall_reasons",
    "notifications:view_own",
  ],
  ADMINISTRATOR: [
    "leads:view_all",
    "businesses:view_all", "businesses:update", "businesses:assign", "businesses:disqualify",
    "deals:view_all", "deals:advance_stage", "deals:stall", "deals:unstall", "deals:reassign",
    "documents:upload_any", "documents:review", "documents:view_all", "documents:forward_to_partner",
    "tasks:view_all", "tasks:create", "tasks:update", "tasks:complete",
    "notes:create_internal", "notes:create_visible", "notes:view_internal", "notes:view_visible",
    "analytics:view_all",
    "notifications:view_own",
  ],
  SALES_REPRESENTATIVE: [
    "leads:create", "leads:view_own", "leads:update_own", "leads:kill",
    "businesses:view_attributed",
    "deals:view_attributed",
    "documents:view_attributed",
    "tasks:view_own",
    "notes:create_visible", "notes:view_visible",
    "analytics:view_own",
    "notifications:view_own",
    "escalate",
  ],
  BUSINESS_USER: [
    "businesses:view_own",
    "deals:view_own",
    "documents:upload_own", "documents:view_own",
    "tasks:view_own",
    "notes:view_visible",
    "notifications:view_own",
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getPermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function canViewDocument(role: UserRole, docTypeCode: string): boolean {
  if (role === "SALES_REPRESENTATIVE" && KYC_RESTRICTED_DOC_CODES.includes(docTypeCode)) {
    return false;
  }
  return true;
}

export function isAdmin(role: UserRole): boolean {
  return role === "ADMINISTRATOR" || role === "SUPER_ADMIN";
}

export function isSuperAdmin(role: UserRole): boolean {
  return role === "SUPER_ADMIN";
}

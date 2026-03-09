import type { UserRole } from "@prisma/client";

export function getDashboardRoute(role: UserRole | null | undefined) {
  switch (role) {
    case "SUPER_ADMIN":
    case "ADMINISTRATOR":
      return "/admin/dashboard";
    case "SALES_REPRESENTATIVE":
      return "/sales/dashboard";
    case "BUSINESS_USER":
      return "/business/dashboard";
    default:
      return null;
  }
}

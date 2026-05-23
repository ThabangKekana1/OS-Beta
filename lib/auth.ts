/**
 * Auth primitives shared between server and client.
 *
 * All authentication is handled by Supabase Auth. This module only provides:
 * - The `UserRole` + `AuthSession` types used throughout the app.
 * - `resolveDefaultRouteForRole()` for post-login redirects.
 *
 * Roles are resolved by looking up the authenticated email in `oneos_users`
 * (see `lib/users-db.ts`). Admins and sales users have separate dashboard
 * roots so sales users only enter the scoped sales workspace.
 */

export type UserRole = "admin" | "sales" | "partner" | "client";

export type AuthSession = {
  userId: string | null;
  email: string;
  name: string;
  role: UserRole;
  agentId: string | null;
  partnerOrgId?: string | null;
};

export function resolveDefaultRouteForRole(role: UserRole) {
  if (role === "admin") return "/admin";
  if (role === "sales") return "/sales";
  return "/";
}

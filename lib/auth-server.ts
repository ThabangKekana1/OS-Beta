import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  readActiveSessionToken,
  resolveDefaultRouteForRole,
  SESSION_COOKIE_NAME,
  type AuthSession,
  type UserRole,
} from "@/lib/auth";

export async function getServerAuthSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return readActiveSessionToken(token);
}

export async function requireServerAuthSession(role?: UserRole): Promise<AuthSession> {
  const session = await getServerAuthSession();

  if (!session) {
    redirect("/login");
  }

  if (role && session.role !== role) {
    redirect(resolveDefaultRouteForRole(session.role));
  }

  return session;
}

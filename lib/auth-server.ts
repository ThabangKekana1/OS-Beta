import { redirect } from "next/navigation";
import {
  resolveDefaultRouteForRole,
  type AuthSession,
  type UserRole,
} from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileByEmail } from "@/lib/users-db";

function hasSupabaseAuthEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

export async function getServerAuthSession(): Promise<AuthSession | null> {
  if (!hasSupabaseAuthEnv()) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    const user = data.user;
    if (!user.email) return null;
    if (!user.email_confirmed_at && !user.confirmed_at) return null;

    const email = user.email.toLowerCase();
    const profile = await findProfileByEmail(email).catch(() => null);

    const metaName =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      null;

    if (profile && profile.isActive) {
      const effectiveAgentId = profile.agentId ?? (profile.role === "sales" ? profile.id : null);

      return {
        userId: profile.id,
        email: profile.email,
        name: profile.name || metaName || email.split("@")[0],
        role: profile.role,
        agentId: effectiveAgentId,
        partnerOrgId: profile.partnerOrgId,
      };
    }

    // No profile row — keep the user out of admin-only routes.
    return {
      userId: null,
      email,
      name: metaName ?? email.split("@")[0],
      role: "client",
      agentId: null,
      partnerOrgId: null,
    };
  } catch {
    return null;
  }
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

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  resolveDefaultRouteForRole,
  type AuthSession,
  type UserRole,
} from "@/lib/auth";
import { foundationDisplayNameForEmail } from "@/lib/email-signature-copy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { findProfileByEmail } from "@/lib/users-db";

function hasSupabaseAuthEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

async function authSessionFromSupabaseUser(user: User): Promise<AuthSession | null> {
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
      name: foundationDisplayNameForEmail(profile.email, profile.name || metaName || email.split("@")[0]),
      role: profile.role,
      agentId: effectiveAgentId,
      partnerOrgId: profile.partnerOrgId,
    };
  }

  // No profile row — keep the user out of admin-only routes.
  return {
    userId: null,
    email,
    name: foundationDisplayNameForEmail(email, metaName ?? email.split("@")[0]),
    role: "client",
    agentId: null,
    partnerOrgId: null,
  };
}

function bearerTokenFromRequest(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function getServerAuthSession(): Promise<AuthSession | null> {
  if (!hasSupabaseAuthEnv()) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return authSessionFromSupabaseUser(data.user);
  } catch {
    return null;
  }
}

export async function getServerAuthSessionFromRequest(request: Request): Promise<AuthSession | null> {
  const cookieSession = await getServerAuthSession();
  if (cookieSession) return cookieSession;

  const token = bearerTokenFromRequest(request);
  if (!token) return null;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return authSessionFromSupabaseUser(data.user);
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

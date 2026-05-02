import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { UserRole } from "@/lib/auth";

export type DbAgent = {
  id: string;
  name: string;
  role: "Admin" | "Sales Agent" | "Sales Manager" | "RevOps";
  region: string;
  isActive: boolean;
};

export type DbUserProfile = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  agentId: string | null;
  partnerOrgId: string | null;
  isActive: boolean;
};

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("does not exist");
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export async function listAgents(): Promise<DbAgent[] | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("oneos_agents")
    .select("id, name, role, region, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (isMissingRelationError(error)) return null;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    role: row.role as DbAgent["role"],
    region: row.region as string,
    isActive: Boolean(row.is_active),
  }));
}

// ---------------------------------------------------------------------------
// User profiles (role + agent + partner-org mapping for Supabase Auth users)
// ---------------------------------------------------------------------------

function rowToProfile(row: Record<string, unknown>): DbUserProfile {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    role: row.role as UserRole,
    agentId: (row.agent_id as string | null) ?? null,
    partnerOrgId: (row.partner_org_id as string | null) ?? null,
    isActive: Boolean(row.is_active),
  };
}

export async function findProfileByEmail(email: string): Promise<DbUserProfile | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("oneos_users")
    .select("id, email, name, role, agent_id, partner_org_id, is_active")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  if (isMissingRelationError(error)) return null;
  if (error) throw error;
  return data ? rowToProfile(data) : null;
}

export type UpsertProfileInput = {
  email: string;
  name: string;
  role: UserRole;
  agentId?: string | null;
  partnerOrgId?: string | null;
  isActive?: boolean;
};

export async function upsertProfile(input: UpsertProfileInput): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const { error } = await supabase
    .from("oneos_users")
    .upsert(
      {
        email: input.email.trim().toLowerCase(),
        name: input.name,
        role: input.role,
        agent_id: input.agentId ?? null,
        partner_org_id: input.partnerOrgId ?? null,
        is_active: input.isActive ?? true,
      },
      { onConflict: "email" },
    );

  if (error && !isMissingRelationError(error)) throw error;
}

import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type DbAgent = {
  id: string;
  name: string;
  role: "Admin" | "Sales Agent" | "Sales Manager" | "RevOps";
  region: string;
  isActive: boolean;
};

export type DbUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "sales";
  passwordHash: string;
  agentId: string | null;
  isActive: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
};

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("does not exist");
}

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

export async function upsertAgents(agents: DbAgent[]): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase || agents.length === 0) return;

  const rows = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    region: agent.region,
    is_active: agent.isActive,
  }));

  const { error } = await supabase.from("oneos_agents").upsert(rows, { onConflict: "id" });
  if (error && !isMissingRelationError(error)) throw error;
}

function rowToUser(row: Record<string, unknown>): DbUser {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    role: row.role as DbUser["role"],
    passwordHash: row.password_hash as string,
    agentId: (row.agent_id as string | null) ?? null,
    isActive: Boolean(row.is_active),
    failedLoginAttempts: Number(row.failed_login_attempts ?? 0),
    lockedUntil: row.locked_until ? new Date(row.locked_until as string) : null,
  };
}

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("oneos_users")
    .select(
      "id, email, name, role, password_hash, agent_id, is_active, failed_login_attempts, locked_until",
    )
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  if (isMissingRelationError(error)) return null;
  if (error) throw error;
  return data ? rowToUser(data) : null;
}

export async function findUserById(id: string): Promise<DbUser | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("oneos_users")
    .select(
      "id, email, name, role, password_hash, agent_id, is_active, failed_login_attempts, locked_until",
    )
    .eq("id", id)
    .maybeSingle();

  if (isMissingRelationError(error)) return null;
  if (error) throw error;
  return data ? rowToUser(data) : null;
}

export async function recordSuccessfulLogin(userId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase
    .from("oneos_users")
    .update({
      failed_login_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

export async function recordFailedLogin(userId: string, attempts: number): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  // Lock account for 15 minutes after 10 failed attempts.
  const shouldLock = attempts >= 10;
  await supabase
    .from("oneos_users")
    .update({
      failed_login_attempts: attempts,
      locked_until: shouldLock ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
    })
    .eq("id", userId);
}

export type UpsertUserInput = {
  email: string;
  name: string;
  role: "admin" | "sales";
  passwordHash: string;
  agentId: string | null;
};

export async function upsertUser(input: UpsertUserInput): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const { error } = await supabase
    .from("oneos_users")
    .upsert(
      {
        email: input.email.trim().toLowerCase(),
        name: input.name,
        role: input.role,
        password_hash: input.passwordHash,
        agent_id: input.agentId,
      },
      { onConflict: "email" },
    );

  if (error && !isMissingRelationError(error)) throw error;
}

import { hasSupabaseAdminConfig } from "@/lib/supabase-admin";
import { findUserByEmail, upsertUser, upsertAgents, listAgents, type DbAgent } from "@/lib/users-db";
import { ADMIN_AGENTS } from "@/lib/admin-mock-data";

type EnvProfile = {
  email: string;
  name: string;
  role: "admin" | "sales";
  password?: string;
  passwordHash?: string;
  agentId: string | null;
};

let bootstrapPromise: Promise<void> | null = null;
let bootstrapDone = false;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function pbkdf2Hash(password: string, iterations = 200_000): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return `pbkdf2:${iterations}:${bytesToHex(salt)}:${bytesToHex(new Uint8Array(bits))}`;
}

function readEnvProfiles(): EnvProfile[] {
  const raw = process.env.ONEOS_AUTH_PROFILES_JSON?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as EnvProfile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Idempotent bootstrap: ensure the agents and users tables are seeded.
 * Runs once per server process, on first request.
 *
 * - Agents: always upserts the canonical ADMIN_AGENTS list (these are the
 *   identity of the operators; the dashboard mock agent IDs become real rows).
 * - Users: only inserts a user from env if no row with that email exists.
 *   We never overwrite a DB user with an env profile.
 */
export function ensureBootstrap(): Promise<void> {
  if (bootstrapDone) return Promise.resolve();
  if (bootstrapPromise) return bootstrapPromise;
  if (!hasSupabaseAdminConfig()) return Promise.resolve();

  bootstrapPromise = (async () => {
    try {
      const dbAgents: DbAgent[] = ADMIN_AGENTS.map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role as DbAgent["role"],
        region: agent.region,
        isActive: true,
      }));
      await upsertAgents(dbAgents);

      const envProfiles = readEnvProfiles();
      for (const profile of envProfiles) {
        if (!profile.email || !profile.name || !profile.role) continue;
        const existing = await findUserByEmail(profile.email);
        if (existing) continue;

        let passwordHash = profile.passwordHash;
        if (!passwordHash && profile.password) {
          passwordHash = await pbkdf2Hash(profile.password);
        }
        if (!passwordHash) continue;

        await upsertUser({
          email: profile.email,
          name: profile.name,
          role: profile.role,
          passwordHash,
          agentId: profile.agentId ?? null,
        });
      }

      bootstrapDone = true;
    } catch (error) {
      console.error("[bootstrap] failed", error);
      // Reset so subsequent requests can retry.
      bootstrapPromise = null;
      throw error;
    }
  })();

  return bootstrapPromise;
}

/** Cached agents lookup with bootstrap guarantee. */
let agentCache: { value: DbAgent[]; expires: number } | null = null;
const AGENT_CACHE_TTL_MS = 30_000;

export async function getAgents(): Promise<DbAgent[]> {
  await ensureBootstrap();
  const now = Date.now();
  if (agentCache && agentCache.expires > now) return agentCache.value;

  const fromDb = await listAgents();
  if (fromDb && fromDb.length > 0) {
    agentCache = { value: fromDb, expires: now + AGENT_CACHE_TTL_MS };
    return fromDb;
  }

  // Dev fallback when Supabase isn't configured.
  return ADMIN_AGENTS.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role as DbAgent["role"],
    region: agent.region,
    isActive: true,
  }));
}

export function invalidateAgentCache() {
  agentCache = null;
}

export { pbkdf2Hash };

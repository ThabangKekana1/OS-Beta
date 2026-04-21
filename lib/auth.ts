export type UserRole = "admin" | "sales";

export type AuthSession = {
  email: string;
  name: string;
  role: UserRole;
  agentId: string | null;
};

type AuthProfile = AuthSession & {
  password?: string;
  passwordHash?: string;
};

export const SESSION_COOKIE_NAME = "oneos_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

function parseProfilesFromEnv(): AuthProfile[] | null {
  const raw = process.env.ONEOS_AUTH_PROFILES_JSON?.trim();

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as AuthProfile[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    const safeProfiles = parsed.filter((profile) => {
      return (
        typeof profile.email === "string" &&
        typeof profile.name === "string" &&
        (profile.role === "admin" || profile.role === "sales") &&
        (typeof profile.password === "string" ||
          typeof profile.passwordHash === "string")
      );
    });

    return safeProfiles.length > 0 ? safeProfiles : null;
  } catch {
    return null;
  }
}

function currentProfiles() {
  return parseProfilesFromEnv() ?? [];
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getSecret() {
  const secret = process.env.ONEOS_AUTH_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

export function getAuthConfigurationError() {
  if (!getSecret()) {
    return "Auth configuration error: ONEOS_AUTH_SECRET is missing or too short (min 16 chars).";
  }

  if (process.env.NODE_ENV === "production") {
    if ((process.env.ONEOS_AUTH_SECRET ?? "").length < 32) {
      return "Auth configuration error: ONEOS_AUTH_SECRET must be at least 32 characters in production.";
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.SUPABASE_URL) {
      return "Auth configuration error: Supabase URL is required in production.";
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return "Auth configuration error: SUPABASE_SERVICE_ROLE_KEY is required in production.";
    }
    return null;
  }

  const hasSupabase = Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const profiles = parseProfilesFromEnv();
  if (!hasSupabase && (!profiles || profiles.length === 0)) {
    return "Auth configuration error: ONEOS_AUTH_PROFILES_JSON is missing or invalid (and Supabase is not configured).";
  }

  return null;
}

function base64Encode(value: string) {
  return btoa(value);
}

function base64Decode(value: string) {
  return atob(value);
}

function toBase64Url(value: string) {
  return base64Encode(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (base64.length % 4 || 4)) % 4;
  return base64Decode(`${base64}${"=".repeat(padding)}`);
}

async function sign(value: string) {
  const secret = getSecret();
  if (!secret) {
    throw new Error(
      "ONEOS_AUTH_SECRET is missing or too short. Configure a secret with at least 16 characters.",
    );
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );

  return toBase64Url(String.fromCharCode(...new Uint8Array(signature)));
}

function timingSafeEqual(a: string, b: string) {
  const lengthMismatch = a.length !== b.length ? 1 : 0;
  // When lengths differ, compare `a` against itself to avoid leaking length
  // information through timing. The result is still rejected via `lengthMismatch`.
  const target = lengthMismatch ? a : b;

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ target.charCodeAt(index);
  }

  return (mismatch | lengthMismatch) === 0;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return bytesToHex(new Uint8Array(digest));
}

function hexToBytes(value: string) {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }

  return bytes;
}

async function pbkdf2Hex(password: string, saltHex: string, iterations: number) {
  const salt = hexToBytes(saltHex);
  if (!salt || !Number.isFinite(iterations) || iterations < 100000) {
    return null;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    256,
  );

  return bytesToHex(new Uint8Array(bits));
}

async function verifyPassword(profile: AuthProfile, password: string) {
  if (typeof profile.passwordHash === "string") {
    const [scheme, ...parts] = profile.passwordHash.split(":");

    if (scheme === "sha256" && parts.length === 1) {
      return timingSafeEqual(await sha256Hex(password), parts[0]);
    }

    if (scheme === "pbkdf2" && parts.length === 3) {
      const iterations = Number(parts[0]);
      const derived = await pbkdf2Hex(password, parts[1], iterations);
      return derived ? timingSafeEqual(derived, parts[2]) : false;
    }

    return false;
  }

  return typeof profile.password === "string"
    ? timingSafeEqual(profile.password, password)
    : false;
}

export function getAuthProfiles() {
  return currentProfiles();
}

export function getPublicLoginProfiles() {
  return currentProfiles().map((profile) => ({
    email: profile.email,
    role: profile.role,
    name: profile.name,
  }));
}

export function resolveDefaultRouteForRole(role: UserRole) {
  return role === "admin" ? "/admin" : "/sales";
}

export async function validateCredentials(email: string, password: string): Promise<AuthSession | null> {
  if (getAuthConfigurationError()) {
    return null;
  }

  // Prefer DB-backed users. Bootstrap seeds env profiles into the DB on first
  // request, so the DB is the source of truth in production.
  const { hasSupabaseAdminConfig } = await import("@/lib/supabase-admin");
  if (hasSupabaseAdminConfig()) {
    const { ensureBootstrap } = await import("@/lib/auth-bootstrap");
    await ensureBootstrap();

    const { findUserByEmail, recordSuccessfulLogin, recordFailedLogin } =
      await import("@/lib/users-db");
    const dbUser = await findUserByEmail(email);
    if (dbUser) {
      if (!dbUser.isActive) return null;
      if (dbUser.lockedUntil && dbUser.lockedUntil.getTime() > Date.now()) return null;

      const profileShape: AuthProfile = {
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        agentId: dbUser.agentId,
        passwordHash: dbUser.passwordHash,
      };
      const ok = await verifyPassword(profileShape, password);
      if (!ok) {
        await recordFailedLogin(dbUser.id, dbUser.failedLoginAttempts + 1);
        return null;
      }
      await recordSuccessfulLogin(dbUser.id);
      return {
        email: dbUser.email,
        role: dbUser.role,
        name: dbUser.name,
        agentId: dbUser.agentId,
      };
    }

    if (process.env.NODE_ENV === "production") return null;
  }

  const profile = currentProfiles().find(
    (entry) => normalizeEmail(entry.email) === normalizeEmail(email),
  );

  if (!profile) {
    return null;
  }

  if (!(await verifyPassword(profile, password))) {
    return null;
  }

  return {
    email: profile.email,
    role: profile.role,
    name: profile.name,
    agentId: profile.agentId,
  };
}

export async function createSessionToken(session: AuthSession) {
  const payload = {
    ...session,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = await sign(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export async function readSessionToken(token: string | null | undefined) {
  if (getAuthConfigurationError()) {
    return null;
  }

  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await sign(encodedPayload);
  if (!timingSafeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const raw = fromBase64Url(encodedPayload);
    const payload = JSON.parse(raw) as AuthSession & { expiresAt: number };

    if (typeof payload.expiresAt !== "number" || payload.expiresAt < Date.now()) {
      return null;
    }

    if (
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      (payload.role !== "admin" && payload.role !== "sales")
    ) {
      return null;
    }

    return {
      email: payload.email,
      name: payload.name,
      role: payload.role,
      agentId: typeof payload.agentId === "string" ? payload.agentId : null,
    } satisfies AuthSession;
  } catch {
    return null;
  }
}

/**
 * Production-grade variant: also checks the DB session table for revocation.
 * Use in routes that should refuse logged-out tokens (e.g., admin mutations).
 */
export async function readActiveSessionToken(token: string | null | undefined) {
  const session = await readSessionToken(token);
  if (!session || !token) return session;

  if (process.env.NODE_ENV === "production") {
    const { hasSupabaseAdminConfig } = await import("@/lib/supabase-admin");
    if (hasSupabaseAdminConfig()) {
      const { isSessionRevoked } = await import("@/lib/auth-sessions-db");
      if (await isSessionRevoked(token)) return null;
    }
  }

  return session;
}

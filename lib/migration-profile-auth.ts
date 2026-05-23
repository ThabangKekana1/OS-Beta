import crypto from "node:crypto";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function cleanMigrationProfileId(value: unknown) {
  return cleanString(value).toUpperCase();
}

export function cleanMigrationAccessCode(value: unknown) {
  return cleanString(value).replace(/\D/g, "");
}

export function isValidMigrationProfileId(value: string) {
  return /^[A-Z0-9-]{6,24}$/.test(value);
}

export function isValidMigrationAccessCode(value: string) {
  return /^\d{4}$/.test(value);
}

function hashSecret() {
  return (
    process.env.MIGRATION_ACCESS_CODE_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXTAUTH_SECRET ??
    "foundation1-migration-local"
  );
}

export function hashMigrationAccessCode(profileId: string, accessCode: string) {
  return crypto
    .createHmac("sha256", hashSecret())
    .update(`${profileId}:${accessCode}`)
    .digest("hex");
}

export function isMissingMigrationPortalProfilesTable(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("migration_portal_profiles");
}

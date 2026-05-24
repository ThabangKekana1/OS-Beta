import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  cleanMigrationAccessCode,
  cleanMigrationProfileId,
  hashMigrationAccessCode,
  isMissingMigrationPortalProfilesTable,
  isValidMigrationAccessCode,
  isValidMigrationProfileId,
} from "@/lib/migration-profile-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type LoginPayload = {
  profileId?: unknown;
  accessCode?: unknown;
};

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  let payload: LoginPayload;

  try {
    payload = (await request.json()) as LoginPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const profileId = cleanMigrationProfileId(payload.profileId);
  const accessCode = cleanMigrationAccessCode(payload.accessCode);

  if (!isValidMigrationProfileId(profileId) || !isValidMigrationAccessCode(accessCode)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid Profile ID and 4-digit access code." },
      { status: 400 },
    );
  }

  const limit = await consumeRateLimit({
    scope: "migration-profile-login",
    key: `${requestIp(request)}:${profileId}`,
    limit: 8,
    windowSeconds: 15 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many unlock attempts. Try again later." },
      { status: 429 },
    );
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Remote Migration Profiles are not configured." },
      { status: 503 },
    );
  }

  const { data, error } = await supabase
    .from("migration_portal_profiles")
    .select("profile_id, access_code_hash, payload")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    if (isMissingMigrationPortalProfilesTable(error)) {
      return NextResponse.json(
        { ok: false, error: "Remote Migration Profiles are not available yet." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { ok: false, error: error.message ?? "Unable to load Migration Profile." },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "Migration Profile not found." }, { status: 404 });
  }

  if (data.access_code_hash !== hashMigrationAccessCode(profileId, accessCode)) {
    return NextResponse.json({ ok: false, error: "Incorrect access code." }, { status: 403 });
  }

  const assessment =
    data.payload && typeof data.payload === "object" && !Array.isArray(data.payload)
      ? { ...(data.payload as Record<string, unknown>), profileId, accessCode }
      : null;

  if (!assessment) {
    return NextResponse.json(
      { ok: false, error: "Migration Profile data is invalid." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, assessment });
}

import { NextRequest, NextResponse } from "next/server";
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

type ProfilePayload = {
  profileId?: unknown;
  accessCode?: unknown;
  assessment?: unknown;
};

function sanitizedAssessment(value: unknown, profileId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const assessment: Record<string, unknown> = { ...(value as Record<string, unknown>), profileId };
  delete assessment.accessCode;
  return assessment;
}

export async function POST(request: NextRequest) {
  let payload: ProfilePayload;

  try {
    payload = (await request.json()) as ProfilePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const profileId = cleanMigrationProfileId(payload.profileId);
  const accessCode = cleanMigrationAccessCode(payload.accessCode);
  const assessment = sanitizedAssessment(payload.assessment, profileId);

  if (!isValidMigrationProfileId(profileId) || !isValidMigrationAccessCode(accessCode) || !assessment) {
    return NextResponse.json(
      { ok: false, error: "Profile ID, access code, and assessment are required." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: true, backend: "local" });
  }

  const accessCodeHash = hashMigrationAccessCode(profileId, accessCode);
  const { data: existing, error: lookupError } = await supabase
    .from("migration_portal_profiles")
    .select("access_code_hash")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (lookupError) {
    if (isMissingMigrationPortalProfilesTable(lookupError)) {
      return NextResponse.json({ ok: true, backend: "local" });
    }

    return NextResponse.json(
      { ok: false, error: lookupError.message ?? "Unable to check Migration Profile." },
      { status: 500 },
    );
  }

  if (existing?.access_code_hash && existing.access_code_hash !== accessCodeHash) {
    return NextResponse.json({ ok: false, error: "Invalid profile credentials." }, { status: 403 });
  }

  const { error } = await supabase.from("migration_portal_profiles").upsert(
    {
      profile_id: profileId,
      access_code_hash: accessCodeHash,
      payload: assessment,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" },
  );

  if (error) {
    if (isMissingMigrationPortalProfilesTable(error)) {
      return NextResponse.json({ ok: true, backend: "local" });
    }

    return NextResponse.json(
      { ok: false, error: error.message ?? "Unable to save Migration Profile." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, backend: "supabase" });
}

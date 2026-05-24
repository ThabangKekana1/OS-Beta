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

type StatusPayload = {
  profileId?: unknown;
  accessCode?: unknown;
};

type AdminDocumentSummary = {
  id: string;
  title: string;
  status: string;
  uploadedByType: string;
  fileName: string | null;
  createdAt: string | null;
};

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function stringFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function migrationStatusFromAdminStage(stage: string, documents: AdminDocumentSummary[]) {
  if (stage === "Disqualified") return "declined";
  if (stage === "Onboarding Complete") return "approved";
  if (stage === "Term Sheet Uploaded") return "term_sheet_pending";
  if (stage === "Compliance Pack Uploaded") return "proposal_ready";
  if (stage === "Utility Bills Uploaded") return "utility_profile_uploaded";

  const searchableDocs = documents.map((doc) => `${doc.title} ${doc.fileName ?? ""}`.toLowerCase());
  const hasSignedEoi = searchableDocs.some((value) => value.includes("signed expression of interest") || value.includes("signed eoi"));
  const hasUtilityBill = searchableDocs.some((value) => value.includes("utility") || value.includes("electricity"));

  if (hasSignedEoi && hasUtilityBill) return "utility_profile_uploaded";
  return "registered";
}

export async function POST(request: NextRequest) {
  let payload: StatusPayload;

  try {
    payload = (await request.json()) as StatusPayload;
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
    scope: "migration-profile-status",
    key: `${requestIp(request)}:${profileId}`,
    limit: 60,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many status checks. Try again later." },
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

  const { data: profile, error: profileError } = await supabase
    .from("migration_portal_profiles")
    .select("profile_id, access_code_hash, payload")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (profileError) {
    if (isMissingMigrationPortalProfilesTable(profileError)) {
      return NextResponse.json(
        { ok: false, error: "Remote Migration Profiles are not available yet." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { ok: false, error: profileError.message ?? "Unable to load Migration Profile." },
      { status: 500 },
    );
  }

  if (!profile) {
    return NextResponse.json({ ok: false, error: "Migration Profile not found." }, { status: 404 });
  }

  if (profile.access_code_hash !== hashMigrationAccessCode(profileId, accessCode)) {
    return NextResponse.json({ ok: false, error: "Incorrect access code." }, { status: 403 });
  }

  const profilePayload =
    profile.payload && typeof profile.payload === "object" && !Array.isArray(profile.payload)
      ? (profile.payload as Record<string, unknown>)
      : null;
  const registration =
    profilePayload?.registration &&
    typeof profilePayload.registration === "object" &&
    !Array.isArray(profilePayload.registration)
      ? (profilePayload.registration as Record<string, unknown>)
      : null;
  const leadId = registration ? stringFromRecord(registration, "leadId") : null;
  const clientProfileId = registration ? stringFromRecord(registration, "clientProfileId") : null;

  if (!leadId && !clientProfileId) {
    return NextResponse.json({ ok: true, linked: false, status: null });
  }

  const leadQuery = supabase
    .from("oneos_admin_leads")
    .select("id, client_profile_id, stage, readiness_score, payload")
    .limit(1);
  const { data: leadRows, error: leadError } = leadId
    ? await leadQuery.eq("id", leadId)
    : await leadQuery.eq("client_profile_id", clientProfileId);

  if (leadError) {
    return NextResponse.json(
      { ok: false, error: leadError.message ?? "Unable to load admin profile status." },
      { status: 500 },
    );
  }

  const lead = leadRows?.[0] ?? null;
  if (!lead) {
    return NextResponse.json({ ok: true, linked: false, status: null });
  }

  if (clientProfileId && lead.client_profile_id !== clientProfileId) {
    return NextResponse.json({ ok: true, linked: false, status: null });
  }

  const { data: documentRows, error: documentError } = await supabase
    .from("oneos_client_documents")
    .select("id, title, status, uploaded_by_type, file_name, created_at")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (documentError) {
    return NextResponse.json(
      { ok: false, error: documentError.message ?? "Unable to load admin profile documents." },
      { status: 500 },
    );
  }

  const documents: AdminDocumentSummary[] = (documentRows ?? []).map((document) => ({
    id: String(document.id),
    title: String(document.title ?? "Document"),
    status: String(document.status ?? "received"),
    uploadedByType: String(document.uploaded_by_type ?? "Client"),
    fileName: typeof document.file_name === "string" ? document.file_name : null,
    createdAt: typeof document.created_at === "string" ? document.created_at : null,
  }));
  const adminPayload =
    lead.payload && typeof lead.payload === "object" && !Array.isArray(lead.payload)
      ? (lead.payload as Record<string, unknown>)
      : null;
  const nextAction = adminPayload ? stringFromRecord(adminPayload, "nextAction") : null;
  const stage = String(lead.stage ?? "Client Registered");
  const migrationStatus = migrationStatusFromAdminStage(stage, documents);

  return NextResponse.json({
    ok: true,
    linked: true,
    status: {
      leadId: lead.id,
      clientProfileId: lead.client_profile_id,
      adminStage: stage,
      migrationStatus,
      readinessScore: Number(lead.readiness_score ?? 0),
      nextAction,
      utilityProfileComplete: migrationStatus !== "registered",
      documents,
    },
  });
}

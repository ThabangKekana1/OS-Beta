import {
  cleanMigrationAccessCode,
  cleanMigrationProfileId,
  hashMigrationAccessCode,
  isMissingMigrationPortalProfilesTable,
  isValidMigrationAccessCode,
  isValidMigrationProfileId,
} from "@/lib/migration-profile-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { consumeRateLimit } from "@/lib/rate-limit";

/**
 * Shared auth + linked-lead loader for the client-facing proposal routes.
 * Mirrors the /api/migration/profiles/status contract exactly: profileId +
 * 4-digit access code (hashed), then the lead linked through the portal
 * profile's registration payload.
 */

export type MigrationLinkedLead = {
  id: string;
  clientProfileId: string;
  stage: string;
  company: string;
  contactName: string;
  siteCity: string | null;
  province: string | null;
  utilityProvider: string | null;
  monthlySpend: number;
  monthlyKwh: number | null;
  eoiSigningToken: string | null;
  payload: Record<string, unknown> | null;
  documents: Array<{
    id: string;
    title: string;
    fileType: string | null;
    storagePath: string | null;
    fileName: string | null;
    contentType: string | null;
    utilityBillAnalysis: unknown;
  }>;
};

export type MigrationProfileLeadResult =
  | { ok: false; status: number; error: string }
  | { ok: true; profileId: string; lead: MigrationLinkedLead };

function stringFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function authenticateMigrationProfileLead(payload: {
  profileId?: unknown;
  accessCode?: unknown;
}): Promise<MigrationProfileLeadResult> {
  const profileId = cleanMigrationProfileId(payload.profileId);
  const accessCode = cleanMigrationAccessCode(payload.accessCode);

  if (!isValidMigrationProfileId(profileId) || !isValidMigrationAccessCode(accessCode)) {
    return { ok: false, status: 400, error: "Enter a valid Profile ID and 4-digit access code." };
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { ok: false, status: 503, error: "Remote Migration Profiles are not configured." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("migration_portal_profiles")
    .select("profile_id, access_code_hash, payload")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (profileError) {
    if (isMissingMigrationPortalProfilesTable(profileError)) {
      return { ok: false, status: 503, error: "Remote Migration Profiles are not available yet." };
    }
    return {
      ok: false,
      status: 500,
      error: profileError.message ?? "Unable to load Migration Profile.",
    };
  }

  if (!profile) {
    return { ok: false, status: 404, error: "Migration Profile not found." };
  }

  if (profile.access_code_hash !== hashMigrationAccessCode(profileId, accessCode)) {
    // Strict budget for FAILED codes only — a 4-digit code must not be
    // brute-forceable. Keyed by profile so it holds across attacker IPs.
    const failLimit = await consumeRateLimit({
      scope: "migration-profile-code-fail",
      key: `lead-auth:${profileId}`,
      limit: 8,
      windowSeconds: 15 * 60,
    });
    if (!failLimit.allowed) {
      return { ok: false, status: 429, error: "Too many incorrect codes. Try again in 15 minutes." };
    }
    return { ok: false, status: 403, error: "Incorrect access code." };
  }

  const profilePayload = asRecord(profile.payload);
  const registration = profilePayload ? asRecord(profilePayload.registration) : null;
  const leadId = registration ? stringFromRecord(registration, "leadId") : null;
  const clientProfileId = registration ? stringFromRecord(registration, "clientProfileId") : null;

  if (!leadId && !clientProfileId) {
    return { ok: false, status: 404, error: "No linked client profile yet." };
  }

  const leadQuery = supabase
    .from("oneos_admin_leads")
    // Only real columns — company/contact/spend live inside the payload jsonb.
    .select("id, client_profile_id, stage, eoi_signing_token, payload")
    .limit(1);
  const { data: leadRows, error: leadError } = leadId
    ? await leadQuery.eq("id", leadId)
    : await leadQuery.eq("client_profile_id", clientProfileId);

  if (leadError) {
    return {
      ok: false,
      status: 500,
      error: leadError.message ?? "Unable to load the linked client profile.",
    };
  }

  const lead = leadRows?.[0] ?? null;
  if (!lead || (clientProfileId && lead.client_profile_id !== clientProfileId)) {
    return { ok: false, status: 404, error: "No linked client profile yet." };
  }

  const { data: documentRows, error: documentError } = await supabase
    .from("oneos_client_documents")
    .select("id, title, file_type, storage_path, file_name, content_type, payload")
    .eq("lead_id", lead.id)
    .limit(500);

  if (documentError) {
    return {
      ok: false,
      status: 500,
      error: documentError.message ?? "Unable to load the client documents.",
    };
  }

  const adminPayload = asRecord(lead.payload);
  const assessmentSummary = adminPayload ? asRecord(adminPayload.migrationAssessment) : null;
  const siteCity =
    (registration ? stringFromRecord(registration, "siteCity") : null)
    ?? (adminPayload ? stringFromRecord(adminPayload, "city") : null);
  const province =
    (registration ? stringFromRecord(registration, "province") : null)
    ?? (adminPayload ? stringFromRecord(adminPayload, "province") : null);
  const utilityProvider =
    (registration ? stringFromRecord(registration, "utilityProvider") : null)
    ?? (assessmentSummary ? stringFromRecord(assessmentSummary, "utilityProvider") : null);
  const monthlySpend =
    (adminPayload && numberFromRecord(adminPayload, "monthlyElectricitySpendEstimateZar")) ??
    (assessmentSummary && numberFromRecord(assessmentSummary, "monthlySpend")) ??
    0;
  const monthlyKwh = assessmentSummary ? numberFromRecord(assessmentSummary, "monthlyKwh") : null;

  return {
    ok: true,
    profileId,
    lead: {
      id: String(lead.id),
      clientProfileId: String(lead.client_profile_id ?? ""),
      stage: String(lead.stage ?? "Client Registered"),
      company: (adminPayload ? stringFromRecord(adminPayload, "company") : null) || "Client",
      contactName: (adminPayload ? stringFromRecord(adminPayload, "contactName") : null) || "",
      siteCity,
      province,
      utilityProvider,
      monthlySpend,
      monthlyKwh,
      eoiSigningToken:
        (typeof lead.eoi_signing_token === "string" && lead.eoi_signing_token.trim()
          ? lead.eoi_signing_token.trim()
          : null)
        ?? (adminPayload ? stringFromRecord(adminPayload, "eoiSigningToken") : null),
      payload: adminPayload,
      documents: (documentRows ?? []).map((document) => ({
        id: String(document.id),
        title: String(document.title ?? "Document"),
        fileType: typeof document.file_type === "string" ? document.file_type : null,
        storagePath: typeof document.storage_path === "string" ? document.storage_path : null,
        fileName: typeof document.file_name === "string" ? document.file_name : null,
        contentType: typeof document.content_type === "string" ? document.content_type : null,
        utilityBillAnalysis:
          document.payload && typeof document.payload === "object" && !Array.isArray(document.payload)
            ? (document.payload as Record<string, unknown>).utilityBillAnalysis ?? null
            : null,
      })),
    },
  };
}

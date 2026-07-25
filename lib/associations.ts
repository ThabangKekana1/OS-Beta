import crypto from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Association partner channel.
 *
 * Each association gets a referral code. Members enter through
 * /estimate/a/[code] (attribution captured), and the association views its
 * pipeline (member name + stage only — POPIA-minimised) and commission ledger
 * at /partners/[code]?k=[portalKey]. The portal key is deterministic (HMAC of
 * the referral code), so no extra secret storage is needed.
 */

export type AssociationSummary = {
  id: string;
  name: string;
  sector: string | null;
  referralCode: string;
  commissionModel: string;
  commissionValue: number;
  status: "active" | "paused" | "ended";
};

export type AssociationReferralRow = {
  id: string;
  createdAt: string;
  memberBusinessName: string | null;
  stageAtReferral: string | null;
  commissionDue: number | null;
  commissionPaidAt: string | null;
};

function portalSecret() {
  return (
    process.env.ASSOCIATION_PORTAL_SECRET ??
    process.env.MIGRATION_ACCESS_CODE_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "foundation1-partners-local"
  );
}

export function portalKeyForCode(referralCode: string) {
  return crypto
    .createHmac("sha256", portalSecret())
    .update(`partners:${referralCode.toUpperCase()}`)
    .digest("base64url")
    .slice(0, 20);
}

export function cleanReferralCode(value: unknown) {
  return typeof value === "string"
    ? value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24)
    : "";
}

export function isMissingAssociationTables(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("associations") || message.includes("association_referrals");
}

export async function findAssociationByCode(code: string): Promise<AssociationSummary | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("associations")
    .select("id, name, sector, referral_code, commission_model, commission_value, status")
    .eq("referral_code", code.toUpperCase())
    .limit(1);
  if (error || !data?.[0]) return null;
  const row = data[0];
  return {
    id: String(row.id),
    name: String(row.name),
    sector: typeof row.sector === "string" ? row.sector : null,
    referralCode: String(row.referral_code),
    commissionModel: String(row.commission_model ?? "per_deal_flat"),
    commissionValue: Number(row.commission_value ?? 0),
    status: (row.status as AssociationSummary["status"]) ?? "active",
  };
}

export async function listAssociationReferrals(
  associationId: string,
): Promise<AssociationReferralRow[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("association_referrals")
    .select("id, created_at, member_business_name, stage_at_referral, commission_due, commission_paid_at")
    .eq("association_id", associationId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data) return [];
  return data.map((row) => ({
    id: String(row.id),
    createdAt: String(row.created_at),
    memberBusinessName: typeof row.member_business_name === "string" ? row.member_business_name : null,
    stageAtReferral: typeof row.stage_at_referral === "string" ? row.stage_at_referral : null,
    commissionDue: row.commission_due === null ? null : Number(row.commission_due),
    commissionPaidAt: typeof row.commission_paid_at === "string" ? row.commission_paid_at : null,
  }));
}

export async function recordAssociationReferral(options: {
  associationId: string;
  assessmentId?: string;
  memberBusinessName?: string;
  stage?: string;
  commissionDue?: number;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  await supabase.from("association_referrals").insert({
    association_id: options.associationId,
    assessment_id: options.assessmentId ?? null,
    member_business_name: options.memberBusinessName ?? null,
    stage_at_referral: options.stage ?? "estimate",
    commission_due: options.commissionDue ?? null,
  });
}

export async function createAssociation(options: {
  name: string;
  sector?: string;
  contactName?: string;
  contactEmail?: string;
  referralCode: string;
  commissionModel?: string;
  commissionValue?: number;
}): Promise<AssociationSummary | { error: string }> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const { data, error } = await supabase
    .from("associations")
    .insert({
      name: options.name,
      sector: options.sector ?? null,
      contact_name: options.contactName ?? null,
      contact_email: options.contactEmail ?? null,
      referral_code: options.referralCode.toUpperCase(),
      commission_model: options.commissionModel ?? "per_deal_flat",
      commission_value: options.commissionValue ?? 0,
    })
    .select("id, name, sector, referral_code, commission_model, commission_value, status")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create the association." };
  return {
    id: String(data.id),
    name: String(data.name),
    sector: typeof data.sector === "string" ? data.sector : null,
    referralCode: String(data.referral_code),
    commissionModel: String(data.commission_model ?? "per_deal_flat"),
    commissionValue: Number(data.commission_value ?? 0),
    status: (data.status as AssociationSummary["status"]) ?? "active",
  };
}

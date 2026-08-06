import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/** Member-facing identity for a co-branded partner journey. Never carries commercial terms. */
export type PartnerBrand = {
  code: string;
  name: string;
  shortName: string;
  tagline: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
};

const BRAND_COLUMNS =
  "referral_code,name,brand_display_name,brand_short_name,brand_logo_url,brand_tagline,brand_enabled,website,status,onboarding_status";

type BrandRow = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toBrand(row: BrandRow | null): PartnerBrand | null {
  if (!row || row.brand_enabled !== true) return null;
  if (row.status !== "active" || row.onboarding_status !== "active") return null;
  const code = text(row.referral_code);
  const name = text(row.brand_display_name) ?? text(row.name);
  if (!code || !name) return null;
  return {
    code: code.toUpperCase(),
    name,
    shortName: text(row.brand_short_name) ?? code.toUpperCase(),
    tagline: text(row.brand_tagline),
    logoUrl: text(row.brand_logo_url),
    websiteUrl: text(row.website),
  };
}

/** Brands may be absent on databases that predate the co-branding migration. */
function isMissingBrandColumns(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || /brand_(enabled|display_name)/i.test(error?.message ?? "");
}

export async function getPartnerBrandByCode(referralCode: string): Promise<PartnerBrand | null> {
  const code = referralCode.trim().toUpperCase();
  if (!code) return null;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("associations")
    .select(BRAND_COLUMNS)
    .eq("referral_code", code)
    .maybeSingle();
  if (error) {
    if (isMissingBrandColumns(error)) return null;
    throw new Error(error.message);
  }
  return toBrand(data as BrandRow | null);
}

export async function getPartnerBrandByAssociationId(id: string): Promise<PartnerBrand | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("associations")
    .select(BRAND_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingBrandColumns(error)) return null;
    throw new Error(error.message);
  }
  return toBrand(data as BrandRow | null);
}

/** Re-reads a stored snapshot without trusting its shape. */
export function parsePartnerBrandSnapshot(value: unknown): PartnerBrand | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const code = text(row.code);
  const name = text(row.name);
  if (!code || !name) return null;
  return {
    code: code.toUpperCase(),
    name,
    shortName: text(row.shortName) ?? code.toUpperCase(),
    tagline: text(row.tagline),
    logoUrl: text(row.logoUrl),
    websiteUrl: text(row.websiteUrl),
  };
}

import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function cleanSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "")
    .slice(0, 60);
}

/**
 * GET /api/migration/profiles/slug/[slug]
 * Resolves a vanity login slug (e.g. "metasapien") to its migration profile ID.
 * Returns only the profile ID — unlocking still requires the 4-digit access
 * code on the dashboard, so this endpoint exposes no secret material.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await params;
  const slug = cleanSlug(rawSlug ?? "");
  if (!slug || slug.length < 2) {
    return NextResponse.json({ ok: false, error: "Invalid profile link." }, { status: 400 });
  }

  const limit = await consumeRateLimit({
    scope: "profile-slug-lookup",
    key: requestIp(request),
    limit: 60,
    windowSeconds: 60 * 10,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Profile store unavailable." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("migration_portal_profiles")
    .select("profile_id")
    .eq("payload->>slug", slug)
    .limit(1);

  if (error) {
    return NextResponse.json({ ok: false, error: "Profile lookup failed." }, { status: 500 });
  }
  if (!data?.[0]?.profile_id) {
    return NextResponse.json({ ok: false, error: "Profile link not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, profileId: String(data[0].profile_id) });
}

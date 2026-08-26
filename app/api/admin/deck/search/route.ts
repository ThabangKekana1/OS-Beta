/**
 * Dossier search (⌘K / Dossiers): one query across the sales book and the
 * platform's people. Bounded, business-data only.
 */
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ ok: true, hits: [] });
  }
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Store unavailable." }, { status: 503 });
  }
  const needle = `%${query}%`;

  const [bookRes, casesRes] = await Promise.all([
    admin
      .from("foundation1_sales_book")
      .select("book_id,company_name,sector,town")
      .or(`company_name.ilike.${needle},town.ilike.${needle},sub_sector.ilike.${needle}`)
      .limit(8),
    admin
      .from("migration_cases")
      .select("id,case_reference,business_name")
      .or(`case_reference.ilike.${needle},business_name.ilike.${needle}`)
      .limit(5),
  ]);
  if (bookRes.error || casesRes.error) {
    return NextResponse.json(
      { ok: false, error: bookRes.error?.message ?? casesRes.error?.message ?? "Search failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    hits: [
      ...(bookRes.data ?? []).map((row) => ({
        kind: "book" as const,
        key: row.book_id as string,
        label: `${row.company_name} · ${[row.sector, row.town].filter(Boolean).join(" · ")}`,
      })),
      ...(casesRes.data ?? []).map((row) => ({
        kind: "case" as const,
        key: row.id as string,
        label: `${row.business_name ?? "Case"} · ${row.case_reference ?? ""}`.trim(),
        // Route groups never appear in URLs: legacy case pages keep their paths.
        href: `/admin/migration-cases/${row.id}`,
      })),
    ],
  });
}

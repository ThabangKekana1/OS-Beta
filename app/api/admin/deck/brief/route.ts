/**
 * Briefs (doc 21): the Monday/Friday rhythm rendered as living documents.
 * One read: the assembled weekly brief (doc 15 cadence), funnel conversion
 * rates with honest denominators, and what MI changed about itself.
 */
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { computeDealBook } from "@/lib/harness/dealbook";
import { buildConversionInsights, readFunnelSlices } from "@/lib/harness/outcomes";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Store unavailable." }, { status: 503 });
  }

  const [weekly, book, slices, decisions] = await Promise.all([
    import("@/lib/intelligence/learning-store")
      .then(({ assembleWeeklyBrief }) => assembleWeeklyBrief())
      .catch(() => null),
    computeDealBook(),
    readFunnelSlices().catch(() => []),
    (async () => {
      const { data, error } = await admin
        .from("foundation1_improvement_decisions")
        .select("id,summary,reason,created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw new Error(error.message);
      return data ?? [];
    })(),
  ]);

  const insights = await buildConversionInsights(slices);

  return NextResponse.json({
    ok: true,
    weeklyMarkdown: weekly?.markdown ?? "",
    dealBook: book,
    insights,
    decisions: decisions.map((row) => ({
      id: row.id as string,
      summary: row.summary as string | null,
      reason: row.reason as string | null,
      createdAt: row.created_at as string,
    })),
  });
}

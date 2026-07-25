import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { reauditMigrationBillPack, reopenMigrationBillPack } from "@/lib/migration-case-bill-pack";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { MigrationCaseRow } from "@/lib/migration-case-store";

export const runtime = "nodejs";

/**
 * Unsticks a case sitting in bill_pack_review.
 *
 * Before this existed the stage had no exit: no route and no button could move
 * a case out of review, so a pack that failed recognition was stranded until
 * the client happened to re-upload an entire replacement set.
 *
 *   rerun   — re-run the audit over the stored files. Use after a tariff
 *             catalogue fix or parser improvement; nothing is re-uploaded.
 *   reopen  — hand the pack back to the client so they can add or replace
 *             files, and tell them what is needed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  const { id } = await params;
  let payload: { action?: unknown; note?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const action = typeof payload.action === "string" ? payload.action : "";
  if (action !== "rerun" && action !== "reopen") {
    return NextResponse.json(
      { ok: false, error: "Action must be 'rerun' or 'reopen'." },
      { status: 400 },
    );
  }
  const note = typeof payload.note === "string"
    ? payload.note.trim().replace(/\s+/g, " ").slice(0, 500)
    : "";

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Storage unavailable." }, { status: 503 });
  }
  const { data, error } = await supabase
    .from("migration_cases")
    .select("*")
    .eq("id", id)
    .limit(1);
  if (error || !data?.[0]) {
    return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
  }
  const caseRow = data[0] as MigrationCaseRow;

  try {
    if (action === "rerun") {
      const result = await reauditMigrationBillPack(caseRow, session.email ?? "admin");
      return NextResponse.json({
        ok: true,
        action,
        stage: result.caseRow.stage,
        proposalCompleted: Boolean(result.proposal),
        recognisedPeriods: result.billPack.recognised_period_count,
        blockers: result.billPack.blockers,
      });
    }

    const progress = await reopenMigrationBillPack(caseRow, session.email ?? "admin", note);
    return NextResponse.json({ ok: true, action, progress });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to update the bill pack.";
    const clientError = /no stored files|not in review|locked/i.test(message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: clientError ? 409 : 500 },
    );
  }
}

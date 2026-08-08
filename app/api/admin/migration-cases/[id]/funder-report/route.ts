/**
 * Admin funder-report API — the operator confirm screen's backend.
 *
 * GET   -> current funder report for the case (INTERNAL object: extracted
 *          fields with per-field confidence, cross-check deviations, hold
 *          reasons) so the operator can review what the machine read.
 * POST  -> { action: "generate" }                     re-run the pipeline
 *          { action: "confirm", corrections?, note? } operator confirms the
 *          extractions (optionally corrected) and forces publication
 *          through the existing assessment seam.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import type { FunderReportCorrections } from "@/lib/funder-report";
import {
  confirmFunderReport,
  getStoredFunderReport,
  runFunderReportPipeline,
} from "@/lib/funder-report-pipeline";
import { type MigrationCaseRow } from "@/lib/migration-case-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const CORRECTION_FIELDS: ReadonlyArray<keyof FunderReportCorrections> = [
  "ufmsMonthlyCharge",
  "ufmsEscalationPct",
  "ufmsTermYears",
  "pvKwp",
  "bessKwh",
  "monthlyGenerationKwh",
  "wheelingRatePerKwh",
  "wheelingEscalationPct",
  "wheelingTermYears",
];

function parseCorrections(raw: unknown): FunderReportCorrections | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const corrections: FunderReportCorrections = {};
  for (const field of CORRECTION_FIELDS) {
    const value = Number(record[field]);
    if (record[field] !== undefined && Number.isFinite(value) && value > 0) {
      corrections[field] = value;
    }
  }
  return Object.keys(corrections).length > 0 ? corrections : null;
}

async function loadCase(id: string): Promise<MigrationCaseRow | null> {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin configuration is unavailable.");
  const { data, error } = await client
    .from("migration_cases")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as MigrationCaseRow | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  const { id } = await params;
  try {
    const caseRow = await loadCase(id);
    if (!caseRow) return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    const report = await getStoredFunderReport(caseRow);
    if (!report) {
      return NextResponse.json({ ok: true, report: null, message: "No funder report generated for this case yet." });
    }
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load the funder report." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Send a JSON body." }, { status: 400 });
  }
  const action = body.action === "confirm" ? "confirm" : "generate";
  const actor = session.email ?? session.name ?? "admin";

  try {
    const caseRow = await loadCase(id);
    if (!caseRow) return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });

    const result = action === "confirm"
      ? await confirmFunderReport({
          caseRow,
          corrections: parseCorrections(body.corrections),
          confirmedBy: actor,
        })
      : await runFunderReportPipeline({ caseRow, triggeredBy: actor });

    return NextResponse.json({
      ok: true,
      status: result.report.status,
      published: result.published,
      holdReasons: result.report.holdReasons,
      crosschecks: result.report.crosschecks,
      skipped: result.skipped,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Funder report pipeline failed." },
      { status: 500 },
    );
  }
}

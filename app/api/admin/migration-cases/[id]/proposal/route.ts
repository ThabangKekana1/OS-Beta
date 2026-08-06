import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import {
  MAX_OPERATOR_PROPOSAL_BYTES,
  publishOperatorProposal,
} from "@/lib/migration-case-operator-proposal";
import type { MigrationCaseRow } from "@/lib/migration-case-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function money(form: FormData, key: string) {
  const raw = form.get(key);
  const parsed = Number(typeof raw === "string" ? raw.replace(/[^\d.-]/g, "") : NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Phase 1: the assessment is produced off-platform. This publishes it to the
 * client, advances the case and sends the notification in one action.
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
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read the upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ ok: false, error: "Choose the assessment PDF." }, { status: 400 });
  }
  if (file.size > MAX_OPERATOR_PROPOSAL_BYTES) {
    return NextResponse.json({ ok: false, error: "The assessment must be 25MB or smaller." }, { status: 413 });
  }
  if (file.type !== "application/pdf" && file.name.split(".").pop()?.toLowerCase() !== "pdf") {
    return NextResponse.json({ ok: false, error: "Upload the assessment as a PDF." }, { status: 400 });
  }

  const yearOneMonthlyDifference = money(form, "yearOneMonthlyDifference");
  const tenYearDifference = money(form, "tenYearDifference");
  const currentMonthlyCostExVat = money(form, "currentMonthlyCostExVat");
  const solutionMonthlyCostExVat = money(form, "solutionMonthlyCostExVat");
  if (
    yearOneMonthlyDifference === null
    || tenYearDifference === null
    || currentMonthlyCostExVat === null
    || solutionMonthlyCostExVat === null
  ) {
    return NextResponse.json(
      { ok: false, error: "Enter the current monthly cost, solution monthly cost, year-one movement and ten-year movement." },
      { status: 400 },
    );
  }
  if (currentMonthlyCostExVat <= 0 || solutionMonthlyCostExVat <= 0) {
    return NextResponse.json(
      { ok: false, error: "The monthly costs must both be above zero." },
      { status: 400 },
    );
  }

  const note = form.get("note");
  const tariffProvider = form.get("tariffProvider");
  const tariffNames = form.get("tariffNames");

  try {
    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase admin configuration is unavailable.");
    const { data, error } = await client
      .from("migration_cases")
      .select("*")
      .eq("id", id)
      .limit(1);
    if (error || !data?.[0]) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }

    const result = await publishOperatorProposal({
      caseRow: data[0] as MigrationCaseRow,
      file: {
        name: file.name,
        type: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
      yearOneMonthlyDifference,
      tenYearDifference,
      currentMonthlyCostExVat,
      solutionMonthlyCostExVat,
      tariffProvider: typeof tariffProvider === "string" ? tariffProvider.trim() || null : null,
      tariffNames: typeof tariffNames === "string" && tariffNames.trim()
        ? tariffNames.split(",").map((name) => name.trim()).filter(Boolean).slice(0, 6)
        : [],
      billingPeriods: money(form, "billingPeriods"),
      coveredDays: money(form, "coveredDays"),
      note: typeof note === "string" ? note : null,
      publishedBy: session.email,
    });

    return NextResponse.json({
      ok: true,
      stage: result.caseRow.stage,
      economicallyPositive: result.economicallyPositive,
      proposalId: result.proposal.id,
    });
  } catch (caught) {
    return NextResponse.json(
      { ok: false, error: caught instanceof Error ? caught.message : "Could not publish the assessment." },
      { status: 500 },
    );
  }
}

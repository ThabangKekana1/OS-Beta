import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { listDocumentSignaturesForCases } from "@/lib/document-signing-store";
import {
  getMigrationCaseRelations,
  recordMigrationCaseEvent,
  updateMigrationCase,
  type MigrationCaseRow,
} from "@/lib/migration-case-store";
import {
  buildSubmissionManifest,
  classifySubmissionReadiness,
  FUNDER_SLA_DAYS,
  nextBatchReference,
  renderManifestText,
  type ManifestEntryInput,
  type SubmissionManifest,
} from "@/lib/submission-queue";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const CHANNELS = new Set(["eden_ufms", "awaken_wheeling", "both"]);
const MAX_BATCH_SIZE = 25;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

/**
 * The submission drum (doc 06 §3.2): marks a selected set of bankable cases
 * as submitted to the funder in one numbered batch. Every case receives the
 * same manifest artefact (JSON on the submission row, text downloadable),
 * the same batch reference, and its own SLA clock. The Bankable-Pack Rule is
 * enforced per case; cases that fail it are reported back, never submitted.
 */
export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  let payload: { caseIds?: unknown; channel?: unknown; slaDays?: unknown; notes?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const caseIds = Array.isArray(payload.caseIds)
    ? [...new Set(payload.caseIds.filter((value): value is string => typeof value === "string" && value.length > 0))]
    : [];
  if (!caseIds.length) {
    return NextResponse.json({ ok: false, error: "Select at least one case for the batch." }, { status: 400 });
  }
  if (caseIds.length > MAX_BATCH_SIZE) {
    return NextResponse.json({ ok: false, error: `A batch holds at most ${MAX_BATCH_SIZE} cases.` }, { status: 400 });
  }
  const channel = cleanText(payload.channel, 40) || "eden_ufms";
  if (!CHANNELS.has(channel)) {
    return NextResponse.json({ ok: false, error: "Choose the submission channel: Eden/UFMS, Awaken wheeling, or both." }, { status: 400 });
  }
  const slaDaysValue = Number(payload.slaDays);
  const slaDays = Number.isInteger(slaDaysValue) && slaDaysValue >= 1 && slaDaysValue <= 60
    ? slaDaysValue
    : FUNDER_SLA_DAYS;
  const notes = cleanText(payload.notes, 1_000) || null;

  try {
    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase admin configuration is unavailable.");

    const { data: caseRows, error: casesError } = await client
      .from("migration_cases")
      .select("*")
      .in("id", caseIds);
    if (casesError) throw new Error(casesError.message);
    const casesById = new Map((caseRows ?? []).map((row) => [row.id as string, row as MigrationCaseRow]));

    const signatures = await listDocumentSignaturesForCases(caseIds).catch(() => []);
    const signedProposalAt = new Map<string, string>();
    for (const signature of signatures) {
      if (signature.status === "submitted_by_client" && !signedProposalAt.has(signature.case_id)) {
        signedProposalAt.set(signature.case_id, signature.submitted_at ?? signature.signed_at ?? signature.updated_at);
      }
    }

    const failures: { caseId: string; reference: string | null; reason: string }[] = [];
    const accepted: { caseRow: MigrationCaseRow; entry: ManifestEntryInput }[] = [];

    for (const caseId of caseIds) {
      const caseRow = casesById.get(caseId);
      if (!caseRow) {
        failures.push({ caseId, reference: null, reason: "Migration case not found." });
        continue;
      }
      if (caseRow.submitted_to_funder_at && caseRow.active_submission_id) {
        failures.push({ caseId, reference: caseRow.public_reference, reason: "A funder submission is already recorded." });
        continue;
      }
      const relations = await getMigrationCaseRelations(caseRow);
      const readiness = classifySubmissionReadiness({
        stage: caseRow.stage,
        eoiSignedAt: caseRow.eoi_signed_at,
        kycReadinessConfirmedAt: caseRow.kyc_readiness_confirmed_at,
        readinessParked: relations.kycReadiness?.status === "parked",
        signedFunderProposalAt: signedProposalAt.get(caseId) ?? null,
        submittedToFunderAt: caseRow.submitted_to_funder_at,
        hasBillPack: Boolean(caseRow.active_bill_pack_id),
        hasProposal: Boolean(caseRow.active_proposal_id),
      });
      if (readiness.tier === "blocked") {
        failures.push({ caseId, reference: caseRow.public_reference, reason: readiness.blockedReason });
        continue;
      }
      if (!caseRow.eoi_signed_at) {
        failures.push({ caseId, reference: caseRow.public_reference, reason: "Bankable-Pack Rule: the non-binding EOI must be signed before submission." });
        continue;
      }
      accepted.push({
        caseRow,
        entry: {
          caseId: caseRow.id,
          reference: caseRow.public_reference,
          businessName: caseRow.business_name,
          siteCity: caseRow.site_city,
          province: caseRow.province,
          channel: channel as ManifestEntryInput["channel"],
          eoiSignedAt: caseRow.eoi_signed_at,
          kycReadinessConfirmedAt: caseRow.kyc_readiness_confirmed_at,
          signedFunderProposalAt: signedProposalAt.get(caseId) ?? null,
          recognisedBillingPeriods: relations.billPack?.recognised_period_count ?? null,
          coveredDays: relations.billPack?.covered_days ?? null,
        },
      });
    }

    if (!accepted.length) {
      return NextResponse.json(
        { ok: false, error: "No selected case passed the Bankable-Pack Rule.", failures },
        { status: 409 },
      );
    }

    // Number the batch after any references already issued today.
    const now = new Date();
    const submittedAt = now.toISOString();
    const stamp = submittedAt.slice(0, 10).replace(/-/g, "");
    const { data: existing } = await client
      .from("migration_case_submissions")
      .select("batch_reference")
      .like("batch_reference", `F1-SUB-${stamp}-%`);
    const batchReference = nextBatchReference(
      now,
      (existing ?? []).map((row) => row.batch_reference as string).filter(Boolean),
    );

    const manifest: SubmissionManifest = buildSubmissionManifest({
      batchReference,
      generatedAt: submittedAt,
      submittedBy: session.email ?? session.name ?? "admin",
      slaDays,
      entries: accepted.map((item) => item.entry),
    });

    const submitted: { caseId: string; reference: string; submissionId: string }[] = [];
    for (const { caseRow } of accepted) {
      const line = manifest.entries.find((entry) => entry.caseId === caseRow.id)?.line ?? null;
      const { data: submission, error: submissionError } = await client
        .from("migration_case_submissions")
        .insert({
          case_id: caseRow.id,
          channel,
          submitted_at: submittedAt,
          submitted_by: manifest.submittedBy,
          batch_reference: batchReference,
          manifest: { ...manifest, line },
          sla_days: slaDays,
          sla_due_at: manifest.slaDueAt,
          notes,
        })
        .select("id")
        .single();
      if (submissionError || !submission) {
        failures.push({ caseId: caseRow.id, reference: caseRow.public_reference, reason: submissionError?.message ?? "Unable to record the submission." });
        continue;
      }
      await updateMigrationCase(caseRow.id, {
        stage: "submitted_to_funder",
        active_submission_id: submission.id as string,
        submitted_to_funder_at: submittedAt,
        funder_sla_due_at: manifest.slaDueAt,
        funder_acknowledged_at: null,
      });
      await recordMigrationCaseEvent({
        caseId: caseRow.id,
        eventType: "submitted_to_funder",
        actorType: "operator",
        detail: `Bankable pack submitted in batch ${batchReference} (line ${line ?? "—"} of ${manifest.caseCount}). Response due within ${slaDays} days.`,
        metadata: { submissionId: submission.id, batchReference, line, channel, slaDueAt: manifest.slaDueAt },
      }).catch(() => undefined);
      submitted.push({ caseId: caseRow.id, reference: caseRow.public_reference, submissionId: submission.id as string });
    }

    return NextResponse.json({
      ok: true,
      batchReference,
      submittedAt,
      slaDueAt: manifest.slaDueAt,
      submitted,
      failures,
      manifest,
      manifestText: renderManifestText(manifest),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to run the submission batch." },
      { status: 500 },
    );
  }
}

/**
 * Downloads the manifest artefact for a recorded batch, rebuilt from the
 * stored submission rows. `?batch=F1-SUB-…&format=text|json`.
 */
export async function GET(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  const batchReference = cleanText(request.nextUrl.searchParams.get("batch"), 60);
  const format = cleanText(request.nextUrl.searchParams.get("format"), 10) || "text";
  if (!batchReference) {
    return NextResponse.json({ ok: false, error: "Name the batch reference." }, { status: 400 });
  }
  try {
    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase admin configuration is unavailable.");
    const { data, error } = await client
      .from("migration_case_submissions")
      .select("manifest")
      .eq("batch_reference", batchReference)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw new Error(error.message);
    const manifest = (data?.[0]?.manifest ?? null) as SubmissionManifest | null;
    if (!manifest || !Array.isArray(manifest.entries)) {
      return NextResponse.json({ ok: false, error: "No manifest is stored for that batch reference." }, { status: 404 });
    }
    if (format === "json") {
      return new NextResponse(JSON.stringify(manifest, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${batchReference}.json"`,
        },
      });
    }
    return new NextResponse(renderManifestText(manifest), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${batchReference}.txt"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load the manifest." },
      { status: 500 },
    );
  }
}

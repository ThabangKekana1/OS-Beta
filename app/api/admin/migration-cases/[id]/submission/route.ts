import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import {
  assessSubmissionKyc,
  evaluateKycGate,
  kycPlanFromStoredItems,
} from "@/lib/migration-case-kyc";
import {
  getMigrationCaseRelations,
  recordMigrationCaseEvent,
  updateMigrationCase,
  type MigrationCaseRow,
} from "@/lib/migration-case-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const CHANNELS = new Set(["eden_ufms", "awaken_wheeling", "both"]);
const DEFAULT_SLA_DAYS = 7;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

async function loadCase(id: string) {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin configuration is unavailable.");
  const { data, error } = await client
    .from("migration_cases")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { client, caseRow: data as MigrationCaseRow | null };
}

/**
 * Records a funder submission (the drum). Enforces the Bankable-Pack Rule:
 * nothing reaches the external channel without a signed EOI and a confirmed
 * KYC readiness attestation. Starts the SLA clock.
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
  let payload: {
    channel?: unknown;
    batchReference?: unknown;
    notes?: unknown;
    slaDays?: unknown;
    acknowledgeIncompleteKyc?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const channel = cleanText(payload.channel, 40);
  if (!CHANNELS.has(channel)) {
    return NextResponse.json({ ok: false, error: "Choose the submission channel: Eden/UFMS, Awaken wheeling, or both." }, { status: 400 });
  }
  const slaDaysValue = Number(payload.slaDays);
  const slaDays = Number.isInteger(slaDaysValue) && slaDaysValue >= 1 && slaDaysValue <= 60
    ? slaDaysValue
    : DEFAULT_SLA_DAYS;

  try {
    const { client, caseRow } = await loadCase(id);
    if (!caseRow) return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    if (!caseRow.eoi_signed_at) {
      return NextResponse.json(
        { ok: false, error: "Bankable-Pack Rule: the non-binding EOI must be signed before submission." },
        { status: 409 },
      );
    }
    if (caseRow.submitted_to_funder_at && caseRow.active_submission_id) {
      return NextResponse.json(
        { ok: false, error: "A funder submission is already recorded for this case." },
        { status: 409 },
      );
    }

    const relations = await getMigrationCaseRelations(caseRow);

    // The founder's rule in code: an incomplete KYC pack WARNS the operator,
    // it never blocks the submission. Karman decides; the system informs.
    // The first attempt against an incomplete pack returns the warnings and
    // asks for an explicit acknowledgement on the retry.
    const gate = evaluateKycGate(
      relations.kycDocuments ?? [],
      kycPlanFromStoredItems(relations.kycReadiness?.items, relations.kycReadiness?.fix_it_plan),
    );
    const kycAssessment = assessSubmissionKyc(gate);
    const acknowledged = payload.acknowledgeIncompleteKyc === true;
    if (kycAssessment.warnings.length && !acknowledged) {
      return NextResponse.json(
        {
          ok: false,
          warnNotBlock: true,
          requiresAcknowledgement: true,
          warnings: kycAssessment.warnings,
          kyc: {
            receivedCount: gate.receivedCount,
            verifiedCount: gate.verifiedCount,
            requiredCount: gate.requiredCount,
            complete: gate.complete,
            bankReady: gate.bankReady,
            missing: gate.missing,
            nextExpectedBy: gate.nextExpectedBy,
          },
          error: kycAssessment.warnings[0],
        },
        { status: 409 },
      );
    }

    const submittedAt = new Date().toISOString();
    const slaDueAt = new Date(Date.now() + slaDays * 24 * 60 * 60 * 1000).toISOString();
    const manifest = {
      proposalId: caseRow.active_proposal_id,
      eoiSignedAt: caseRow.eoi_signed_at,
      billPackId: caseRow.active_bill_pack_id,
      recognisedBillingPeriods: relations.billPack?.recognised_period_count ?? null,
      coveredDays: relations.billPack?.covered_days ?? null,
      kycReadinessConfirmedAt: caseRow.kyc_readiness_confirmed_at,
      kycReceivedCount: gate.receivedCount,
      kycVerifiedCount: gate.verifiedCount,
      kycComplete: gate.complete,
      kycMissing: gate.missing,
      kycIncompleteAcknowledged: kycAssessment.warnings.length ? acknowledged : false,
      economicallyPositive: relations.proposal?.economically_positive ?? null,
    };

    const { data: submission, error: submissionError } = await client
      .from("migration_case_submissions")
      .insert({
        case_id: caseRow.id,
        channel,
        submitted_at: submittedAt,
        submitted_by: session.email ?? session.name ?? "admin",
        batch_reference: cleanText(payload.batchReference, 80) || null,
        manifest,
        sla_days: slaDays,
        sla_due_at: slaDueAt,
        notes: cleanText(payload.notes, 1_000) || null,
      })
      .select("*")
      .single();
    if (submissionError || !submission) {
      throw new Error(submissionError?.message ?? "Unable to record the submission.");
    }

    await updateMigrationCase(caseRow.id, {
      stage: "submitted_to_funder",
      active_submission_id: submission.id,
      submitted_to_funder_at: submittedAt,
      funder_sla_due_at: slaDueAt,
      funder_acknowledged_at: null,
    });
    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: "submitted_to_funder",
      actorType: "operator",
      detail: kycAssessment.warnings.length
        ? `Pack submitted to the funder channel (${channel.replace(/_/g, " ")}) with the KYC pack at ${gate.receivedCount}/${gate.requiredCount} — the operator acknowledged the incomplete-pack warning. Response due within ${slaDays} days.`
        : `Bankable pack submitted to the funder channel (${channel.replace(/_/g, " ")}). Response due within ${slaDays} days.`,
      metadata: { submissionId: submission.id, channel, slaDueAt, manifest },
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, submissionId: submission.id, submittedAt, slaDueAt });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to record the submission." },
      { status: 500 },
    );
  }
}

/** Updates the active submission: funder acknowledgement or outcome. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  const { id } = await params;
  let payload: { action?: unknown; outcome?: unknown; notes?: unknown; acknowledgedAt?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const action = cleanText(payload.action, 30);

  try {
    const { client, caseRow } = await loadCase(id);
    if (!caseRow) return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    if (!caseRow.active_submission_id) {
      return NextResponse.json({ ok: false, error: "No funder submission is recorded for this case." }, { status: 409 });
    }
    const now = new Date().toISOString();

    if (action === "acknowledge") {
      // The operator records the funder's actual acknowledgement date when it
      // differs from today (an email that arrived while the console was shut).
      const explicit = cleanText(payload.acknowledgedAt, 30);
      const acknowledgedAt = explicit && !Number.isNaN(new Date(explicit).getTime())
        ? new Date(explicit).toISOString()
        : now;
      const { error } = await client
        .from("migration_case_submissions")
        .update({ acknowledged_at: acknowledgedAt })
        .eq("id", caseRow.active_submission_id)
        .is("acknowledged_at", null);
      if (error) throw new Error(error.message);
      await updateMigrationCase(caseRow.id, { funder_acknowledged_at: acknowledgedAt });
      await recordMigrationCaseEvent({
        caseId: caseRow.id,
        eventType: "funder_acknowledged",
        actorType: "operator",
        detail: "The funder acknowledged receipt of the submitted pack.",
        metadata: { submissionId: caseRow.active_submission_id, acknowledgedAt },
      }).catch(() => undefined);
      return NextResponse.json({ ok: true, acknowledgedAt });
    }

    if (action === "outcome") {
      const outcome = cleanText(payload.outcome, 30);
      if (!["declined", "withdrawn"].includes(outcome)) {
        return NextResponse.json({ ok: false, error: "Outcome must be declined or withdrawn." }, { status: 400 });
      }
      const { error } = await client
        .from("migration_case_submissions")
        .update({ outcome, outcome_at: now, notes: cleanText(payload.notes, 1_000) || null })
        .eq("id", caseRow.active_submission_id);
      if (error) throw new Error(error.message);
      await recordMigrationCaseEvent({
        caseId: caseRow.id,
        eventType: `submission_${outcome}`,
        actorType: "operator",
        detail: outcome === "declined"
          ? "The funder declined this submission. The case remains registered with Foundation-1 for reassessment."
          : "The submission was withdrawn by Foundation-1.",
        metadata: { submissionId: caseRow.active_submission_id },
      }).catch(() => undefined);
      return NextResponse.json({ ok: true, outcome, outcomeAt: now });
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update the submission." },
      { status: 500 },
    );
  }
}

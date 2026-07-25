import { NextRequest, NextResponse } from "next/server";
import {
  evaluateKycReadiness,
  KYC_ATTESTATION_VERSION,
  normaliseKycFixItPlan,
} from "@/lib/migration-case-kyc";
import {
  findMigrationCaseByToken,
  getMigrationCaseRelations,
  isMigrationCaseWebsiteRequest,
  publicMigrationCaseState,
  recordMigrationCaseEvent,
  updateMigrationCase,
} from "@/lib/migration-case-store";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 160) : "";
}

/**
 * S7 readiness gate. The client attests, per item, whether the six-document
 * bank pack is held. A complete attestation moves the case to `kyc_ready`
 * (submission-eligible); an incomplete one parks the case behind a dated
 * Fix-It plan — parked, never dead.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { token } = await params;
  const limit = await consumeRateLimit({
    scope: "migration-case-kyc-readiness",
    key: `${requestIp(request)}:${token.slice(-10)}`,
    limit: 10,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let payload: { confirmedBy?: unknown; items?: unknown; fixItPlan?: unknown; reassessOn?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const confirmedBy = cleanName(payload.confirmedBy);
  if (confirmedBy.length < 2) {
    return NextResponse.json({ ok: false, error: "Enter the name of the person confirming the checklist." }, { status: 400 });
  }
  const evaluation = evaluateKycReadiness(payload.items);
  if (!evaluation.ok) {
    return NextResponse.json({ ok: false, error: evaluation.error }, { status: 400 });
  }

  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }
    if (!caseRow.eoi_signed_at) {
      return NextResponse.json(
        { ok: false, error: "The readiness checklist opens after the non-binding EOI is signed." },
        { status: 409 },
      );
    }
    if (caseRow.kyc_handed_off_at) {
      return NextResponse.json(
        { ok: false, error: "The KYC pack has already been handed off for this case." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const reassessOn = typeof payload.reassessOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.reassessOn)
      ? payload.reassessOn
      : evaluation.complete
        ? null
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fixItPlan = evaluation.complete ? [] : normaliseKycFixItPlan(payload.fixItPlan, evaluation.missing);

    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase admin configuration is unavailable.");
    const { error: upsertError } = await client
      .from("migration_case_kyc_readiness")
      .upsert(
        {
          case_id: caseRow.id,
          status: evaluation.complete ? "confirmed" : "parked",
          confirmed_by: confirmedBy,
          attestation_version: KYC_ATTESTATION_VERSION,
          items: evaluation.items,
          fix_it_plan: fixItPlan,
          reassess_on: reassessOn,
          confirmed_at: evaluation.complete ? now : null,
        },
        { onConflict: "case_id" },
      );
    if (upsertError) throw new Error(upsertError.message);

    let updatedCase = caseRow;
    if (evaluation.complete) {
      updatedCase = await updateMigrationCase(caseRow.id, {
        // Never regress a case that is already past the gate.
        ...(caseRow.stage === "eoi_signed" ? { stage: "kyc_ready" as const } : {}),
        kyc_readiness_confirmed_at: now,
      });
    }

    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: evaluation.complete ? "kyc_readiness_confirmed" : "kyc_readiness_parked",
      actorType: "client",
      detail: evaluation.complete
        ? "Client attested that all six bank KYC documents are held. The case is submission-eligible."
        : `Client attested the KYC checklist with ${evaluation.missing.length} outstanding item(s). Fix-It plan recorded; reassess on ${reassessOn}.`,
      metadata: {
        attestationVersion: KYC_ATTESTATION_VERSION,
        missing: evaluation.missing,
        reassessOn,
      },
    }).catch(() => undefined);

    void createNotification({
      audience: "admin",
      kind: "system",
      title: evaluation.complete
        ? `Submission-ready: ${caseRow.business_name}`
        : `KYC readiness parked: ${caseRow.business_name}`,
      body: evaluation.complete
        ? `${confirmedBy} confirmed all six KYC documents are held. Queue the funder submission.`
        : `${confirmedBy} reported ${evaluation.missing.length} missing KYC item(s). Fix-It plan recorded; reassess on ${reassessOn}.`,
      link: "/admin/migration-cases",
      metadata: {
        migrationCaseId: caseRow.id,
        publicReference: caseRow.public_reference,
        missing: evaluation.missing,
      },
    });

    const relations = await getMigrationCaseRelations(updatedCase);
    return NextResponse.json(publicMigrationCaseState(updatedCase, relations), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to record the readiness checklist." },
      { status: 500 },
    );
  }
}

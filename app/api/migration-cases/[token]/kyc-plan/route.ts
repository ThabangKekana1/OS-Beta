import { NextRequest, NextResponse } from "next/server";
import {
  evaluateKycGate,
  KYC_FIX_IT_GUIDANCE,
  KYC_PLAN_VERSION,
  kycDocumentLabel,
  kycPlanFromStoredItems,
  mergeKycItemPlan,
  sanitiseKycItemPlan,
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

/**
 * The document-gate item plan (S7). The client declares, per missing KYC
 * item, either "I will provide it by [date]" or "I don't have this". ANY
 * subset saves immediately — partial declarations are the normal case and
 * never an error, and nothing here ever blocks the client's journey.
 *
 * Uploaded documents always win over declarations (the gate derives item
 * state from custody first). When the custody pack reaches 6/6 the case is
 * marked submission-eligible exactly as the legacy attestation did.
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
    scope: "migration-case-kyc-plan",
    key: `${requestIp(request)}:${token.slice(-10)}`,
    limit: 40,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let payload: { items?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const updates = sanitiseKycItemPlan(payload.items);
  if (!updates.length) {
    return NextResponse.json(
      { ok: false, error: "Nothing to record: declare at least one document as promised or not held." },
      { status: 400 },
    );
  }

  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }
    if (!caseRow.eoi_signed_at) {
      return NextResponse.json(
        { ok: false, error: "The document pack opens after the non-binding EOI is signed." },
        { status: 409 },
      );
    }
    if (caseRow.kyc_handed_off_at) {
      return NextResponse.json(
        { ok: false, error: "The verified KYC pack has already been handed off for this case." },
        { status: 409 },
      );
    }

    const relations = await getMigrationCaseRelations(caseRow);
    const existingPlan = kycPlanFromStoredItems(
      relations.kycReadiness?.items,
      relations.kycReadiness?.fix_it_plan,
    );
    const plan = mergeKycItemPlan(existingPlan, updates);
    const gate = evaluateKycGate(relations.kycDocuments ?? [], plan);
    // Keep declarations only for items that are not in custody yet.
    const openPlan = plan.filter((entry) =>
      gate.items.some((item) => item.id === entry.id && item.state !== "uploaded"),
    );

    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase admin configuration is unavailable.");
    const now = new Date().toISOString();
    const confirmedBy = relations.kycReadiness?.confirmed_by
      || caseRow.contact_name
      || "Client";
    const row = {
      case_id: caseRow.id,
      status: gate.complete ? "confirmed" : "in_progress",
      confirmed_by: confirmedBy,
      attestation_version: KYC_PLAN_VERSION,
      items: gate.complete
        ? gate.items.map((item) => ({ id: item.id, held: true, note: null }))
        : openPlan,
      fix_it_plan: openPlan.map((entry) => ({
        id: entry.id,
        action: KYC_FIX_IT_GUIDANCE[entry.id],
        expectedBy: entry.expectedBy,
      })),
      reassess_on: gate.nextExpectedBy,
      confirmed_at: gate.complete ? now : null,
    };
    let { error: upsertError } = await client
      .from("migration_case_kyc_readiness")
      .upsert(row, { onConflict: "case_id" });
    if (upsertError && upsertError.code === "23514") {
      // The "in_progress" status migration has not been applied yet; the
      // legacy check constraint only allows confirmed/parked. Record the plan
      // as "parked" rather than blocking the client's save.
      const retry = await client
        .from("migration_case_kyc_readiness")
        .upsert({ ...row, status: gate.complete ? "confirmed" : "parked" }, { onConflict: "case_id" });
      upsertError = retry.error;
    }
    if (upsertError) throw new Error(upsertError.message);

    let updatedCase = caseRow;
    if (gate.complete && !caseRow.kyc_readiness_confirmed_at) {
      updatedCase = await updateMigrationCase(caseRow.id, {
        ...(caseRow.stage === "eoi_signed" ? { stage: "kyc_ready" as const } : {}),
        kyc_readiness_confirmed_at: now,
      });
    }

    const declared = updates
      .map((entry) => `${kycDocumentLabel(entry.id)}: ${entry.status === "promised" ? `promised${entry.expectedBy ? ` by ${entry.expectedBy}` : ""}` : "not held"}`)
      .join("; ");
    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: "kyc_item_plan_updated",
      actorType: "client",
      detail: `Document gate updated (${gate.receivedCount}/${gate.requiredCount} in custody). ${declared}.`,
      metadata: {
        planVersion: KYC_PLAN_VERSION,
        receivedCount: gate.receivedCount,
        promised: openPlan.filter((entry) => entry.status === "promised"),
        dontHave: openPlan.filter((entry) => entry.status === "dont_have").map((entry) => entry.id),
      },
    }).catch(() => undefined);

    if (gate.promisedCount || gate.dontHaveCount) {
      void createNotification({
        audience: "admin",
        kind: "system",
        title: `KYC plan: ${caseRow.business_name} (${gate.receivedCount}/6 in)`,
        body: declared,
        link: "/admin/migration-cases",
        metadata: {
          migrationCaseId: caseRow.id,
          publicReference: caseRow.public_reference,
          nextExpectedBy: gate.nextExpectedBy,
        },
      });
    }

    const refreshed = await getMigrationCaseRelations(updatedCase);
    return NextResponse.json(publicMigrationCaseState(updatedCase, refreshed), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to record the document plan." },
      { status: 500 },
    );
  }
}

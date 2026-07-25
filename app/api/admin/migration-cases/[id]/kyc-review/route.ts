import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { kycDocumentLabel } from "@/lib/migration-case-kyc";
import {
  kycPackStatus,
  recordMigrationCaseEvent,
  updateMigrationCase,
  type MigrationCaseKycDocumentRow,
  type MigrationCaseRow,
} from "@/lib/migration-case-store";
import { createNotification } from "@/lib/notifications";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

/**
 * Operator verification pass over a KYC document in custody. When every one
 * of the six latest documents is verified the case becomes `kyc_verified`
 * and the funder handoff unlocks. A rejection reopens the slot for the
 * client with the review note attached.
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
  let payload: { documentId?: unknown; decision?: unknown; note?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const documentId = cleanText(payload.documentId, 60);
  const decision = cleanText(payload.decision, 20);
  const note = cleanText(payload.note, 500);
  if (!documentId) {
    return NextResponse.json({ ok: false, error: "Identify the document to review." }, { status: 400 });
  }
  if (!["verified", "rejected"].includes(decision)) {
    return NextResponse.json({ ok: false, error: "Decision must be verified or rejected." }, { status: 400 });
  }
  if (decision === "rejected" && note.length < 5) {
    return NextResponse.json({ ok: false, error: "Give the client a clear rejection reason." }, { status: 400 });
  }

  try {
    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase admin configuration is unavailable.");
    const { data: caseRow, error: caseError } = await client
      .from("migration_cases")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (caseError) throw new Error(caseError.message);
    if (!caseRow) return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    const typedCase = caseRow as MigrationCaseRow;
    if (typedCase.kyc_handed_off_at) {
      return NextResponse.json({ ok: false, error: "The KYC pack has already been handed off." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const reviewer = session.email ?? session.name ?? "admin";
    const { data: reviewed, error: reviewError } = await client
      .from("migration_case_kyc_documents")
      .update({
        status: decision,
        review_note: decision === "rejected" ? note : note || null,
        reviewed_at: now,
        reviewed_by: reviewer,
      })
      .eq("id", documentId)
      .eq("case_id", typedCase.id)
      .select("*")
      .single();
    if (reviewError || !reviewed) {
      throw new Error(reviewError?.message ?? "Unable to record the review.");
    }
    const reviewedDocument = reviewed as MigrationCaseKycDocumentRow;

    await recordMigrationCaseEvent({
      caseId: typedCase.id,
      eventType: decision === "verified" ? "kyc_document_verified" : "kyc_document_rejected",
      actorType: "operator",
      detail: decision === "verified"
        ? `${kycDocumentLabel(reviewedDocument.document_type)} verified.`
        : `${kycDocumentLabel(reviewedDocument.document_type)} rejected: ${note}`,
      metadata: { documentId, documentType: reviewedDocument.document_type },
    }).catch(() => undefined);

    // Recompute pack state from all documents.
    const { data: allDocuments, error: documentsError } = await client
      .from("migration_case_kyc_documents")
      .select("*")
      .eq("case_id", typedCase.id)
      .order("created_at", { ascending: false });
    if (documentsError) throw new Error(documentsError.message);
    const pack = kycPackStatus((allDocuments ?? []) as MigrationCaseKycDocumentRow[]);

    if (pack.allVerified && !typedCase.kyc_verified_at) {
      await updateMigrationCase(typedCase.id, {
        ...(typedCase.stage === "partner_proposal_signed" ? { stage: "kyc_verified" as const } : {}),
        kyc_verified_at: now,
      });
      await recordMigrationCaseEvent({
        caseId: typedCase.id,
        eventType: "kyc_pack_verified",
        actorType: "operator",
        detail: "All six KYC documents verified. The funder handoff is unlocked.",
        metadata: { verifiedCount: pack.verifiedCount },
      }).catch(() => undefined);
      void createNotification({
        audience: "admin",
        kind: "system",
        title: `KYC verified: ${typedCase.business_name}`,
        body: "The six-item pack is verified. Record the official funder handoff.",
        link: "/admin/migration-cases",
        metadata: { migrationCaseId: typedCase.id, publicReference: typedCase.public_reference },
      });
    } else if (decision === "rejected") {
      await updateMigrationCase(typedCase.id, {
        kyc_pack_complete_at: null,
        kyc_verified_at: null,
        ...(typedCase.stage === "kyc_verified" ? { stage: "partner_proposal_signed" as const } : {}),
      });
    }

    return NextResponse.json({
      ok: true,
      documentId,
      decision,
      packComplete: pack.complete,
      packVerified: pack.allVerified,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to review the document." },
      { status: 500 },
    );
  }
}

import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import {
  MIGRATION_CASE_DOCUMENT_BUCKET,
  recordMigrationCaseEvent,
  updateMigrationCase,
} from "@/lib/migration-case-store";
import { uploadPrivateObject } from "@/lib/server-json-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function cleanName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 110) || "proposal.pdf";
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
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read the proposal upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ ok: false, error: "Choose the issued formal UFMS proposal PDF." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ ok: false, error: "The proposal must be 20MB or smaller." }, { status: 413 });
  }
  if (file.type !== "application/pdf" && file.name.split(".").pop()?.toLowerCase() !== "pdf") {
    return NextResponse.json({ ok: false, error: "Upload the issued formal proposal as a PDF." }, { status: 400 });
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
    if (!caseRow.eoi_signed_at) {
      return NextResponse.json(
        { ok: false, error: "Issue the formal pathway proposal only after the non-binding EOI is signed." },
        { status: 409 },
      );
    }
    if (!caseRow.kyc_readiness_confirmed_at) {
      return NextResponse.json(
        { ok: false, error: "Bankable-Pack Rule: the client must confirm the six-item KYC readiness checklist before the funder round." },
        { status: 409 },
      );
    }
    if (!caseRow.submitted_to_funder_at) {
      return NextResponse.json(
        { ok: false, error: "Bankable-Pack Rule: record the funder submission before issuing the returned pathway proposal." },
        { status: 409 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const storagePath = `${caseRow.public_reference}/partner-proposal/issued-${Date.now()}-${cleanName(file.name)}`;
    const upload = new File([bytes], file.name, { type: file.type || "application/pdf" });
    await uploadPrivateObject(MIGRATION_CASE_DOCUMENT_BUCKET, storagePath, upload);
    const issuedAt = new Date().toISOString();
    const { data: proposal, error: proposalError } = await client
      .from("migration_case_partner_proposals")
      .insert({
        case_id: caseRow.id,
        status: "issued",
        issued_at: issuedAt,
        issued_by: session.email ?? session.name ?? "admin",
        issued_original_name: file.name.slice(0, 220),
        issued_storage_path: storagePath,
        issued_content_type: file.type || "application/pdf",
        issued_file_size_bytes: file.size,
        issued_sha256: sha256,
      })
      .select("id")
      .single();
    if (proposalError || !proposal) throw new Error(proposalError?.message ?? "Unable to store proposal metadata.");

    await updateMigrationCase(caseRow.id, {
      stage: "partner_proposal_ready",
      active_partner_proposal_id: proposal.id,
      partner_proposal_ready_at: issuedAt,
      partner_proposal_signed_at: null,
      direct_kyc_confirmed_at: null,
    });
    if (caseRow.active_submission_id) {
      await client
        .from("migration_case_submissions")
        .update({ outcome: "proposal_received", outcome_at: issuedAt })
        .eq("id", caseRow.active_submission_id)
        .eq("outcome", "pending");
    }
    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: "partner_proposal_issued",
      actorType: "operator",
      detail: "Formal pathway proposal issued to the client for signature.",
      metadata: { partnerProposalId: proposal.id, sha256 },
    }).catch(() => undefined);

    // Funder-report pipeline: read the returned funder paper, cross-check it
    // against the bill-audited engine prediction and publish (or hold for
    // operator confirmation) ONE report explaining both proposals.
    // Fire-and-forget: the upload must succeed even if the report generation
    // needs the operator desk.
    void import("@/lib/funder-report-pipeline")
      .then((pipeline) => pipeline.runFunderReportPipeline({
        caseRow: { ...caseRow, active_partner_proposal_id: proposal.id },
        triggeredBy: session.email ?? session.name ?? "admin",
      }))
      .catch(() => undefined);

    return NextResponse.json({ ok: true, partnerProposalId: proposal.id, issuedAt });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to issue the formal proposal." },
      { status: 500 },
    );
  }
}

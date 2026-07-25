import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  findMigrationCaseByToken,
  getMigrationCasePartnerProposal,
  getMigrationCaseRelations,
  isMigrationCaseWebsiteRequest,
  MIGRATION_CASE_DOCUMENT_BUCKET,
  publicMigrationCaseState,
  recordMigrationCaseEvent,
  updateMigrationCase,
} from "@/lib/migration-case-store";
import { consumeRateLimit } from "@/lib/rate-limit";
import { uploadPrivateObject } from "@/lib/server-json-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf"]);

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function cleanName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 110) || "proposal.pdf";
}

function validateProposal(file: File) {
  if (file.size <= 0) return "The proposal file is empty.";
  if (file.size > MAX_FILE_BYTES) return "The proposal must be 20MB or smaller.";
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!ALLOWED_TYPES.has(file.type) && extension !== "pdf") return "Upload the formal proposal as a PDF.";
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { token } = await params;
  const limit = await consumeRateLimit({
    scope: "migration-case-partner-proposal",
    key: `${requestIp(request)}:${token.slice(-10)}`,
    limit: 8,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many proposal uploads. Try again later." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read the proposal upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Choose the signed formal proposal PDF." }, { status: 400 });
  }
  const invalid = validateProposal(file);
  if (invalid) return NextResponse.json({ ok: false, error: invalid }, { status: 400 });

  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }
    if (!caseRow.eoi_signed_at) {
      return NextResponse.json(
        { ok: false, error: "The formal UFMS proposal stage opens only after the non-binding EOI." },
        { status: 409 },
      );
    }
    const proposal = await getMigrationCasePartnerProposal(caseRow);
    if (!proposal) {
      return NextResponse.json(
        { ok: false, error: "The formal UFMS proposal has not been issued to this case yet." },
        { status: 409 },
      );
    }
    if (proposal.signed_at) {
      return NextResponse.json(
        { ok: false, error: "A signed formal proposal is already on record for this case." },
        { status: 409 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const storagePath = `${caseRow.public_reference}/partner-proposal/signed-${Date.now()}-${cleanName(file.name)}`;
    const upload = new File([bytes], file.name, { type: file.type || "application/pdf" });
    await uploadPrivateObject(MIGRATION_CASE_DOCUMENT_BUCKET, storagePath, upload);

    const signedAt = new Date().toISOString();
    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase admin configuration is unavailable.");
    const { error } = await client
      .from("migration_case_partner_proposals")
      .update({
        status: "signed",
        signed_at: signedAt,
        signed_original_name: file.name.slice(0, 220),
        signed_storage_path: storagePath,
        signed_content_type: file.type || "application/pdf",
        signed_file_size_bytes: file.size,
        signed_sha256: sha256,
      })
      .eq("id", proposal.id)
      .is("signed_at", null);
    if (error) throw new Error(error.message);

    const updatedCase = await updateMigrationCase(caseRow.id, {
      stage: "partner_proposal_signed",
      partner_proposal_signed_at: signedAt,
    });
    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: "partner_proposal_signed",
      actorType: "client",
      detail: "Client returned the signed formal UFMS proposal. Direct-to-UFMS compliance handoff opened.",
      metadata: { partnerProposalId: proposal.id, sha256 },
    }).catch(() => undefined);

    const relations = await getMigrationCaseRelations(updatedCase);
    return NextResponse.json(publicMigrationCaseState(updatedCase, relations), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to store the signed proposal." },
      { status: 500 },
    );
  }
}

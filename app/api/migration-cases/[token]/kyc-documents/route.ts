import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  extractKycDocumentData,
  isKycDocumentType,
  KYC_DOCUMENT_MAX_BYTES,
  kycDocumentLabel,
} from "@/lib/migration-case-kyc";
import {
  findMigrationCaseByToken,
  getMigrationCaseRelations,
  isMigrationCaseWebsiteRequest,
  kycPackStatus,
  MIGRATION_CASE_DOCUMENT_BUCKET,
  publicMigrationCaseState,
  recordMigrationCaseEvent,
  updateMigrationCase,
} from "@/lib/migration-case-store";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";
import { ensurePrivateBucket } from "@/lib/server-json-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const ALLOWED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "txt"]);

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function cleanFileName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "bin";
  const base = name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return `${base || "kyc-document"}.${extension}`;
}

function validateFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return `${file.name} is not supported. Upload PDF, PNG or JPG documents.`;
  }
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > KYC_DOCUMENT_MAX_BYTES) return `${file.name} is larger than 20MB.`;
  return null;
}

/**
 * KYC custody (Model B). Documents are collected into the case after the
 * signed formal proposal is returned, mined into structured fields for the
 * case record, and verified by an operator before any external handoff.
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
    scope: "migration-case-kyc-documents",
    key: `${requestIp(request)}:${token.slice(-10)}`,
    limit: 40,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many upload attempts. Try again later." }, { status: 429 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > KYC_DOCUMENT_MAX_BYTES + 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "Each KYC document must be 20MB or smaller." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read the document upload." }, { status: 400 });
  }
  const documentType = form.get("documentType");
  if (!isKycDocumentType(documentType)) {
    return NextResponse.json({ ok: false, error: "Choose which KYC document is being uploaded." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Choose the document file to upload." }, { status: 400 });
  }
  const invalid = validateFile(file);
  if (invalid) return NextResponse.json({ ok: false, error: invalid }, { status: 400 });

  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }
    const relations = await getMigrationCaseRelations(caseRow);
    if (!relations.partnerProposal?.signed_at) {
      return NextResponse.json(
        { ok: false, error: "KYC documents are collected after the signed pathway proposal is returned." },
        { status: 409 },
      );
    }
    if (caseRow.kyc_handed_off_at) {
      return NextResponse.json(
        { ok: false, error: "The verified KYC pack has already been handed off for this case." },
        { status: 409 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const duplicate = relations.kycDocuments.find((document) => document.sha256 === sha256);
    if (duplicate) {
      return NextResponse.json(
        { ok: false, error: `This exact file is already on record as ${kycDocumentLabel(duplicate.document_type)}.` },
        { status: 409 },
      );
    }

    // The data asset: extract structured fields before storage (IDs masked).
    const extraction = await extractKycDocumentData(
      { name: file.name, type: file.type, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) },
      documentType,
    );

    const storageClient = await ensurePrivateBucket(MIGRATION_CASE_DOCUMENT_BUCKET);
    if (!storageClient) throw new Error("Private document storage is unavailable.");
    const storagePath = `${caseRow.public_reference}/kyc/${documentType}-${Date.now()}-${cleanFileName(file.name)}`;
    const { error: uploadError } = await storageClient.storage
      .from(MIGRATION_CASE_DOCUMENT_BUCKET)
      .upload(storagePath, bytes, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
        cacheControl: "0",
      });
    if (uploadError) throw new Error(`Could not store ${file.name}: ${uploadError.message}`);

    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase admin configuration is unavailable.");
    const { data: insertedDocument, error: insertError } = await client
      .from("migration_case_kyc_documents")
      .insert({
        case_id: caseRow.id,
        document_type: documentType,
        original_name: file.name.slice(0, 240),
        storage_path: storagePath,
        content_type: file.type || "application/octet-stream",
        file_size_bytes: bytes.byteLength,
        sha256,
        status: "received",
        extracted: extraction,
        extraction_version: extraction.version,
      })
      .select("*")
      .single();
    if (insertError || !insertedDocument) {
      throw new Error(insertError?.message ?? "Unable to record the KYC document.");
    }

    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: "kyc_document_received",
      actorType: "client",
      detail: `${kycDocumentLabel(documentType)} received into case custody.`,
      metadata: {
        documentId: insertedDocument.id,
        documentType,
        sha256,
        readable: extraction.readable,
      },
    }).catch(() => undefined);

    // Recompute pack completeness with the new document included.
    const documents = [insertedDocument, ...relations.kycDocuments];
    const pack = kycPackStatus(documents);
    let updatedCase = caseRow;
    if (pack.complete && !caseRow.kyc_pack_complete_at) {
      updatedCase = await updateMigrationCase(caseRow.id, {
        kyc_pack_complete_at: new Date().toISOString(),
      });
      await recordMigrationCaseEvent({
        caseId: caseRow.id,
        eventType: "kyc_pack_complete",
        actorType: "system",
        detail: "All six KYC documents are in custody. Foundation-1 verification is next.",
        metadata: { receivedCount: pack.receivedCount },
      }).catch(() => undefined);
      void createNotification({
        audience: "admin",
        kind: "customer_uploaded_document",
        title: `KYC pack complete: ${caseRow.business_name}`,
        body: "All six KYC documents are in custody. Verify the pack to unlock the funder handoff.",
        link: "/admin/migration-cases",
        metadata: {
          migrationCaseId: caseRow.id,
          publicReference: caseRow.public_reference,
        },
      });
    } else if (!pack.complete && caseRow.kyc_pack_complete_at) {
      // A replacement after rejection may reopen completeness bookkeeping.
      updatedCase = await updateMigrationCase(caseRow.id, { kyc_pack_complete_at: null });
    }

    const refreshedRelations = await getMigrationCaseRelations(updatedCase);
    return NextResponse.json(publicMigrationCaseState(updatedCase, refreshedRelations), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to store the KYC document." },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { makeId } from "@/lib/formatting";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { uploadPrivateObject } from "@/lib/server-json-store";

export const runtime = "nodejs";

const DOCUMENT_BUCKET = "foundation-1-migration-documents";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "xlsx", "csv"]);
const DOCUMENT_TYPES = new Set(["expression_of_interest", "utility_bill"]);

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanFileSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function fileExtension(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function validateFile(file: File) {
  const extension = fileExtension(file);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return `${file.name} is not supported. Upload PDF, PNG, JPG, XLSX, or CSV files.`;
  }
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name} is larger than 15MB.`;
  return null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function localDocumentResponse(documentId: string, documentType: string, file: File, uploadedAt: string) {
  return NextResponse.json({
    ok: true,
    backend: "local",
    document: {
      id: documentId,
      documentType,
      fileName: file.name,
      uploadedAt,
      status: "received",
    },
  });
}

function isMissingMigrationTable(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "42P01" || message.includes("migration_documents");
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const assessmentId = cleanString(formData.get("assessmentId"));
  const documentType = cleanString(formData.get("documentType"));
  const file = formData.get("file");

  if (!assessmentId) {
    return NextResponse.json({ ok: false, error: "Migration Assessment is required." }, { status: 400 });
  }
  if (!DOCUMENT_TYPES.has(documentType)) {
    return NextResponse.json({ ok: false, error: "Choose a valid Utility Profile file type." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Choose a Utility Profile file." }, { status: 400 });
  }

  const invalid = validateFile(file);
  if (invalid) {
    return NextResponse.json({ ok: false, error: invalid }, { status: 400 });
  }

  const documentId = makeId("migration-doc");
  const uploadedAt = new Date().toISOString();
  const supabase = getSupabaseAdminClient();

  if (!supabase || !isUuid(assessmentId)) {
    return localDocumentResponse(documentId, documentType, file, uploadedAt);
  }

  const safeFilename = cleanFileSegment(file.name) || `${documentId}.bin`;
  const fileUrl = await uploadPrivateObject(
    DOCUMENT_BUCKET,
    `${assessmentId}/${documentId}-${safeFilename}`,
    file,
  );

  const { error } = await supabase.from("migration_documents").insert({
    id: documentId,
    assessment_id: assessmentId,
    document_type: documentType,
    file_name: file.name,
    file_url: fileUrl,
    status: "received",
  });

  if (error) {
    if (isMissingMigrationTable(error)) {
      return localDocumentResponse(documentId, documentType, file, uploadedAt);
    }

    return NextResponse.json(
      { ok: false, error: error.message ?? "Unable to receive Utility Profile file." },
      { status: 500 },
    );
  }

  await supabase
    .from("migration_assessments")
    .update({
      status: "utility_profile_uploaded",
    })
    .eq("id", assessmentId);

  return NextResponse.json({
    ok: true,
    backend: "supabase",
    document: {
      id: documentId,
      documentType,
      fileName: file.name,
      uploadedAt,
      status: "received",
    },
  });
}

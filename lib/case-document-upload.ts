import { hasSupabaseAdminConfig } from "@/lib/supabase-admin";
import { insertCaseDocument, type CaseDocKind, type CaseDocument } from "@/lib/case-documents";
import { ensurePrivateBucket } from "@/lib/server-json-store";

const BUCKET = process.env.ONEOS_SUPABASE_BUCKET?.trim() || "oneos-documents";
export const MAX_CASE_DOCUMENT_BYTES = 15 * 1024 * 1024;

async function extractPdfText(buffer: Buffer): Promise<string | null> {
  try {
    const mod = await import("pdf-parse");
    const pdfParse = (mod as unknown as { default?: (b: Buffer) => Promise<{ text?: string }> })
      .default ?? (mod as unknown as (b: Buffer) => Promise<{ text?: string }>);
    const result = await pdfParse(buffer);
    const text = (result?.text ?? "").trim();
    return text || null;
  } catch {
    return null;
  }
}

async function extractDocumentText(file: File, buffer: Buffer) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return extractPdfText(buffer);
  }

  if (file.type.startsWith("text/")) {
    return buffer.toString("utf8").slice(0, 200_000);
  }

  return null;
}

function buildStoragePath(workspaceId: string, caseId: string, docKind: CaseDocKind, file: File) {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  return `${workspaceId}/${caseId}/${docKind}/${Date.now()}-${safeName}`;
}

export async function persistCaseDocumentUpload(input: {
  workspaceId: string;
  caseId: string;
  docKind: CaseDocKind;
  file: File;
  title?: string | null;
  uploadedBy?: string | null;
}): Promise<{
  doc: CaseDocument;
  extractedText: string | null;
  storagePath: string;
}> {
  if (!hasSupabaseAdminConfig()) {
    throw new Error("Supabase storage is not configured.");
  }

  const client = await ensurePrivateBucket(BUCKET);
  if (!client) {
    throw new Error("Supabase admin client unavailable.");
  }

  if (input.file.size === 0 || input.file.size > MAX_CASE_DOCUMENT_BYTES) {
    throw new Error(`File must be 1B–${MAX_CASE_DOCUMENT_BYTES} bytes.`);
  }

  const buffer = Buffer.from(await input.file.arrayBuffer());
  const extractedText = await extractDocumentText(input.file, buffer);
  const storagePath = buildStoragePath(input.workspaceId, input.caseId, input.docKind, input.file);

  const { error: uploadError } = await client.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: input.file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const doc = await insertCaseDocument({
    workspaceId: input.workspaceId,
    caseId: input.caseId,
    docKind: input.docKind,
    title: input.title ?? input.file.name,
    storagePath,
    extractedText,
    uploadedBy: input.uploadedBy ?? null,
  });

  if (!doc) {
    await client.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw new Error("Failed to persist case document record.");
  }

  return {
    doc,
    extractedText,
    storagePath,
  };
}

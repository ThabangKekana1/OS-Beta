import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type CaseDocKind = "proposal" | "term_sheet" | "utility_bill" | "eoi" | "other";

export type CaseDocument = {
  id: string;
  workspaceId: string;
  caseId: string;
  docKind: CaseDocKind;
  title: string | null;
  storagePath: string | null;
  extractedText: string | null;
  uploadedBy: string | null;
  createdAt: string;
};

const TABLE = "oneos_case_documents";

export async function listCaseDocuments(
  workspaceId: string,
  caseId: string,
): Promise<CaseDocument[]> {
  const client = getSupabaseAdminClient();
  if (!client || !workspaceId || !caseId) return [];

  const { data } = await client
    .from(TABLE)
    .select("id, workspace_id, case_id, doc_kind, title, storage_path, extracted_text, uploaded_by, created_at")
    .eq("workspace_id", workspaceId)
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });

  if (!data) return [];

  return data.map((row) => ({
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    caseId: String(row.case_id),
    docKind: row.doc_kind as CaseDocKind,
    title: row.title ? String(row.title) : null,
    storagePath: row.storage_path ? String(row.storage_path) : null,
    extractedText: row.extracted_text ? String(row.extracted_text) : null,
    uploadedBy: row.uploaded_by ? String(row.uploaded_by) : null,
    createdAt: String(row.created_at),
  }));
}

export async function getLatestExtractedText(
  workspaceId: string,
  caseId: string,
  docKind: CaseDocKind,
  maxChars = 6000,
): Promise<string | null> {
  const docs = await listCaseDocuments(workspaceId, caseId);
  const match = docs.find((d) => d.docKind === docKind && d.extractedText);
  if (!match?.extractedText) return null;
  return match.extractedText.slice(0, maxChars);
}

export async function insertCaseDocument(input: {
  workspaceId: string;
  caseId: string;
  docKind: CaseDocKind;
  title?: string | null;
  storagePath?: string | null;
  extractedText?: string | null;
  uploadedBy?: string | null;
}): Promise<CaseDocument | null> {
  const client = getSupabaseAdminClient();
  if (!client) return null;

  const { data, error } = await client
    .from(TABLE)
    .insert({
      workspace_id: input.workspaceId,
      case_id: input.caseId,
      doc_kind: input.docKind,
      title: input.title ?? null,
      storage_path: input.storagePath ?? null,
      extracted_text: input.extractedText ?? null,
      uploaded_by: input.uploadedBy ?? null,
    })
    .select()
    .single();

  if (error || !data) return null;

  return {
    id: String(data.id),
    workspaceId: String(data.workspace_id),
    caseId: String(data.case_id),
    docKind: data.doc_kind as CaseDocKind,
    title: data.title ? String(data.title) : null,
    storagePath: data.storage_path ? String(data.storage_path) : null,
    extractedText: data.extracted_text ? String(data.extracted_text) : null,
    uploadedBy: data.uploaded_by ? String(data.uploaded_by) : null,
    createdAt: String(data.created_at),
  };
}

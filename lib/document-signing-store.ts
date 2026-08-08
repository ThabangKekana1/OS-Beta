import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  DOCUMENT_SIGNATURES_TABLE,
  type DocumentSignatureRow,
  type SignableDocumentKind,
} from "@/lib/document-signing";

/**
 * Persistence for in-platform document signing. The table arrives with the
 * staged migration `20260815120000_migration_case_document_signing.sql`;
 * every read is tolerant of a remote schema that does not carry it yet, in
 * exactly the way the partner-proposal reads are.
 */

function adminClient() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin configuration is unavailable.");
  return client;
}

function schemaMissing(message: string) {
  return /does not exist|schema cache|relation/i.test(message);
}

export type DocumentSignatureLookup = {
  /** False when the signatures table has not been provisioned remotely yet. */
  available: boolean;
  row: DocumentSignatureRow | null;
};

export async function findDocumentSignature(
  caseId: string,
  kind: SignableDocumentKind,
  documentRef: string | null,
): Promise<DocumentSignatureLookup> {
  let query = adminClient()
    .from(DOCUMENT_SIGNATURES_TABLE)
    .select("*")
    .eq("case_id", caseId)
    .eq("document_kind", kind)
    .order("created_at", { ascending: false })
    .limit(1);
  if (documentRef) query = query.eq("document_ref", documentRef);
  const { data, error } = await query;
  if (error) {
    if (schemaMissing(error.message)) return { available: false, row: null };
    throw new Error(error.message);
  }
  return { available: true, row: (data?.[0] ?? null) as DocumentSignatureRow | null };
}

export async function listDocumentSignaturesForCases(caseIds: string[]) {
  if (!caseIds.length) return [] as DocumentSignatureRow[];
  const { data, error } = await adminClient()
    .from(DOCUMENT_SIGNATURES_TABLE)
    .select("*")
    .in("case_id", caseIds)
    .order("created_at", { ascending: false });
  if (error) {
    if (schemaMissing(error.message)) return [] as DocumentSignatureRow[];
    throw new Error(error.message);
  }
  return (data ?? []) as DocumentSignatureRow[];
}

export async function insertDocumentSignature(
  row: Omit<DocumentSignatureRow, "id" | "created_at" | "updated_at">,
): Promise<DocumentSignatureRow> {
  const { data, error } = await adminClient()
    .from(DOCUMENT_SIGNATURES_TABLE)
    .insert(row)
    .select("*")
    .single();
  if (error || !data) {
    if (error && schemaMissing(error.message)) {
      throw new Error("The in-platform signing service is not provisioned on this environment yet.");
    }
    throw new Error(error?.message ?? "Unable to record the document signature.");
  }
  return data as DocumentSignatureRow;
}

export async function updateDocumentSignature(
  id: string,
  patch: Partial<DocumentSignatureRow>,
): Promise<DocumentSignatureRow> {
  const { data, error } = await adminClient()
    .from(DOCUMENT_SIGNATURES_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Unable to update the document signature.");
  }
  return data as DocumentSignatureRow;
}

/** Shape shared with the client panel; never leaks storage paths. */
export function publicDocumentSignature(row: DocumentSignatureRow | null) {
  if (!row) return null;
  return {
    status: row.status,
    signerName: row.signer_name,
    signerPosition: row.signer_position,
    signerInitials: row.signer_initials,
    pageCount: row.page_count,
    pageInitials: row.page_initials ?? [],
    signedAt: row.signed_at,
    submittedAt: row.submitted_at,
    sourceSha256: row.source_sha256,
    signedSha256: row.signed_sha256,
    signingVersion: row.signing_version,
  };
}

import {
  MIGRATION_CASE_DOCUMENT_BUCKET,
  type MigrationCaseProposalRow,
  type MigrationCaseRow,
} from "@/lib/migration-case-store";
import {
  REPORT_PACK_DOCUMENTS,
  type ReportPackDocumentId,
} from "@/lib/report-pack-core";
import { buildReportPackDocument } from "@/lib/report-pack-html";
import { ensurePrivateBucket } from "@/lib/server-json-store";

// =============================================================================
// Report-pack persistence: the four documents are generated once, at publish,
// and stored as immutable snapshots of the report the client actually saw.
// Downloads serve stored bytes: instant, and never at the mercy of a
// serverless renderer cold start.
// =============================================================================

function packPath(caseRow: MigrationCaseRow, proposal: MigrationCaseProposalRow, doc: ReportPackDocumentId) {
  return `${caseRow.public_reference}/report-pack/${proposal.id}/${doc}.pdf`;
}

export async function storeReportPackDocument(
  caseRow: MigrationCaseRow,
  proposal: MigrationCaseProposalRow,
  doc: ReportPackDocumentId,
  bytes: Uint8Array,
): Promise<void> {
  const storage = await ensurePrivateBucket(MIGRATION_CASE_DOCUMENT_BUCKET);
  if (!storage) throw new Error("Private document storage is unavailable.");
  const { error } = await storage.storage
    .from(MIGRATION_CASE_DOCUMENT_BUCKET)
    .upload(packPath(caseRow, proposal, doc), Buffer.from(bytes), {
      contentType: "application/pdf",
      upsert: true,
    });
  if (error) throw new Error(error.message);
}

export async function loadStoredReportPackDocument(
  caseRow: MigrationCaseRow,
  proposal: MigrationCaseProposalRow,
  doc: ReportPackDocumentId,
): Promise<Uint8Array | null> {
  const storage = await ensurePrivateBucket(MIGRATION_CASE_DOCUMENT_BUCKET);
  if (!storage) return null;
  const { data, error } = await storage.storage
    .from(MIGRATION_CASE_DOCUMENT_BUCKET)
    .download(packPath(caseRow, proposal, doc));
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Generate and store the full pack. Called at publish; failures are reported
 * back so the operator can retry, and the download route can still fall back
 * to on-demand generation for any missing artefact.
 */
export async function generateAndStoreReportPack(
  caseRow: MigrationCaseRow,
  proposal: MigrationCaseProposalRow,
): Promise<{ stored: ReportPackDocumentId[]; failed: ReportPackDocumentId[] }> {
  const stored: ReportPackDocumentId[] = [];
  const failed: ReportPackDocumentId[] = [];
  for (const doc of REPORT_PACK_DOCUMENTS) {
    try {
      const { bytes } = await buildReportPackDocument(doc.id, { caseRow, proposal });
      await storeReportPackDocument(caseRow, proposal, doc.id, bytes);
      stored.push(doc.id);
    } catch {
      failed.push(doc.id);
    }
  }
  return { stored, failed };
}

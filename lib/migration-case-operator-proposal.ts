import { createHash, randomUUID } from "node:crypto";
import {
  MIGRATION_CASE_DOCUMENT_BUCKET,
  recordMigrationCaseEvent,
  updateMigrationCase,
  type MigrationCaseBillPackRow,
  type MigrationCaseProposalRow,
  type MigrationCaseRow,
} from "@/lib/migration-case-store";
import { sendCaseLifecycleMessage } from "@/lib/case-lifecycle";
import { createNotification } from "@/lib/notifications";
import { generateAndStoreReportPack } from "@/lib/report-pack-store";
import { ensurePrivateBucket } from "@/lib/server-json-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const OPERATOR_PROPOSAL_VERSION = "operator-2026-08-02.1";

export const MAX_OPERATOR_PROPOSAL_BYTES = 25 * 1024 * 1024;

export type OperatorProposalInput = {
  caseRow: MigrationCaseRow;
  /** Optional: when absent, the platform-generated Migration Report is the document of record. */
  file?: { name: string; type: string; bytes: Uint8Array } | null;
  /** Year-one monthly movement. Positive means the client's bill goes down. */
  yearOneMonthlyDifference: number;
  tenYearDifference: number;
  currentMonthlyCostExVat: number;
  solutionMonthlyCostExVat: number;
  tariffProvider?: string | null;
  tariffNames?: string[];
  blendedTariffExVat?: number | null;
  billingPeriods?: number | null;
  coveredDays?: number | null;
  note?: string | null;
  publishedBy: string;
};

function adminClient() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin configuration is unavailable.");
  return client;
}

function cleanFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 110)
    || "assessment.pdf";
}

/**
 * Mirrors the engine's `preview_snapshot` shape so the client workspace renders
 * an operator-published assessment through exactly the same components.
 */
function buildOperatorPreview(input: OperatorProposalInput, billPack: MigrationCaseBillPackRow | null) {
  const positive = input.yearOneMonthlyDifference > 0 && input.tenYearDifference > 0;
  const gaps: string[] = [];
  if (input.yearOneMonthlyDifference < 0) {
    gaps.push(
      `The complete year-one solution path is R${Math.round(Math.abs(input.yearOneMonthlyDifference)).toLocaleString("en-ZA")} per month above the approved-current utility path.`,
    );
  }
  if (input.tenYearDifference < 0) {
    gaps.push(
      `The disclosed ten-year path is R${Math.round(Math.abs(input.tenYearDifference)).toLocaleString("en-ZA")} above the utility path.`,
    );
  }

  const portfolio = (billPack?.portfolio ?? null) as
    | { uniquePeriodCount?: number; coveredDays?: number }
    | null;

  return {
    documentTitle: "Foundation-1 Migration Assessment",
    businessName: input.caseRow.business_name,
    generatedAt: new Date().toISOString(),
    outcome: positive ? "commercial-case-supported" : "not-currently-recommended",
    currentMonthlyCostExVat: input.currentMonthlyCostExVat,
    completeSolutionMonthlyCostExVat: input.solutionMonthlyCostExVat,
    monthlyDifference: input.yearOneMonthlyDifference,
    yearOneDifferencePct: input.currentMonthlyCostExVat > 0
      ? (input.yearOneMonthlyDifference / input.currentMonthlyCostExVat) * 100
      : 0,
    tenYearDifference: input.tenYearDifference,
    gaps,
    tariff: {
      provider: input.tariffProvider ?? null,
      names: input.tariffNames ?? [],
      blendedTariffExVat: input.blendedTariffExVat ?? null,
    },
    evidence: {
      recognisedBillingPeriods: input.billingPeriods
        ?? portfolio?.uniquePeriodCount
        ?? billPack?.source_file_count
        ?? 0,
      coveredDays: input.coveredDays ?? portfolio?.coveredDays ?? 0,
      confidence: "bill-audited",
      approvedRateMatches: 0,
    },
    message: positive
      ? "Your utility bills have been audited and the assessment supports a positive commercial case. Sign the non-binding EOI to release the full report and proceed."
      : "The completed assessment identifies a commercial or economic gap. Sign the non-binding EOI to release the full report and authorise Foundation-1 to retain and reassess the opportunity without accepting this configuration.",
  };
}

/**
 * Publishes an assessment produced off-platform: stores the document, records the
 * proposal, advances the case and tells the client. One proposal per bill pack,
 * so re-publishing replaces the previous document rather than stacking rows.
 */
export async function publishOperatorProposal(input: OperatorProposalInput) {
  const client = adminClient();

  const { data: packs, error: packError } = await client
    .from("migration_case_bill_packs")
    .select("*")
    .eq("case_id", input.caseRow.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (packError) throw new Error(packError.message);
  const billPack = (packs?.[0] ?? null) as MigrationCaseBillPackRow | null;
  if (!billPack) {
    throw new Error("This case has no utility bill pack yet, so an assessment cannot be published.");
  }

  const storage = await ensurePrivateBucket(MIGRATION_CASE_DOCUMENT_BUCKET);
  if (!storage) throw new Error("Private document storage is unavailable.");

  // One-action publishing: an uploaded assessment is optional. When no file
  // arrives, the platform-generated Migration Report (stored with the pack
  // below) is the document of record and serves the post-EOI download.
  let storagePath: string | null = null;
  let documentName: string | null = null;
  let documentType: string | null = null;
  let documentBytes: Uint8Array | null = null;
  if (input.file) {
    storagePath =
      `${input.caseRow.public_reference}/assessments/${randomUUID()}-${cleanFileName(input.file.name)}`;
    const { error: uploadError } = await storage.storage
      .from(MIGRATION_CASE_DOCUMENT_BUCKET)
      .upload(storagePath, input.file.bytes, {
        upsert: false,
        contentType: input.file.type || "application/pdf",
        cacheControl: "0",
      });
    if (uploadError) throw new Error(`Could not store the assessment: ${uploadError.message}`);
    documentName = input.file.name;
    documentType = input.file.type || "application/pdf";
    documentBytes = input.file.bytes;
  }

  const positive = input.yearOneMonthlyDifference > 0 && input.tenYearDifference > 0;
  const now = new Date().toISOString();
  const row = {
    case_id: input.caseRow.id,
    bill_pack_id: billPack.id,
    status: positive ? "ready" : "not_recommended",
    economically_positive: positive,
    year_one_monthly_difference: input.yearOneMonthlyDifference,
    ten_year_difference: input.tenYearDifference,
    preview_snapshot: buildOperatorPreview(input, billPack),
    proposal_snapshot: {},
    engine_version: OPERATOR_PROPOSAL_VERSION,
    source: "operator",
    document_storage_path: storagePath,
    document_original_name: documentName,
    document_content_type: documentType,
    document_file_size_bytes: documentBytes ? documentBytes.byteLength : null,
    document_sha256: documentBytes
      ? createHash("sha256").update(documentBytes).digest("hex")
      : null,
    published_by: input.publishedBy,
    operator_note: input.note?.trim() || null,
    updated_at: now,
  };

  const { data: proposal, error: proposalError } = await client
    .from("migration_case_proposals")
    .upsert(row, { onConflict: "case_id,bill_pack_id" })
    .select("*")
    .single();
  if (proposalError || !proposal) {
    throw new Error(proposalError?.message ?? "Could not record the assessment.");
  }

  const updatedCase = await updateMigrationCase(input.caseRow.id, {
    stage: positive ? "proposal_ready" : "proposal_not_recommended",
    active_bill_pack_id: billPack.id,
    active_proposal_id: proposal.id,
    proposal_ready_at: now,
  });

  await recordMigrationCaseEvent({
    caseId: input.caseRow.id,
    eventType: positive ? "proposal_completed" : "proposal_not_recommended",
    actorType: "operator",
    detail: positive
      ? "Your bill-audited assessment is complete. The non-binding EOI is now available."
      : "Your bill audit is complete. The assessment identifies a gap and is ready to review.",
    metadata: {
      billPackId: billPack.id,
      proposalId: proposal.id,
      yearOneDifference: input.yearOneMonthlyDifference,
      tenYearDifference: input.tenYearDifference,
      source: "operator",
    },
  }).catch(() => undefined);

  void sendCaseLifecycleMessage(
    updatedCase,
    positive ? "proposal_ready" : "proposal_gap",
    {
      monthlySaving: input.yearOneMonthlyDifference,
      tenYearDifference: input.tenYearDifference,
    },
    // Republishing must reach the client again rather than dedupe to silence.
    `${proposal.id}:${row.document_sha256 ? row.document_sha256.slice(0, 12) : "generated"}`,
  ).catch(() => undefined);

  void createNotification({
    audience: "admin",
    kind: "system",
    title: `${input.caseRow.public_reference}: assessment published`,
    body: `${input.caseRow.business_name} has been notified. Year one ${input.yearOneMonthlyDifference >= 0 ? "saving" : "premium"} R${Math.round(Math.abs(input.yearOneMonthlyDifference)).toLocaleString("en-ZA")}/m.`,
    link: `/admin/migration-cases`,
    email: false,
  }).catch(() => undefined);

  // Generate and store the client document pack as an immutable snapshot of
  // this publish. Non-blocking: the download route falls back to on-demand
  // generation for anything missing.
  void generateAndStoreReportPack(updatedCase, proposal as MigrationCaseProposalRow).catch(
    () => undefined,
  );

  return {
    caseRow: updatedCase,
    proposal: proposal as MigrationCaseProposalRow,
    economicallyPositive: positive,
  };
}

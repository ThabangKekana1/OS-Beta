import { createHash, randomBytes } from "node:crypto";
import {
  buildIndicativeMigrationReport,
  type ElectricitySupplyType,
  type IndicativeMigrationReport,
  type TariffFamilyId,
} from "@/lib/indicative-migration-report";
import {
  KYC_DOCUMENT_TYPES,
  type KycDocumentType,
  type KycFixItItem,
  type KycReadinessItem,
  type KycSelfCheck,
} from "@/lib/migration-case-kyc";
import type { SaPlaceContext } from "@/lib/sa-places";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const MIGRATION_CASE_WORKFLOW_VERSION = "2026-07-11.1";
export const MIGRATION_CASE_DOCUMENT_BUCKET = "migration-case-documents";
export const MIGRATION_CASE_WEBSITE_CLIENT = "foundation-1-website";

export type MigrationCaseStage =
  | "bill_pack_required"
  | "bill_pack_processing"
  | "bill_pack_review"
  | "proposal_ready"
  | "proposal_not_recommended"
  | "eoi_signed"
  | "kyc_ready"
  | "submitted_to_funder"
  | "partner_proposal_ready"
  | "partner_proposal_signed"
  | "kyc_verified"
  | "kyc_handed_off"
  | "term_sheet_issued"
  // Legacy zero-custody stage retained for historical rows only.
  | "kyc_direct_submitted";

export type MigrationCaseRow = {
  id: string;
  created_at: string;
  updated_at: string;
  public_reference: string;
  access_token_hash: string;
  token_hint: string;
  workflow_version: string;
  stage: MigrationCaseStage;
  business_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  preferred_contact_method: "email" | "whatsapp" | "phone";
  site_city: string;
  province: string;
  supply_type: ElectricitySupplyType;
  monthly_spend_ex_vat: number;
  monthly_kwh_unverified: number | null;
  indicative_report: IndicativeMigrationReport;
  source_campaign: string | null;
  referrer: string | null;
  partner_referral_id: string | null;
  active_bill_pack_id: string | null;
  active_proposal_id: string | null;
  active_partner_proposal_id: string | null;
  active_submission_id: string | null;
  proposal_ready_at: string | null;
  eoi_signed_at: string | null;
  partner_proposal_ready_at: string | null;
  partner_proposal_signed_at: string | null;
  direct_kyc_confirmed_at: string | null;
  terms_accepted_at: string | null;
  kyc_self_check: KycSelfCheck | null;
  kyc_readiness_confirmed_at: string | null;
  submitted_to_funder_at: string | null;
  funder_sla_due_at: string | null;
  funder_acknowledged_at: string | null;
  kyc_pack_complete_at: string | null;
  kyc_verified_at: string | null;
  kyc_handed_off_at: string | null;
  term_sheet_issued_at: string | null;
  last_client_seen_at: string | null;
};

export type MigrationCaseKycReadinessRow = {
  id: string;
  case_id: string;
  created_at: string;
  updated_at: string;
  status: "confirmed" | "parked";
  confirmed_by: string;
  attestation_version: string;
  items: KycReadinessItem[];
  fix_it_plan: KycFixItItem[];
  reassess_on: string | null;
  confirmed_at: string | null;
};

export type MigrationCaseKycDocumentRow = {
  id: string;
  case_id: string;
  created_at: string;
  document_type: KycDocumentType;
  original_name: string;
  storage_path: string;
  content_type: string;
  file_size_bytes: number;
  sha256: string;
  status: "received" | "verified" | "rejected";
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  extracted: Record<string, unknown>;
  extraction_version: string | null;
};

export type MigrationCaseSubmissionRow = {
  id: string;
  case_id: string;
  created_at: string;
  updated_at: string;
  channel: "eden_ufms" | "awaken_wheeling" | "both";
  submitted_at: string;
  submitted_by: string;
  batch_reference: string | null;
  manifest: Record<string, unknown>;
  sla_days: number;
  sla_due_at: string;
  acknowledged_at: string | null;
  outcome: "pending" | "proposal_received" | "declined" | "withdrawn";
  outcome_at: string | null;
  notes: string | null;
};

export type MigrationCaseTermSheetRow = {
  id: string;
  case_id: string;
  created_at: string;
  pathway: "eden" | "nightshade" | "awaken";
  source: "funder_direct" | "foundation1";
  issued_at: string;
  deal_value_rands: number;
  reference: string | null;
  notes: string | null;
  original_name: string | null;
  storage_path: string | null;
  content_type: string | null;
  file_size_bytes: number | null;
  sha256: string | null;
  recorded_by: string;
};

export type MigrationCaseBillPackRow = {
  id: string;
  case_id: string;
  created_at: string;
  completed_at: string | null;
  status: "processing" | "ready" | "manual_review" | "failed";
  source_file_count: number;
  recognised_period_count: number;
  covered_days: number;
  portfolio: Record<string, unknown>;
  blockers: string[];
  warnings: string[];
  failure_reason: string | null;
};

export type MigrationCaseProposalRow = {
  id: string;
  case_id: string;
  bill_pack_id: string;
  created_at: string;
  status: "ready" | "not_recommended";
  economically_positive: boolean;
  year_one_monthly_difference: number;
  ten_year_difference: number;
  preview_snapshot: Record<string, unknown>;
  proposal_snapshot: Record<string, unknown>;
  engine_version: string;
};

export type MigrationCaseEoiRow = {
  id: string;
  case_id: string;
  proposal_id: string;
  signed_at: string;
  signer_name: string;
  signer_position: string;
  company_registration_number: string | null;
  declarations_version: string;
  pdf_storage_path: string | null;
  pdf_sha256: string | null;
};

export type MigrationCasePartnerProposalRow = {
  id: string;
  case_id: string;
  created_at: string;
  updated_at: string;
  status: "issued" | "signed" | "direct_kyc_confirmed";
  issued_at: string;
  issued_by: string;
  issued_original_name: string;
  issued_storage_path: string;
  issued_content_type: string;
  issued_file_size_bytes: number;
  issued_sha256: string;
  signed_at: string | null;
  signed_original_name: string | null;
  signed_storage_path: string | null;
  signed_content_type: string | null;
  signed_file_size_bytes: number | null;
  signed_sha256: string | null;
  direct_kyc_confirmed_at: string | null;
  direct_kyc_confirmed_by: string | null;
  direct_kyc_recipient: string | null;
  direct_kyc_attestation_version: string | null;
};

export type CreateMigrationCaseInput = {
  businessName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  preferredContactMethod: "email" | "whatsapp" | "phone";
  siteCity: string;
  province: string;
  supplyType: ElectricitySupplyType;
  monthlySpendExVat: number;
  monthlyKwh?: number | null;
  tariffFamily?: TariffFamilyId | null;
  placeMunicipality?: string | null;
  placeContext?: SaPlaceContext | null;
  sourceCampaign?: string | null;
  referrer?: string | null;
  partnerReferralId?: string | null;
  termsAcceptedAt?: string | null;
  kycSelfCheck?: KycSelfCheck | null;
};

export type MigrationCaseRelations = {
  billPack: MigrationCaseBillPackRow | null;
  proposal: MigrationCaseProposalRow | null;
  eoi: MigrationCaseEoiRow | null;
  partnerProposal: MigrationCasePartnerProposalRow | null;
  kycReadiness: MigrationCaseKycReadinessRow | null;
  kycDocuments: MigrationCaseKycDocumentRow[];
  submission: MigrationCaseSubmissionRow | null;
  termSheets: MigrationCaseTermSheetRow[];
};

function adminClient() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin configuration is unavailable.");
  return client;
}

function cleanText(value: string, maxLength: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function createPublicReference() {
  return `F1-MC-${randomBytes(6).toString("hex").toUpperCase()}`;
}

export function migrationCaseTokenHash(token: string) {
  return createHash("sha256").update(`migration-case:${token}`).digest("hex");
}

export function migrationCaseClientFingerprint(value: string) {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function isMigrationCaseWebsiteRequest(request: Request) {
  return request.headers.get("x-1os-api-client") === MIGRATION_CASE_WEBSITE_CLIENT;
}

export async function recordMigrationCaseEvent(input: {
  caseId: string;
  eventType: string;
  actorType: "client" | "system" | "operator";
  detail: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await adminClient().from("migration_case_events").insert({
    case_id: input.caseId,
    event_type: cleanText(input.eventType, 120),
    actor_type: input.actorType,
    detail: cleanText(input.detail, 1_500),
    metadata: input.metadata ?? {},
  });
  if (error) throw new Error(error.message);
}

export async function createMigrationCase(input: CreateMigrationCaseInput) {
  const report = buildIndicativeMigrationReport({
    monthlySpendExVat: input.monthlySpendExVat,
    monthlyKwh: input.monthlyKwh,
    siteCity: input.siteCity,
    province: input.province,
    supplyType: input.supplyType,
    tariffFamily: input.tariffFamily ?? null,
    placeMunicipality: input.placeMunicipality ?? null,
    placeContext: input.placeContext ?? null,
  });
  const token = randomBytes(32).toString("base64url");
  const tokenHash = migrationCaseTokenHash(token);
  const row: Record<string, unknown> = {
    public_reference: createPublicReference(),
    access_token_hash: tokenHash,
    token_hint: token.slice(-6),
    workflow_version: MIGRATION_CASE_WORKFLOW_VERSION,
    stage: "bill_pack_required" as const,
    business_name: cleanText(input.businessName, 180),
    contact_name: cleanText(input.contactName, 160),
    contact_email: cleanText(input.contactEmail, 220).toLowerCase(),
    contact_phone: cleanText(input.contactPhone, 80),
    preferred_contact_method: input.preferredContactMethod,
    site_city: cleanText(input.siteCity, 120),
    province: cleanText(input.province, 120),
    supply_type: input.supplyType,
    monthly_spend_ex_vat: report.input.monthlySpendExVat,
    monthly_kwh_unverified: report.input.monthlyKwh,
    indicative_report: report,
    source_campaign: input.sourceCampaign ? cleanText(input.sourceCampaign, 180) : null,
    referrer: input.referrer ? cleanText(input.referrer, 500) : null,
    partner_referral_id: input.partnerReferralId ?? null,
  };
  if (input.termsAcceptedAt) row.terms_accepted_at = input.termsAcceptedAt;
  if (input.kycSelfCheck) row.kyc_self_check = input.kycSelfCheck;

  let inserted = await adminClient()
    .from("migration_cases")
    .insert(row)
    .select("*")
    .single();
  if (
    inserted.error
    && /terms_accepted_at|kyc_self_check|partner_referral_id/i.test(inserted.error.message)
    && /column|schema cache/i.test(inserted.error.message)
  ) {
    // Remote schema may not carry the staged custody/distribution migrations yet.
    if (/terms_accepted_at/i.test(inserted.error.message)) delete row.terms_accepted_at;
    if (/kyc_self_check/i.test(inserted.error.message)) delete row.kyc_self_check;
    if (/partner_referral_id/i.test(inserted.error.message)) delete row.partner_referral_id;
    inserted = await adminClient()
      .from("migration_cases")
      .insert(row)
      .select("*")
      .single();
  }
  const { data, error } = inserted;
  if (error || !data) {
    throw new Error(error?.message ?? "Unable to create the migration case.");
  }

  await recordMigrationCaseEvent({
    caseId: data.id,
    eventType: "case_created",
    actorType: "client",
    detail: "Indicative no-bill report completed and secure migration case created.",
    metadata: {
      reportVersion: report.version,
      preliminaryFit: report.preliminaryFit,
      supplyType: report.site.supplyType,
    },
  }).catch(() => undefined);

  return { caseRow: data as MigrationCaseRow, token, report };
}

function validToken(token: string) {
  return /^[A-Za-z0-9_-]{40,60}$/.test(token);
}

export async function findMigrationCaseByToken(token: string) {
  if (!validToken(token)) return null;
  const { data, error } = await adminClient()
    .from("migration_cases")
    .select("*")
    .eq("access_token_hash", migrationCaseTokenHash(token))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  void adminClient()
    .from("migration_cases")
    .update({ last_client_seen_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => undefined);

  return data as MigrationCaseRow;
}

const MISSING_RELATION_PATTERN = /does not exist|schema cache|relation/i;

function tolerantData<T>(result: { data: T | null; error: { message: string } | null }, fallback: T): T {
  if (result.error) {
    if (MISSING_RELATION_PATTERN.test(result.error.message)) return fallback;
    throw new Error(result.error.message);
  }
  return result.data ?? fallback;
}

export async function getMigrationCaseRelations(
  caseRow: Pick<MigrationCaseRow, "id" | "active_bill_pack_id" | "active_proposal_id" | "active_partner_proposal_id" | "active_submission_id">,
): Promise<MigrationCaseRelations> {
  const client = adminClient();
  const [billPackResult, proposalResult, eoiResult, partnerProposalResult, readinessResult, kycDocumentsResult, submissionResult, termSheetsResult] = await Promise.all([
    caseRow.active_bill_pack_id
      ? client
          .from("migration_case_bill_packs")
          .select("*")
          .eq("id", caseRow.active_bill_pack_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    caseRow.active_proposal_id
      ? client
          .from("migration_case_proposals")
          .select("*")
          .eq("id", caseRow.active_proposal_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client
      .from("migration_case_eois")
      .select("id,case_id,proposal_id,signed_at,signer_name,signer_position,company_registration_number,declarations_version,pdf_storage_path,pdf_sha256")
      .eq("case_id", caseRow.id)
      .maybeSingle(),
    caseRow.active_partner_proposal_id
      ? client
          .from("migration_case_partner_proposals")
          .select("*")
          .eq("id", caseRow.active_partner_proposal_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client
      .from("migration_case_kyc_readiness")
      .select("*")
      .eq("case_id", caseRow.id)
      .maybeSingle(),
    client
      .from("migration_case_kyc_documents")
      .select("*")
      .eq("case_id", caseRow.id)
      .order("created_at", { ascending: false }),
    caseRow.active_submission_id
      ? client
          .from("migration_case_submissions")
          .select("*")
          .eq("id", caseRow.active_submission_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client
      .from("migration_case_term_sheets")
      .select("*")
      .eq("case_id", caseRow.id)
      .order("created_at", { ascending: false }),
  ]);

  const partnerProposalError = partnerProposalResult.error
    && MISSING_RELATION_PATTERN.test(partnerProposalResult.error.message)
      ? null
      : partnerProposalResult.error;
  const error = billPackResult.error ?? proposalResult.error ?? eoiResult.error ?? partnerProposalError;
  if (error) throw new Error(error.message);
  return {
    billPack: billPackResult.data as MigrationCaseBillPackRow | null,
    proposal: proposalResult.data as MigrationCaseProposalRow | null,
    eoi: eoiResult.data as MigrationCaseEoiRow | null,
    partnerProposal: partnerProposalResult.data as MigrationCasePartnerProposalRow | null,
    kycReadiness: tolerantData(readinessResult as { data: MigrationCaseKycReadinessRow | null; error: { message: string } | null }, null),
    kycDocuments: tolerantData(kycDocumentsResult as { data: MigrationCaseKycDocumentRow[] | null; error: { message: string } | null }, []),
    submission: tolerantData(submissionResult as { data: MigrationCaseSubmissionRow | null; error: { message: string } | null }, null),
    termSheets: tolerantData(termSheetsResult as { data: MigrationCaseTermSheetRow[] | null; error: { message: string } | null }, []),
  };
}

export async function getMigrationCasePartnerProposal(
  caseRow: Pick<MigrationCaseRow, "id" | "active_partner_proposal_id">,
) {
  if (!caseRow.active_partner_proposal_id) return null;
  const { data, error } = await adminClient()
    .from("migration_case_partner_proposals")
    .select("*")
    .eq("id", caseRow.active_partner_proposal_id)
    .eq("case_id", caseRow.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as MigrationCasePartnerProposalRow | null;
}

/** Latest document per KYC type governs the slot (uploads supersede). */
export function latestKycDocumentsByType(documents: MigrationCaseKycDocumentRow[]) {
  const byType = new Map<KycDocumentType, MigrationCaseKycDocumentRow>();
  for (const document of documents) {
    const existing = byType.get(document.document_type);
    if (!existing || document.created_at > existing.created_at) {
      byType.set(document.document_type, document);
    }
  }
  return byType;
}

export function kycPackStatus(documents: MigrationCaseKycDocumentRow[] | null | undefined) {
  const latest = latestKycDocumentsByType(documents ?? []);
  let received = 0;
  let verified = 0;
  for (const definition of KYC_DOCUMENT_TYPES) {
    const document = latest.get(definition.id);
    if (document && document.status !== "rejected") received += 1;
    if (document && document.status === "verified") verified += 1;
  }
  return {
    latest,
    receivedCount: received,
    verifiedCount: verified,
    requiredCount: KYC_DOCUMENT_TYPES.length,
    complete: received === KYC_DOCUMENT_TYPES.length,
    allVerified: verified === KYC_DOCUMENT_TYPES.length,
  };
}

export function publicMigrationCaseState(
  caseRow: MigrationCaseRow,
  relations: Partial<MigrationCaseRelations> & Pick<MigrationCaseRelations, "billPack" | "proposal" | "eoi">,
) {
  const eoiSigned = Boolean(relations.eoi);
  const proposal = relations.proposal;
  const proposalReleased = eoiSigned;
  const readiness = relations.kycReadiness ?? null;
  const readinessConfirmed = readiness?.status === "confirmed"
    || Boolean(caseRow.kyc_readiness_confirmed_at);
  const pack = kycPackStatus(relations.kycDocuments);
  const termSheets = relations.termSheets ?? [];
  const submission = relations.submission ?? null;
  const handedOff = Boolean(caseRow.kyc_handed_off_at);
  const termSheetIssued = termSheets.length > 0 || Boolean(caseRow.term_sheet_issued_at);
  return {
    ok: true,
    case: {
      reference: caseRow.public_reference,
      stage: caseRow.stage,
      businessName: caseRow.business_name,
      contactName: caseRow.contact_name,
      siteCity: caseRow.site_city,
      province: caseRow.province,
      supplyType: caseRow.supply_type,
      createdAt: caseRow.created_at,
      initialReport: caseRow.indicative_report,
    },
    billPack: relations.billPack
      ? {
          status: relations.billPack.status,
          sourceFileCount: relations.billPack.source_file_count,
          recognisedBillingPeriods: relations.billPack.recognised_period_count,
          requiredBillingPeriods: 6,
          coveredDays: relations.billPack.covered_days,
          blockers: relations.billPack.blockers,
          warnings: relations.billPack.warnings,
          completedAt: relations.billPack.completed_at,
        }
      : null,
    proposal: proposal
      ? {
          status: proposal.status,
          economicallyPositive: proposal.economically_positive,
          generatedAt: proposal.created_at,
          preview: proposal.preview_snapshot,
          unlocked: proposalReleased,
          full: proposalReleased ? proposal.proposal_snapshot : null,
        }
      : null,
    eoi: relations.eoi
      ? {
          signed: true,
          signedAt: relations.eoi.signed_at,
          signedBy: relations.eoi.signer_name,
          signerPosition: relations.eoi.signer_position,
          receiptAvailable: Boolean(relations.eoi.pdf_storage_path),
        }
      : { signed: false },
    kycReadiness: readiness
      ? {
          status: readiness.status,
          confirmedAt: readiness.confirmed_at,
          confirmedBy: readiness.confirmed_by,
          items: readiness.items,
          fixItPlan: readiness.fix_it_plan,
          reassessOn: readiness.reassess_on,
        }
      : null,
    kycPack: {
      requiredCount: pack.requiredCount,
      receivedCount: pack.receivedCount,
      verifiedCount: pack.verifiedCount,
      complete: pack.complete,
      allVerified: pack.allVerified,
      completeAt: caseRow.kyc_pack_complete_at,
      verifiedAt: caseRow.kyc_verified_at,
      handedOffAt: caseRow.kyc_handed_off_at,
      documents: KYC_DOCUMENT_TYPES.map((definition) => {
        const document = pack.latest.get(definition.id);
        return {
          type: definition.id,
          label: definition.label,
          detail: definition.detail,
          status: document ? document.status : "outstanding",
          fileName: document?.original_name ?? null,
          uploadedAt: document?.created_at ?? null,
          reviewNote: document?.status === "rejected" ? document.review_note : null,
        };
      }),
    },
    submission: submission
      ? {
          submittedAt: submission.submitted_at,
          channel: submission.channel,
          acknowledgedAt: submission.acknowledged_at,
          responseDueAt: submission.sla_due_at,
          outcome: submission.outcome,
        }
      : caseRow.submitted_to_funder_at
        ? {
            submittedAt: caseRow.submitted_to_funder_at,
            channel: null,
            acknowledgedAt: caseRow.funder_acknowledged_at,
            responseDueAt: caseRow.funder_sla_due_at,
            outcome: "pending" as const,
          }
        : null,
    partnerProposal: relations.partnerProposal
      ? {
          status: relations.partnerProposal.status,
          issuedAt: relations.partnerProposal.issued_at,
          issuedFileName: relations.partnerProposal.issued_original_name,
          signedAt: relations.partnerProposal.signed_at,
          signedFileName: relations.partnerProposal.signed_original_name,
        }
      : null,
    termSheets: termSheets.map((sheet) => ({
      pathway: sheet.pathway,
      source: sheet.source,
      issuedAt: sheet.issued_at,
      reference: sheet.reference,
    })),
    actions: {
      canUploadCompleteBillPack: !eoiSigned,
      canSignEoi:
        (caseRow.stage === "proposal_ready" || caseRow.stage === "proposal_not_recommended")
        && Boolean(proposal)
        && !eoiSigned,
      canDownloadProposal: proposalReleased && Boolean(proposal),
      canDownloadEoiReceipt: eoiSigned && Boolean(relations.eoi?.pdf_storage_path),
      canConfirmKycReadiness: eoiSigned && !readinessConfirmed && !handedOff && !termSheetIssued,
      canDownloadPartnerProposal: eoiSigned && Boolean(relations.partnerProposal),
      canUploadSignedPartnerProposal:
        eoiSigned
        && Boolean(relations.partnerProposal)
        && !relations.partnerProposal?.signed_at,
      canUploadKycDocuments:
        Boolean(relations.partnerProposal?.signed_at)
        && !handedOff,
    },
  };
}

export async function updateMigrationCase(
  caseId: string,
  patch: Partial<{
    stage: MigrationCaseStage;
    active_bill_pack_id: string | null;
    active_proposal_id: string | null;
    active_partner_proposal_id: string | null;
    active_submission_id: string | null;
    proposal_ready_at: string | null;
    eoi_signed_at: string | null;
    partner_proposal_ready_at: string | null;
    partner_proposal_signed_at: string | null;
    direct_kyc_confirmed_at: string | null;
    kyc_readiness_confirmed_at: string | null;
    submitted_to_funder_at: string | null;
    funder_sla_due_at: string | null;
    funder_acknowledged_at: string | null;
    kyc_pack_complete_at: string | null;
    kyc_verified_at: string | null;
    kyc_handed_off_at: string | null;
    term_sheet_issued_at: string | null;
  }>,
) {
  const { data, error } = await adminClient()
    .from("migration_cases")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", caseId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Unable to update the migration case.");
  return data as MigrationCaseRow;
}

export async function listMigrationCasesForAdmin(limit = 100) {
  const client = adminClient();
  const resolvedLimit = Math.max(1, Math.min(250, limit));
  // select("*") tolerates staged columns that are not on the remote schema
  // yet; absent columns simply do not appear and are defaulted below.
  const { data, error } = await client
    .from("migration_cases")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(resolvedLimit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((item) => ({
    active_partner_proposal_id: null,
    active_submission_id: null,
    partner_proposal_ready_at: null,
    partner_proposal_signed_at: null,
    direct_kyc_confirmed_at: null,
    terms_accepted_at: null,
    kyc_self_check: null,
    kyc_readiness_confirmed_at: null,
    submitted_to_funder_at: null,
    funder_sla_due_at: null,
    funder_acknowledged_at: null,
    kyc_pack_complete_at: null,
    kyc_verified_at: null,
    kyc_handed_off_at: null,
    term_sheet_issued_at: null,
    ...item,
  })) as MigrationCaseRow[];
}

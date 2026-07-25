import { createHash, randomUUID } from "node:crypto";
import { buildF1Proposal, type F1Proposal } from "@/lib/f1-proposal";
import { sendCaseLifecycleMessage } from "@/lib/case-lifecycle";
import { currentiseEskomBill } from "@/lib/eskom-tariff-currentisation";
import {
  MIGRATION_CASE_DOCUMENT_BUCKET,
  MIGRATION_CASE_WORKFLOW_VERSION,
  recordMigrationCaseEvent,
  updateMigrationCase,
  type MigrationCaseBillPackRow,
  type MigrationCaseProposalRow,
  type MigrationCaseRow,
} from "@/lib/migration-case-store";
import { ensurePrivateBucket } from "@/lib/server-json-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  aggregateUtilityBills,
  type BillPortfolio,
  type UtilityBillDocumentAnalysis,
} from "@/lib/utility-bill-analysis";
import { analyseUtilityBillFile } from "@/lib/utility-bill-pdf";
import { ENGINE_CONSTANTS } from "@/lib/pricing-engine";
import { REQUIRED_FORMAL_BILLING_PERIODS } from "@/lib/indicative-migration-report";

export const COMPLETE_BILL_PACK_MIN_FILES = 6;
export const COMPLETE_BILL_PACK_MAX_FILES = 12;
export const COMPLETE_BILL_PACK_MAX_FILE_BYTES = 12 * 1024 * 1024;
export const COMPLETE_BILL_PACK_MAX_TOTAL_BYTES = 72 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "txt"]);

export type BillPackProcessingResult = {
  caseRow: MigrationCaseRow;
  billPack: MigrationCaseBillPackRow;
  proposal: MigrationCaseProposalRow | null;
  analyses: UtilityBillDocumentAnalysis[];
};

type BufferedBillFile = {
  file: File;
  bytes: Uint8Array;
  sha256: string;
  extension: string;
};

function adminClient() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin configuration is unavailable.");
  return client;
}

function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function cleanFileName(name: string) {
  const extension = fileExtension(name);
  const base = name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return `${base || "utility-bill"}.${extension || "bin"}`;
}

function validateFiles(files: File[]) {
  if (files.length < COMPLETE_BILL_PACK_MIN_FILES) {
    return `Submit all six recent bill files together; ${files.length} ${files.length === 1 ? "file was" : "files were"} selected.`;
  }
  if (files.length > COMPLETE_BILL_PACK_MAX_FILES) {
    return `Submit at most ${COMPLETE_BILL_PACK_MAX_FILES} files in one bill pack.`;
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > COMPLETE_BILL_PACK_MAX_TOTAL_BYTES) {
    return "The complete bill pack is larger than 72MB. Export smaller PDFs or clear images and try again.";
  }
  for (const file of files) {
    const extension = fileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return `${file.name} is not supported. Use PDF, PNG, JPG or TXT utility statements.`;
    }
    if (file.size <= 0) return `${file.name} is empty.`;
    if (file.size > COMPLETE_BILL_PACK_MAX_FILE_BYTES) {
      return `${file.name} is larger than 12MB.`;
    }
  }
  return null;
}

async function bufferFiles(files: File[]): Promise<BufferedBillFile[]> {
  const buffered = await Promise.all(files.map(async (file) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      file,
      bytes,
      extension: fileExtension(file.name),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }));
  const hashes = new Set<string>();
  for (const item of buffered) {
    if (hashes.has(item.sha256)) {
      throw new Error(`${item.file.name} duplicates another file in this submission.`);
    }
    hashes.add(item.sha256);
  }
  return buffered;
}

function providerLabel(caseRow: MigrationCaseRow) {
  if (caseRow.supply_type === "eskom-direct") return "Eskom";
  if (caseRow.supply_type === "municipality") return "Municipal";
  if (caseRow.supply_type === "landlord-or-body-corporate") return "Landlord / body corporate";
  return "Unknown";
}

function buildProposalPreview(proposal: F1Proposal, economicallyPositive: boolean) {
  const yearOne = proposal.billAwareEconomics?.yearOne;
  const currentMonthly = yearOne?.currentUtilityCost ?? proposal.profile.monthlySpend;
  const solutionMonthly = yearOne?.solutionCost
    ?? proposal.profile.monthlySpend - proposal.ufmsOption.monthlySaving;
  const monthlyDifference = yearOne?.saving ?? proposal.ufmsOption.monthlySaving;
  const yearOneDifferencePct = yearOne?.savingPercentage ?? proposal.ufmsOption.yearOneSavingPct;
  const gaps: string[] = [];
  if (proposal.commercialFit.belowCommercialMinimum) {
    gaps.push(
      `The bill-backed load supports ${proposal.commercialFit.requiredPvKwp.toFixed(1)} kWp, below the ${proposal.commercialFit.minimumCommercialPvKwp} kWp smallest commercially evidenced package.`,
    );
    gaps.push(
      `The selected package is ${Math.abs(proposal.commercialFit.sizeVariancePct).toFixed(1)}% above the matched load, with ${Math.round(Math.max(0, proposal.commercialFit.generationGapKwh)).toLocaleString("en-ZA")} kWh/month of planning-generation surplus.`,
    );
  }
  if (proposal.commercialFit.aboveStandardMaximum) {
    gaps.push(
      `The bill-backed load exceeds the ${proposal.commercialFit.maximumStandardPvKwp} kWp largest standard package and needs a multi-system or bespoke design.`,
    );
  }
  if (monthlyDifference < 0) {
    gaps.push(
      `The complete year-one solution path is R${Math.round(Math.abs(monthlyDifference)).toLocaleString("en-ZA")} per month above the approved-current utility path.`,
    );
  }
  if (proposal.tenYearComparison.ufmsSaving < 0) {
    gaps.push(
      `The disclosed ten-year path is R${Math.round(Math.abs(proposal.tenYearComparison.ufmsSaving)).toLocaleString("en-ZA")} above the utility path.`,
    );
  }
  return {
    documentTitle: proposal.documentTitle,
    businessName: proposal.businessName,
    generatedAt: proposal.generatedAt,
    outcome: economicallyPositive ? "commercial-case-supported" : "not-currently-recommended",
    currentMonthlyCostExVat: currentMonthly,
    completeSolutionMonthlyCostExVat: solutionMonthly,
    monthlyDifference,
    yearOneDifferencePct,
    tenYearDifference: proposal.tenYearComparison.ufmsSaving,
    system: proposal.ufmsOption.sizing,
    commercialFit: proposal.commercialFit,
    gaps,
    tariff: {
      provider: proposal.billAudit?.provider ?? proposal.site.registeredUtilityProvider,
      names: proposal.billAudit?.tariffNames ?? [],
      blendedTariffExVat: proposal.billAudit?.blendedTariffExVat ?? proposal.profile.blendedTariff,
    },
    evidence: {
      recognisedBillingPeriods: proposal.billAudit?.uniquePeriodCount ?? 0,
      coveredDays: proposal.billAudit?.coveredDays ?? 0,
      confidence: proposal.billAudit?.confidence ?? "planning",
      approvedRateMatches: proposal.billAudit?.currentTariff?.matchedPeriodCount ?? 0,
    },
    message: economicallyPositive
      ? "The complete bill history supports a positive pre-engineering commercial case. Sign the non-binding EOI to release the full proposal and proceed."
      : "The completed proposal identifies a commercial or economic gap. Sign the non-binding EOI to release the full gap report and authorize Foundation-1 to retain and reassess the opportunity without accepting this configuration.",
  };
}

async function markPackFailed(
  caseRow: MigrationCaseRow,
  billPackId: string,
  message: string,
) {
  await adminClient()
    .from("migration_case_bill_packs")
    .update({
      status: "failed",
      failure_reason: message.slice(0, 1_500),
      completed_at: new Date().toISOString(),
    })
    .eq("id", billPackId);
  await updateMigrationCase(caseRow.id, {
    stage: "bill_pack_review",
    active_bill_pack_id: billPackId,
    active_proposal_id: null,
    proposal_ready_at: null,
  });
}

async function uploadAndAnalyse(
  caseRow: MigrationCaseRow,
  billPackId: string,
  buffered: BufferedBillFile[],
) {
  const client = await ensurePrivateBucket(MIGRATION_CASE_DOCUMENT_BUCKET);
  if (!client) throw new Error("Private document storage is unavailable.");

  return Promise.all(buffered.map(async (item) => {
    const fileId = randomUUID();
    const storagePath = `${caseRow.public_reference}/${billPackId}/${fileId}-${cleanFileName(item.file.name)}`;
    const { error: uploadError } = await client.storage
      .from(MIGRATION_CASE_DOCUMENT_BUCKET)
      .upload(storagePath, item.bytes, {
        upsert: false,
        contentType: item.file.type || (item.extension === "pdf" ? "application/pdf" : "application/octet-stream"),
        cacheControl: "0",
      });
    if (uploadError) throw new Error(`Could not store ${item.file.name}: ${uploadError.message}`);

    const stableBytes = Uint8Array.from(item.bytes);
    const analysis = await analyseUtilityBillFile(
      {
        name: item.file.name,
        type: item.file.type,
        arrayBuffer: async () => stableBytes.buffer,
      },
      { sourceHash: item.sha256 },
    );

    return {
      id: fileId,
      case_id: caseRow.id,
      bill_pack_id: billPackId,
      original_name: item.file.name.slice(0, 240),
      storage_path: storagePath,
      content_type: item.file.type || "application/octet-stream",
      file_size_bytes: item.bytes.byteLength,
      sha256: item.sha256,
      analysis,
    };
  }));
}

function buildPortfolio(analyses: UtilityBillDocumentAnalysis[]): BillPortfolio {
  const currentisedBills = analyses.map((analysis) => ({
    sourceHash: analysis.sourceHash,
    ...currentiseEskomBill(analysis),
  }));
  return aggregateUtilityBills(analyses, undefined, { currentisedBills });
}

/**
 * What the client still owes before the audit can run.
 *
 * The audit itself remains atomic — six periods are aggregated together and no
 * proposal is ever produced from a partial history. This type exists so the
 * client can see the pile growing instead of holding everything back until the
 * whole set is in hand.
 */
export type BillCollectionProgress = {
  filesHeld: number;
  recognisedPeriods: number;
  requiredPeriods: number;
  coveredDays: number;
  periodStart: string | null;
  periodEnd: string | null;
  outstanding: string[];
  readyForAudit: boolean;
};

function describeProgress(
  portfolio: BillPortfolio,
  filesHeld: number,
): BillCollectionProgress {
  const missingPeriods = Math.max(
    0,
    REQUIRED_FORMAL_BILLING_PERIODS - portfolio.uniquePeriodCount,
  );
  const outstanding: string[] = [];
  if (missingPeriods > 0) {
    outstanding.push(
      `${missingPeriods} more billing ${missingPeriods === 1 ? "period" : "periods"} needed.`,
    );
  }
  const unreadable = filesHeld - portfolio.recognisedDocumentCount;
  if (unreadable > 0) {
    outstanding.push(
      `${unreadable} uploaded ${unreadable === 1 ? "file was" : "files were"} not readable as a utility bill.`,
    );
  }
  if (portfolio.duplicateDocumentCount > 0) {
    outstanding.push(
      `${portfolio.duplicateDocumentCount} ${portfolio.duplicateDocumentCount === 1 ? "file covers" : "files cover"} a period already supplied.`,
    );
  }
  return {
    filesHeld,
    recognisedPeriods: portfolio.uniquePeriodCount,
    requiredPeriods: REQUIRED_FORMAL_BILLING_PERIODS,
    coveredDays: portfolio.coveredDays,
    periodStart: portfolio.periodStart,
    periodEnd: portfolio.periodEnd,
    outstanding,
    readyForAudit: portfolio.uniquePeriodCount >= REQUIRED_FORMAL_BILLING_PERIODS,
  };
}

function validateIncomingFiles(files: File[], alreadyHeld: number) {
  if (!files.length) return "Select at least one utility bill file.";
  if (alreadyHeld + files.length > COMPLETE_BILL_PACK_MAX_FILES) {
    return `A bill pack holds at most ${COMPLETE_BILL_PACK_MAX_FILES} files; ${alreadyHeld} ${alreadyHeld === 1 ? "is" : "are"} already stored.`;
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > COMPLETE_BILL_PACK_MAX_TOTAL_BYTES) {
    return "That upload is larger than 72MB. Export smaller PDFs or clear images and try again.";
  }
  for (const file of files) {
    const extension = fileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return `${file.name} is not supported. Use PDF, PNG, JPG or TXT utility statements.`;
    }
    if (file.size <= 0) return `${file.name} is empty.`;
    if (file.size > COMPLETE_BILL_PACK_MAX_FILE_BYTES) {
      return `${file.name} is larger than 12MB.`;
    }
  }
  return null;
}

/** The pack currently accepting files, if the case has one. */
async function findOpenBillPack(caseId: string) {
  const { data } = await adminClient()
    .from("migration_case_bill_packs")
    .select("*")
    .eq("case_id", caseId)
    .in("status", ["collecting", "manual_review"])
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] as MigrationCaseBillPackRow | undefined) ?? null;
}

async function loadPackAnalyses(billPackId: string) {
  const { data } = await adminClient()
    .from("migration_case_bill_files")
    .select("sha256, analysis")
    .eq("bill_pack_id", billPackId);
  const rows = (data ?? []) as { sha256: string; analysis: UtilityBillDocumentAnalysis }[];
  return {
    hashes: new Set(rows.map((row) => row.sha256)),
    analyses: rows.map((row) => row.analysis),
  };
}

/**
 * Runs the atomic audit over every analysis held in a pack and, when the
 * evidence supports it, produces the bill-audited proposal.
 *
 * Shared by both collection paths: a single complete submission, and files
 * gathered progressively over several visits. The audit is identical either
 * way — a partial history never yields a proposal.
 */
async function runBillPackAudit(
  caseRow: MigrationCaseRow,
  billPackId: string,
  analyses: UtilityBillDocumentAnalysis[],
): Promise<BillPackProcessingResult> {
  const portfolio = buildPortfolio(analyses);
  const portfolioReady = portfolio.formalProposalReady
    && Boolean(portfolio.averageMonthlySpendExVat)
    && Boolean(portfolio.averageMonthlyKwh)
    && Boolean(portfolio.designBasis);
  const completedAt = new Date().toISOString();
  const packStatus = portfolioReady ? "ready" : "manual_review";
  const { data: updatedPack, error: packError } = await adminClient()
    .from("migration_case_bill_packs")
    .update({
      status: packStatus,
      completed_at: completedAt,
      recognised_period_count: portfolio.uniquePeriodCount,
      covered_days: portfolio.coveredDays,
      source_file_count: analyses.length,
      portfolio,
      blockers: portfolio.blockers,
      warnings: portfolio.warnings,
      failure_reason: null,
    })
    .eq("id", billPackId)
    .select("*")
    .single();
  if (packError || !updatedPack) {
    throw new Error(packError?.message ?? "Unable to save the bill audit.");
  }

  if (!portfolioReady) {
    const updatedCase = await updateMigrationCase(caseRow.id, {
      stage: "bill_pack_review",
      active_bill_pack_id: billPackId,
      active_proposal_id: null,
      proposal_ready_at: null,
    });
    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: "bill_pack_needs_review",
      actorType: "system",
      detail: portfolio.blockers[0] ?? "The complete bill pack needs manual review.",
      metadata: {
        billPackId,
        recognisedBillingPeriods: portfolio.uniquePeriodCount,
        coveredDays: portfolio.coveredDays,
        blockers: portfolio.blockers,
      },
    }).catch(() => undefined);
    // The client is told exactly what is missing, rather than discovering a
    // stalled case on their next visit. Keyed per pack and per recognition
    // result, so a second distinct failure notifies again.
    void sendCaseLifecycleMessage(
      updatedCase,
      "bill_pack_needs_attention",
      { blockers: portfolio.blockers },
      `${billPackId}:${portfolio.uniquePeriodCount}`,
    ).catch(() => undefined);
    return {
      caseRow: updatedCase,
      billPack: updatedPack as MigrationCaseBillPackRow,
      proposal: null,
      analyses,
    };
  }

  const proposal = buildF1Proposal({
    businessName: caseRow.business_name,
    contactName: caseRow.contact_name,
    clientProfileId: caseRow.public_reference,
    siteCity: caseRow.site_city,
    province: caseRow.province,
    utilityProvider: providerLabel(caseRow),
    monthlySpend: portfolio.averageMonthlySpendExVat!,
    monthlyKwh: portfolio.averageMonthlyKwh!,
    minimumPvKwp: ENGINE_CONSTANTS.verifiedCommercialMinimumPvKwp,
    billPortfolio: portfolio,
    generatedAt: completedAt,
  });
  const yearOneDifference = proposal.billAwareEconomics?.yearOne.saving
    ?? proposal.ufmsOption.monthlySaving;
  const tenYearDifference = proposal.tenYearComparison.ufmsSaving;
  const economicallyPositive = yearOneDifference > 0 && tenYearDifference > 0;
  const proposalStatus = economicallyPositive ? "ready" : "not_recommended";
  const { data: createdProposal, error: proposalError } = await adminClient()
    .from("migration_case_proposals")
    .insert({
      case_id: caseRow.id,
      bill_pack_id: billPackId,
      status: proposalStatus,
      economically_positive: economicallyPositive,
      year_one_monthly_difference: yearOneDifference,
      ten_year_difference: tenYearDifference,
      preview_snapshot: buildProposalPreview(proposal, economicallyPositive),
      proposal_snapshot: proposal,
      engine_version: MIGRATION_CASE_WORKFLOW_VERSION,
    })
    .select("*")
    .single();
  if (proposalError || !createdProposal) {
    throw new Error(proposalError?.message ?? "Unable to save the completed proposal.");
  }

  const updatedCase = await updateMigrationCase(caseRow.id, {
    stage: economicallyPositive ? "proposal_ready" : "proposal_not_recommended",
    active_bill_pack_id: billPackId,
    active_proposal_id: createdProposal.id,
    proposal_ready_at: completedAt,
  });
  await recordMigrationCaseEvent({
    caseId: caseRow.id,
    eventType: economicallyPositive ? "proposal_completed" : "proposal_not_recommended",
    actorType: "system",
    detail: economicallyPositive
      ? "Bill-audited proposal completed; the post-proposal EOI is now available."
      : "Bill audit completed; the modelled complete solution cost is not below the utility path.",
    metadata: {
      billPackId,
      proposalId: createdProposal.id,
      yearOneDifference,
      tenYearDifference,
    },
  }).catch(() => undefined);

  // The emotional peak of the journey: the client gathered six bills and the
  // audit resolved into a real proposal. Previously this produced silence.
  void sendCaseLifecycleMessage(
    updatedCase,
    economicallyPositive ? "proposal_ready" : "proposal_gap",
    { monthlySaving: yearOneDifference, tenYearDifference },
  ).catch(() => undefined);

  return {
    caseRow: updatedCase,
    billPack: updatedPack as MigrationCaseBillPackRow,
    proposal: createdProposal as MigrationCaseProposalRow,
    analyses,
  };
}

/**
 * Re-runs the audit over the files already stored against a case.
 *
 * Nothing is re-uploaded. This is the operator's escape from bill_pack_review
 * after a tariff-catalogue extension or parser fix makes a previously
 * unrecognised pack readable.
 */
export async function reauditMigrationBillPack(
  caseRow: MigrationCaseRow,
  actor: string,
): Promise<BillPackProcessingResult> {
  if (caseRow.stage === "eoi_signed") {
    throw new Error("This proposal has already been released and its supporting bill pack is locked.");
  }
  const billPackId = caseRow.active_bill_pack_id;
  if (!billPackId) throw new Error("This case has no stored files to re-audit.");

  const { analyses } = await loadPackAnalyses(billPackId);
  if (!analyses.length) throw new Error("This case has no stored files to re-audit.");

  await recordMigrationCaseEvent({
    caseId: caseRow.id,
    eventType: "bill_pack_reaudited",
    actorType: "operator",
    detail: `${actor} re-ran the audit over ${analyses.length} stored files.`,
    metadata: { billPackId, fileCount: analyses.length },
  }).catch(() => undefined);

  return runBillPackAudit(caseRow, billPackId, analyses);
}

/**
 * Hands a stalled pack back to the client so they can add or replace files.
 * The client is told what is still needed rather than left to guess.
 */
export async function reopenMigrationBillPack(
  caseRow: MigrationCaseRow,
  actor: string,
  note: string,
): Promise<BillCollectionProgress> {
  if (caseRow.stage === "eoi_signed") {
    throw new Error("This proposal has already been released and its supporting bill pack is locked.");
  }
  const billPackId = caseRow.active_bill_pack_id;
  if (!billPackId) throw new Error("This case has no stored files to reopen.");

  const { analyses } = await loadPackAnalyses(billPackId);
  const portfolio = buildPortfolio(analyses);
  const progress = describeProgress(portfolio, analyses.length);

  await adminClient()
    .from("migration_case_bill_packs")
    .update({ status: "collecting", completed_at: null, failure_reason: null })
    .eq("id", billPackId);

  const updatedCase = await updateMigrationCase(caseRow.id, {
    stage: "bill_pack_required",
    active_proposal_id: null,
    proposal_ready_at: null,
  });

  await recordMigrationCaseEvent({
    caseId: caseRow.id,
    eventType: "bill_pack_reopened",
    actorType: "operator",
    detail: note
      ? `${actor} reopened the bill pack: ${note}`
      : `${actor} reopened the bill pack for further files.`,
    metadata: { billPackId, filesHeld: analyses.length },
  }).catch(() => undefined);

  void sendCaseLifecycleMessage(
    updatedCase,
    "bill_pack_needs_attention",
    { blockers: note ? [note, ...progress.outstanding] : progress.outstanding },
    `reopen:${billPackId}:${Date.now()}`,
  ).catch(() => undefined);

  return progress;
}

/**
 * Adds utility bills to a case as the client finds them.
 *
 * The narrowest gate in the funnel used to be an all-or-nothing upload: six to
 * twelve files, one browser session, no partial save. A client holding five
 * bills was simply blocked, and an interrupted upload started over.
 *
 * Files now accumulate in an open pack. Each upload re-runs recognition across
 * everything held so far and reports honest progress. The moment six billing
 * periods are recognised the atomic audit runs exactly as before.
 */
export async function addMigrationBillFiles(
  caseRow: MigrationCaseRow,
  files: File[],
): Promise<BillPackProcessingResult & { progress: BillCollectionProgress }> {
  if (caseRow.stage === "eoi_signed") {
    throw new Error("This proposal has already been released and its supporting bill pack is locked.");
  }

  const openPack = await findOpenBillPack(caseRow.id);
  const existing = openPack
    ? await loadPackAnalyses(openPack.id)
    : { hashes: new Set<string>(), analyses: [] as UtilityBillDocumentAnalysis[] };

  const validationError = validateIncomingFiles(files, existing.analyses.length);
  if (validationError) throw new Error(validationError);

  const buffered = (await bufferFiles(files)).filter((item) => !existing.hashes.has(item.sha256));
  if (!buffered.length) {
    throw new Error(
      files.length === 1
        ? "That bill is already in your pack."
        : "Those bills are already in your pack.",
    );
  }

  let billPackId = openPack?.id ?? null;
  if (!billPackId) {
    billPackId = randomUUID();
    const { error: createError } = await adminClient()
      .from("migration_case_bill_packs")
      .insert({
        id: billPackId,
        case_id: caseRow.id,
        status: "collecting",
        source_file_count: buffered.length,
      });
    if (createError) {
      throw new Error(createError.message ?? "Unable to open the bill pack.");
    }
  }

  await updateMigrationCase(caseRow.id, { active_bill_pack_id: billPackId });

  try {
    const storedFiles = await uploadAndAnalyse(caseRow, billPackId, buffered);
    const { error: fileInsertError } = await adminClient()
      .from("migration_case_bill_files")
      .insert(storedFiles);
    if (fileInsertError) throw new Error(fileInsertError.message);

    const analyses = [...existing.analyses, ...storedFiles.map((file) => file.analysis)];
    const portfolio = buildPortfolio(analyses);
    const progress = describeProgress(portfolio, analyses.length);

    // Enough periods to audit: run the same atomic audit as a single submission.
    if (progress.readyForAudit) {
      await updateMigrationCase(caseRow.id, { stage: "bill_pack_processing" });
      await recordMigrationCaseEvent({
        caseId: caseRow.id,
        eventType: "complete_bill_pack_submitted",
        actorType: "client",
        detail: `${analyses.length} utility-bill files gathered; six billing periods recognised.`,
        metadata: { billPackId, progressive: true },
      }).catch(() => undefined);
      const audited = await runBillPackAudit(caseRow, billPackId, analyses);
      return { ...audited, progress };
    }

    // Still gathering. Hold the pack open and report honest progress.
    const { data: updatedPack, error: packError } = await adminClient()
      .from("migration_case_bill_packs")
      .update({
        status: "collecting",
        source_file_count: analyses.length,
        recognised_period_count: portfolio.uniquePeriodCount,
        covered_days: portfolio.coveredDays,
        portfolio,
        blockers: [],
        warnings: portfolio.warnings,
        failure_reason: null,
      })
      .eq("id", billPackId)
      .select("*")
      .single();
    if (packError || !updatedPack) {
      throw new Error(packError?.message ?? "Unable to save the bill pack.");
    }

    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: "bill_files_added",
      actorType: "client",
      detail: `${storedFiles.length} file${storedFiles.length === 1 ? "" : "s"} added; ${portfolio.uniquePeriodCount} of ${REQUIRED_FORMAL_BILLING_PERIODS} billing periods recognised.`,
      metadata: {
        billPackId,
        filesHeld: analyses.length,
        recognisedPeriods: portfolio.uniquePeriodCount,
      },
    }).catch(() => undefined);

    return {
      caseRow,
      billPack: updatedPack as MigrationCaseBillPackRow,
      proposal: null,
      analyses,
      progress,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bill upload failed.";
    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: "bill_pack_processing_failed",
      actorType: "system",
      detail: message,
      metadata: { billPackId },
    }).catch(() => undefined);
    throw error;
  }
}

export async function processCompleteMigrationBillPack(
  caseRow: MigrationCaseRow,
  files: File[],
): Promise<BillPackProcessingResult> {
  const validationError = validateFiles(files);
  if (validationError) throw new Error(validationError);
  if (caseRow.stage === "eoi_signed") {
    throw new Error("This proposal has already been released and its supporting bill pack is locked.");
  }

  const buffered = await bufferFiles(files);
  const billPackId = randomUUID();
  const startedAt = new Date().toISOString();
  const { data: createdPack, error: createError } = await adminClient()
    .from("migration_case_bill_packs")
    .insert({
      id: billPackId,
      case_id: caseRow.id,
      status: "processing",
      source_file_count: files.length,
    })
    .select("*")
    .single();
  if (createError || !createdPack) {
    throw new Error(createError?.message ?? "Unable to open the bill-pack submission.");
  }

  await updateMigrationCase(caseRow.id, {
    stage: "bill_pack_processing",
    active_bill_pack_id: billPackId,
    active_proposal_id: null,
    proposal_ready_at: null,
  });
  await recordMigrationCaseEvent({
    caseId: caseRow.id,
    eventType: "complete_bill_pack_submitted",
    actorType: "client",
    detail: `${files.length} utility-bill files submitted together for validation.`,
    metadata: { billPackId, submittedAt: startedAt },
  }).catch(() => undefined);

  try {
    const storedFiles = await uploadAndAnalyse(caseRow, billPackId, buffered);
    const { error: fileInsertError } = await adminClient()
      .from("migration_case_bill_files")
      .insert(storedFiles);
    if (fileInsertError) throw new Error(fileInsertError.message);

    const analyses = storedFiles.map((file) => file.analysis);
    return await runBillPackAudit(caseRow, billPackId, analyses);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bill-pack processing failed.";
    await markPackFailed(caseRow, billPackId, message).catch(() => undefined);
    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: "bill_pack_processing_failed",
      actorType: "system",
      detail: message,
      metadata: { billPackId },
    }).catch(() => undefined);
    throw error;
  }
}

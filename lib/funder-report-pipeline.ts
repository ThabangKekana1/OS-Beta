/**
 * FOUNDATION-1 FUNDER-REPORT PIPELINE — storage + delivery wrapper.
 *
 * `lib/funder-report.ts` is the pure orchestrator (read -> verify -> map);
 * this module adds the side effects:
 *
 *   - gathers the case's uploaded partner proposals + verified bill pack,
 *   - builds the FunderReport,
 *   - persists `funder-report/report.json` (INTERNAL, operator desk) and
 *     `funder-report/client-savings-data.json` (deck schema) in the case
 *     bucket,
 *   - when ready (or operator-confirmed): renders the jsPDF artifact and
 *     publishes it through the EXISTING publishOperatorProposal() seam, so
 *     the client dashboard shows it with zero new client UI, then restores
 *     the case stage (publishing must not regress a post-EOI case),
 *   - when held: records the timeline event + admin notification so the
 *     operator confirm API can resolve it.
 *
 * OFFLINE DECK (full R3F migration-path deck from the same JSON):
 *   1. Write the JSON as a client data file:
 *        presentations/src/decks/clients/<case>.ts
 *        (export default <ClientSavingsData JSON> satisfies ClientSavingsData,
 *         register in presentations/src/decks/index.ts via makeMigrationDeck)
 *   2. cd presentations && node tools/capture.mjs --deck <id>
 *   3. cd presentations && /usr/bin/python3 tools/bind_pdf.py <id>
 */
import { parseFunderProposalText } from "@/lib/document-reader";
import {
  buildFunderReport,
  deriveBillFactsFromPortfolio,
  type FunderReport,
  type FunderReportCorrections,
} from "@/lib/funder-report";
import { deriveFunderReportCorrectionEntries } from "@/lib/intelligence/learning-loop";
import {
  persistEngineCalibration,
  persistReaderCorrections,
} from "@/lib/intelligence/learning-store";
import { buildFunderReportPdf } from "@/lib/funder-report-pdf";
import { publishOperatorProposal } from "@/lib/migration-case-operator-proposal";
import {
  MIGRATION_CASE_DOCUMENT_BUCKET,
  recordMigrationCaseEvent,
  updateMigrationCase,
  type MigrationCaseBillPackRow,
  type MigrationCasePartnerProposalRow,
  type MigrationCaseRow,
  type MigrationCaseStage,
} from "@/lib/migration-case-store";
import { createNotification } from "@/lib/notifications";
import { createPdfParser } from "@/lib/pdf-parse-runtime";
import { downloadPrivateObject, writeJsonObject } from "@/lib/server-json-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { BillPortfolio } from "@/lib/utility-bill-analysis";

const REPORT_PATH = (reference: string) => `${reference}/funder-report/report.json`;
const SAVINGS_DATA_PATH = (reference: string) => `${reference}/funder-report/client-savings-data.json`;

/** Stages that must never be regressed by re-publishing the assessment seam. */
const POST_PROPOSAL_STAGES: ReadonlySet<MigrationCaseStage> = new Set([
  "eoi_signed",
  "kyc_ready",
  "submitted_to_funder",
  "partner_proposal_ready",
  "partner_proposal_signed",
  "kyc_verified",
  "kyc_handed_off",
  "term_sheet_issued",
  "kyc_direct_submitted",
]);

function adminClient() {
  const client = getSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin configuration is unavailable.");
  return client;
}

async function pdfTextLayer(bytes: Uint8Array): Promise<string> {
  try {
    const parser = await createPdfParser(Uint8Array.from(bytes));
    try {
      const result = await parser.getText();
      return result.text ?? "";
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } catch {
    return "";
  }
}

export type FunderReportSources = {
  ufms: { text: string; fileName: string } | null;
  wheeling: { text: string; fileName: string } | null;
  skipped: string[];
};

/**
 * Download every issued partner proposal on the case and split them by
 * dialect (newest first wins per dialect). Scanned/image-only uploads are
 * reported as skipped — the operator desk handles those.
 */
export async function gatherFunderProposalSources(
  caseRow: MigrationCaseRow,
): Promise<FunderReportSources> {
  const client = adminClient();
  const { data: rows, error } = await client
    .from("migration_case_partner_proposals")
    .select("*")
    .eq("case_id", caseRow.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const sources: FunderReportSources = { ufms: null, wheeling: null, skipped: [] };
  for (const row of (rows ?? []) as MigrationCasePartnerProposalRow[]) {
    if (sources.ufms && sources.wheeling) break;
    const blob = await downloadPrivateObject(
      MIGRATION_CASE_DOCUMENT_BUCKET,
      row.issued_storage_path,
    );
    if (!blob) {
      sources.skipped.push(`${row.issued_original_name}: stored file missing`);
      continue;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = await pdfTextLayer(bytes);
    if (text.trim().length < 200) {
      sources.skipped.push(`${row.issued_original_name}: no text layer (scan?) — operator desk`);
      continue;
    }
    const dialect = parseFunderProposalText(text).dialect;
    if (dialect === "ufms-p4l" && !sources.ufms) {
      sources.ufms = { text, fileName: row.issued_original_name };
    } else if (dialect === "wheeling" && !sources.wheeling) {
      sources.wheeling = { text, fileName: row.issued_original_name };
    } else if (dialect === "unknown") {
      sources.skipped.push(`${row.issued_original_name}: unrecognised proposal dialect`);
    }
  }
  return sources;
}

async function latestBillPortfolio(caseRow: MigrationCaseRow): Promise<BillPortfolio> {
  const client = adminClient();
  const { data: packs, error } = await client
    .from("migration_case_bill_packs")
    .select("*")
    .eq("case_id", caseRow.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const pack = (packs?.[0] ?? null) as MigrationCaseBillPackRow | null;
  if (!pack || !pack.portfolio) {
    throw new Error("This case has no verified bill pack; the funder report needs the bill audit.");
  }
  return pack.portfolio as unknown as BillPortfolio;
}

async function persistReport(caseRow: MigrationCaseRow, report: FunderReport) {
  await writeJsonObject(MIGRATION_CASE_DOCUMENT_BUCKET, REPORT_PATH(caseRow.public_reference), report);
  await writeJsonObject(
    MIGRATION_CASE_DOCUMENT_BUCKET,
    SAVINGS_DATA_PATH(caseRow.public_reference),
    report.clientSavingsData,
  );
}

/** Load the stored report (operator desk / admin confirm screen). */
export async function getStoredFunderReport(caseRow: MigrationCaseRow): Promise<FunderReport | null> {
  const blob = await downloadPrivateObject(
    MIGRATION_CASE_DOCUMENT_BUCKET,
    REPORT_PATH(caseRow.public_reference),
  );
  if (!blob) return null;
  try {
    return JSON.parse(await blob.text()) as FunderReport;
  } catch {
    return null;
  }
}

/** Choose the option whose numbers headline the published assessment. */
function headlineOption(report: FunderReport) {
  const { combined, ufms, wheeling } = report.options;
  if (combined.present && combined.monthlyCost !== null) return { name: "combined", ...combined };
  if (ufms.present && ufms.monthlyCost !== null) return { name: "ufms", ...ufms };
  return { name: "wheeling", ...wheeling };
}

async function publishFunderReport(
  caseRow: MigrationCaseRow,
  report: FunderReport,
  publishedBy: string,
) {
  const pdf = buildFunderReportPdf(report);
  const chosen = headlineOption(report);
  const ten = report.clientSavingsData.tenYear;
  const chosenSeries = chosen.name === "combined" ? ten.combined : chosen.name === "ufms" ? ten.ufms : ten.wheeling;
  const tenYearDifference = ten.eskom.length === 10 && chosenSeries.length === 10
    ? ten.eskom[9] - chosenSeries[9]
    : (chosen.monthlySaving ?? 0) * 120;

  const priorStage = caseRow.stage;
  const published = await publishOperatorProposal({
    caseRow,
    file: { name: pdf.filename, type: "application/pdf", bytes: pdf.bytes },
    yearOneMonthlyDifference: chosen.monthlySaving ?? 0,
    tenYearDifference,
    currentMonthlyCostExVat: report.options.eskomMonthly,
    solutionMonthlyCostExVat: chosen.monthlyCost ?? report.options.eskomMonthly,
    tariffProvider: report.billFacts.provider,
    tariffNames: report.billFacts.tariffNames,
    blendedTariffExVat: report.billFacts.monthlyKwh > 0
      ? Math.round((report.billFacts.monthlySpendExVat / report.billFacts.monthlyKwh) * 10000) / 10000
      : null,
    billingPeriods: report.billFacts.billsCount,
    note: `Funder proposal report (${report.version}): explains the returned funder paper (${[
      report.options.ufms.present ? "Nedbank UFMS" : null,
      report.options.wheeling.present ? "Green Share wheeling" : null,
    ].filter(Boolean).join(" + ")}) against the audited Eskom baseline. Headline option: ${chosen.name}.`,
    publishedBy,
  });

  // The operator-proposal seam advances the stage to proposal_ready; a case
  // that is already past the EOI must keep its real stage.
  if (POST_PROPOSAL_STAGES.has(priorStage)) {
    await updateMigrationCase(caseRow.id, { stage: priorStage });
  }

  await recordMigrationCaseEvent({
    caseId: caseRow.id,
    eventType: "funder_report_published",
    actorType: "system",
    detail: "The funder proposal report is on your dashboard: both returned proposals explained against your audited Eskom baseline, individually and combined.",
    metadata: {
      version: report.version,
      headlineOption: chosen.name,
      monthlySaving: chosen.monthlySaving,
      tenYearDifference,
      savingsDataPath: SAVINGS_DATA_PATH(caseRow.public_reference),
      operatorConfirmed: report.operatorConfirmed,
    },
  }).catch(() => undefined);

  return { report, pdf, proposal: published.proposal };
}

export type RunFunderReportResult = {
  report: FunderReport;
  published: boolean;
  skipped: string[];
};

/**
 * Full pipeline for a case: gather uploads + bill facts, build the report,
 * persist the artifacts and either publish (ready) or hold for the operator.
 * Called fire-and-forget from the partner-proposal upload route and
 * explicitly from the admin funder-report API.
 */
export async function runFunderReportPipeline(input: {
  caseRow: MigrationCaseRow;
  triggeredBy: string;
  corrections?: FunderReportCorrections | null;
  operatorConfirmed?: boolean;
}): Promise<RunFunderReportResult> {
  const { caseRow } = input;
  const portfolio = await latestBillPortfolio(caseRow);
  const billFacts = deriveBillFactsFromPortfolio(portfolio);
  const sources = await gatherFunderProposalSources(caseRow);
  if (!sources.ufms && !sources.wheeling) {
    throw new Error(
      `No machine-readable funder proposal on this case yet${sources.skipped.length > 0 ? ` (${sources.skipped.join("; ")})` : ""}.`,
    );
  }

  const siteLocation = [caseRow.site_city, caseRow.province].filter(Boolean).join(", ");
  const report = buildFunderReport({
    caseReference: caseRow.public_reference,
    businessName: caseRow.business_name,
    siteLocation,
    billFacts,
    ufms: sources.ufms,
    wheeling: sources.wheeling,
    corrections: input.corrections ?? null,
    operatorConfirmed: input.operatorConfirmed ?? false,
  });

  await persistReport(caseRow, report);

  // LEARNING LOOP: ledger every clone-engine cross-check (their stated
  // number vs our prediction). Guarded — reporting never breaks on this.
  try {
    await persistEngineCalibration({ report });
  } catch {
    /* learning loop must never break the pipeline */
  }

  // FOUNDER RULE (2026-08-08): every report is approved by the operator before
  // the client sees it. Auto-publish only when FUNDER_REPORT_AUTOPUBLISH=1 is
  // set explicitly AND the report verified clean; the default is always-hold.
  const autoPublish = process.env.FUNDER_REPORT_AUTOPUBLISH === "1";
  if (report.status === "ready" && (autoPublish || input.operatorConfirmed)) {
    await publishFunderReport(caseRow, report, input.triggeredBy);
    return { report, published: true, skipped: sources.skipped };
  }
  if (report.status === "ready") {
    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: "funder_report_hold",
      actorType: "system",
      detail: "Funder report verified clean and held for operator approval before release.",
      metadata: { holdReasons: ["awaiting operator approval"], verified: true },
    });
    await createNotification({
      audience: "admin",
      kind: "system",
      title: `${caseRow.public_reference}: funder report ready for your approval`,
      body: `${caseRow.business_name}: report verified clean; approve to release it to the client.`,
      link: `/admin/migration-cases`,
      email: false,
    }).catch(() => undefined);
    return { report, published: false, skipped: sources.skipped };
  }

  await recordMigrationCaseEvent({
    caseId: caseRow.id,
    eventType: "funder_report_hold",
    actorType: "system",
    detail: "Funder report generated but HELD for operator confirmation before anything reaches the client.",
    metadata: {
      version: report.version,
      holdReasons: report.holdReasons,
      crosschecks: report.crosschecks.map((row) => ({
        source: row.source,
        field: row.field,
        deviationPct: row.deviationPct,
        pass: row.pass,
      })),
    },
  }).catch(() => undefined);

  await createNotification({
    audience: "admin",
    kind: "system",
    title: `${caseRow.public_reference}: funder report needs your confirmation`,
    body: `${caseRow.business_name}: ${report.holdReasons[0] ?? "extraction needs review"}${report.holdReasons.length > 1 ? ` (+${report.holdReasons.length - 1} more)` : ""}`,
    link: `/admin/migration-cases`,
    email: false,
  }).catch(() => undefined);

  return { report, published: false, skipped: sources.skipped };
}

/**
 * Operator confirm: apply corrections to the extracted fields (or accept
 * them as-is) and force publication. The corrected values become the
 * funder-stated figures on the report; the correction set is recorded on
 * the report object and the timeline.
 */
export async function confirmFunderReport(input: {
  caseRow: MigrationCaseRow;
  corrections?: FunderReportCorrections | null;
  confirmedBy: string;
}): Promise<RunFunderReportResult> {
  // LEARNING LOOP: the previously stored report holds the machine's original
  // extractions; the operator's corrections against them are labelled
  // examples. Guarded — capture must never block the confirm.
  try {
    const previous = await getStoredFunderReport(input.caseRow);
    const entries = deriveFunderReportCorrectionEntries(previous, input.corrections);
    await persistReaderCorrections({
      caseReference: input.caseRow.public_reference,
      source: "funder_report",
      entries,
      correctedBy: input.confirmedBy,
      context: { reportVersion: previous?.version ?? null },
    });
  } catch {
    /* learning loop must never break the confirm path */
  }
  const result = await runFunderReportPipeline({
    caseRow: input.caseRow,
    triggeredBy: input.confirmedBy,
    corrections: input.corrections ?? null,
    operatorConfirmed: true,
  });
  await recordMigrationCaseEvent({
    caseId: input.caseRow.id,
    eventType: "funder_report_confirmed",
    actorType: "operator",
    detail: `Funder report extractions confirmed by ${input.confirmedBy}${input.corrections ? " with corrections" : ""}.`,
    metadata: { corrections: input.corrections ?? {} },
  }).catch(() => undefined);
  return result;
}

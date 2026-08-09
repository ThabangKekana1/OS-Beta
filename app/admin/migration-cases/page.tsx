import type { Metadata } from "next";
import { MigrationCaseBoard, type CaseBoardRow, type CaseBoardInitialFilters } from "@/components/admin/MigrationCaseBoard";
import { migrationCaseMoney } from "@/components/admin/migration-case-presentation";
import type { DocumentSignatureRow } from "@/lib/document-signing";
import { listDocumentSignaturesForCases } from "@/lib/document-signing-store";
import { readFunnelSummary } from "@/lib/funnel-summary";
import {
  kycPackStatus,
  listMigrationCasesForAdmin,
  type MigrationCaseKycDocumentRow,
  type MigrationCaseKycReadinessRow,
  type MigrationCaseRow,
  type MigrationCaseSubmissionRow,
  type MigrationCaseTermSheetRow,
} from "@/lib/migration-case-store";
import { classifySubmissionReadiness } from "@/lib/submission-queue";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildDailyWorklist, summariseDealBook, type WorklistCaseInput } from "@/lib/worklist";

export const metadata: Metadata = {
  title: "Migration Cases | 1OS Admin",
  description: "The case board: every migration case, its one next action, and the alerts that matter.",
};

// This operator surface reads live Supabase state and may reference columns
// introduced by migrations that are intentionally staged locally before remote
// rollout. Never execute it during the production build.
export const dynamic = "force-dynamic";

async function tolerantIn<T>(table: string, column: string, values: string[], select = "*"): Promise<T[]> {
  if (!values.length) return [];
  const client = getSupabaseAdminClient();
  if (!client) return [];
  const { data, error } = await client.from(table).select(select).in(column, values);
  if (error) {
    if (/does not exist|schema cache|relation/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as T[];
}

type FunderReportEventRow = { case_id: string; event_type: string; created_at: string };

/**
 * LEVEL 1 — THE BOARD. One dense row per case, constraint-priority order,
 * built for one operator running hundreds of cases. All derivation happens
 * here (server, one fetch pass); the client component only filters/sorts.
 * Row click opens LEVEL 2, the case file, at /admin/migration-cases/[id].
 */
export default async function AdminMigrationCasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialFilters: CaseBoardInitialFilters = {
    q: typeof params.q === "string" ? params.q : undefined,
    stage: typeof params.stage === "string" ? params.stage : undefined,
    quick: typeof params.quick === "string" ? params.quick : undefined,
    sort: typeof params.sort === "string" ? params.sort : undefined,
    dir: typeof params.dir === "string" ? params.dir : undefined,
  };

  const cases = (await listMigrationCasesForAdmin(250)) as MigrationCaseRow[];
  const funnel = await readFunnelSummary(30).catch(() => null);
  const caseIds = cases.map((item) => item.id);

  const [readinessRows, kycDocumentRows, submissionRows, termSheetRows, signatureRows, reportEventRows] = await Promise.all([
    tolerantIn<MigrationCaseKycReadinessRow>("migration_case_kyc_readiness", "case_id", caseIds),
    tolerantIn<MigrationCaseKycDocumentRow>("migration_case_kyc_documents", "case_id", caseIds),
    tolerantIn<MigrationCaseSubmissionRow>("migration_case_submissions", "case_id", caseIds),
    tolerantIn<MigrationCaseTermSheetRow>("migration_case_term_sheets", "case_id", caseIds),
    listDocumentSignaturesForCases(caseIds).catch(() => [] as DocumentSignatureRow[]),
    tolerantIn<FunderReportEventRow>("migration_case_events", "case_id", caseIds, "case_id,event_type,created_at")
      .then((rows) => rows.filter((row) => row.event_type.startsWith("funder_report_")))
      .catch(() => [] as FunderReportEventRow[]),
  ]);

  const readinessByCase = new Map(readinessRows.map((row) => [row.case_id, row]));
  const documentsByCase = new Map<string, MigrationCaseKycDocumentRow[]>();
  for (const row of kycDocumentRows) {
    const list = documentsByCase.get(row.case_id) ?? [];
    list.push(row);
    documentsByCase.set(row.case_id, list);
  }
  const submissionsByCase = new Map<string, MigrationCaseSubmissionRow>();
  for (const row of submissionRows) {
    const existing = submissionsByCase.get(row.case_id);
    if (!existing || row.created_at > existing.created_at) submissionsByCase.set(row.case_id, row);
  }
  // Latest in-platform signing record per case (rows arrive newest-first).
  const signaturesByCase = new Map<string, DocumentSignatureRow>();
  for (const row of signatureRows) {
    if (!signaturesByCase.has(row.case_id)) signaturesByCase.set(row.case_id, row);
  }
  // A held funder report: the newest funder_report_* event is a hold
  // (published/confirmed events clear the flag).
  const latestReportEvent = new Map<string, FunderReportEventRow>();
  for (const row of reportEventRows) {
    const existing = latestReportEvent.get(row.case_id);
    if (!existing || row.created_at > existing.created_at) latestReportEvent.set(row.case_id, row);
  }

  // Server component: one clock read per request is stable for the response.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  // The one next action, owner and constraint order come from lib/worklist —
  // the same derivation the Daily Worklist page uses. Never duplicated here.
  const worklistInputs: WorklistCaseInput[] = cases.map((item) => {
    const readiness = readinessByCase.get(item.id) ?? null;
    const submission = submissionsByCase.get(item.id) ?? null;
    const signature = signaturesByCase.get(item.id) ?? null;
    return {
      caseId: item.id,
      reference: item.public_reference,
      businessName: item.business_name,
      stage: item.stage,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      proposalReadyAt: item.proposal_ready_at,
      eoiSignedAt: item.eoi_signed_at,
      kycReadinessConfirmedAt: item.kyc_readiness_confirmed_at,
      submittedToFunderAt: item.submitted_to_funder_at,
      kycPackCompleteAt: item.kyc_pack_complete_at,
      kycVerifiedAt: item.kyc_verified_at,
      kycHandedOffAt: item.kyc_handed_off_at,
      termSheetIssuedAt: item.term_sheet_issued_at,
      partnerProposalReadyAt: item.partner_proposal_ready_at,
      partnerProposalSignedAt: item.partner_proposal_signed_at,
      hasBillPack: Boolean(item.active_bill_pack_id),
      hasProposal: Boolean(item.active_proposal_id),
      readinessStatus: readiness?.status ?? null,
      readinessReassessOn: readiness?.reassess_on ?? null,
      signedFunderProposalAt: signature?.status === "submitted_by_client"
        ? (signature.submitted_at ?? signature.signed_at)
        : null,
      submissionPending: submission?.outcome === "pending",
      submissionSubmittedAt: submission?.submitted_at ?? null,
      submissionSlaDays: submission?.sla_days ?? null,
      submissionAcknowledgedAt: submission?.acknowledged_at ?? null,
      kycPackComplete: kycPackStatus(documentsByCase.get(item.id) ?? []).complete,
    } satisfies WorklistCaseInput;
  });
  const worklistRows = buildDailyWorklist(worklistInputs, now);
  const worklistByCase = new Map(worklistRows.map((row, index) => [row.caseId, { row, priority: index }]));

  const boardRows: CaseBoardRow[] = cases.map((item) => {
    const derived = worklistByCase.get(item.id)!;
    const readiness = readinessByCase.get(item.id) ?? null;
    const submission = submissionsByCase.get(item.id) ?? null;
    const signature = signaturesByCase.get(item.id) ?? null;
    const submitted = Boolean(item.submitted_to_funder_at || submission);
    const closed = Boolean(item.kyc_handed_off_at || item.term_sheet_issued_at || item.stage === "kyc_direct_submitted");
    const classified = !submitted && !closed
      ? classifySubmissionReadiness({
          stage: item.stage,
          eoiSignedAt: item.eoi_signed_at,
          kycReadinessConfirmedAt: item.kyc_readiness_confirmed_at,
          readinessParked: readiness?.status === "parked",
          signedFunderProposalAt: signature?.status === "submitted_by_client"
            ? (signature.submitted_at ?? signature.signed_at)
            : null,
          submittedToFunderAt: item.submitted_to_funder_at,
          hasBillPack: Boolean(item.active_bill_pack_id),
          hasProposal: Boolean(item.active_proposal_id),
        })
      : null;
    const sla = derived.row.sla;
    const reportEvent = latestReportEvent.get(item.id) ?? null;
    const blocked = item.stage === "bill_pack_review" || readiness?.status === "parked";
    return {
      caseId: item.id,
      reference: item.public_reference,
      businessName: item.business_name,
      siteCity: item.site_city,
      province: item.province,
      stage: item.stage,
      daysInStage: derived.row.daysInStage,
      nextAction: derived.row.nextAction,
      owner: derived.row.owner,
      priority: derived.priority,
      slaDayNumber: sla ? sla.dayNumber : null,
      slaPhase: sla ? sla.phase : null,
      slaRisk: Boolean(sla && (sla.escalationDue || sla.breachDue || sla.daysRemaining <= 1)),
      blocked,
      blockedReason: item.stage === "bill_pack_review"
        ? "Bill pack in review — evidence blockers must be cleared."
        : readiness?.status === "parked"
          ? `KYC readiness parked${readiness.reassess_on ? ` — reassess ${readiness.reassess_on}` : ""}.`
          : (classified?.blockedReason || null),
      heldReport: reportEvent?.event_type === "funder_report_hold",
      newToday: new Date(item.created_at).getTime() >= todayStart.getTime(),
      selectable: classified && classified.tier !== "blocked" ? classified.tier : null,
      lastActivityAt: item.updated_at ?? item.created_at,
    } satisfies CaseBoardRow;
  });

  const dealBook = summariseDealBook(termSheetRows.map((sheet) => ({
    dealValueRands: Number(sheet.deal_value_rands),
    status: sheet.status ?? null,
  })));
  const stats: [string, string][] = [
    [String(cases.length), "Cases"],
    [String(cases.filter((item) => item.active_proposal_id).length), "Proposals"],
    [String(cases.filter((item) => item.eoi_signed_at).length), "EOIs"],
    [dealBook.count ? migrationCaseMoney(dealBook.totalRands) : "R0", `Deal book · ${dealBook.count}${dealBook.signedCount ? ` (${dealBook.signedCount} signed)` : ""}`],
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <header className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="line-label">Migration cases · the board</p>
            <h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] text-white md:text-3xl">
              Every case. One next action. Nothing rots quietly.
            </h1>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {stats.map(([value, label]) => (
              <div key={label} className="min-w-20 rounded-[0.9rem] border border-white/10 bg-black/25 px-3 py-2.5 text-center">
                <strong className="block text-lg font-medium text-white">{value}</strong>
                <span className="mt-0.5 block text-[0.54rem] uppercase tracking-[0.18em] text-white/34">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <MigrationCaseBoard rows={boardRows} initialFilters={initialFilters} />

      {funnel ? (
        <details className="rounded-[1.4rem] border border-white/10 bg-black/30 p-4 md:p-5">
          <summary className="cursor-pointer text-[0.62rem] uppercase tracking-[0.2em] text-white/34">
            Conversion funnel · last {funnel.days} days · {funnel.capturedEmails} report{funnel.capturedEmails === 1 ? "" : "s"} emailed
            {funnel.belowThreshold ? ` · ${funnel.belowThreshold} below threshold` : ""}
          </summary>
          <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {funnel.steps.map((step) => (
              <div key={step.key} className="rounded-[1rem] border border-white/10 bg-white/[0.02] p-3.5">
                <strong className="block text-lg font-medium text-white">{step.count}</strong>
                <span className="mt-1 block text-[0.56rem] uppercase leading-4 tracking-[0.14em] text-white/34">{step.label}</span>
                {step.conversion !== null ? (
                  <span className={`mt-1.5 inline-block text-[0.56rem] ${
                    step.conversion >= 0.5 ? "text-emerald-200/70" : step.conversion >= 0.2 ? "text-amber-200/70" : "text-rose-200/70"
                  }`}>
                    {Math.round(step.conversion * 100)}% of previous
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

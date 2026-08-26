import type { Metadata } from "next";
import type { DocumentSignatureRow } from "@/lib/document-signing";
import { listDocumentSignaturesForCases } from "@/lib/document-signing-store";
import {
  kycPackStatus,
  listMigrationCasesForAdmin,
  type MigrationCaseKycDocumentRow,
  type MigrationCaseKycReadinessRow,
  type MigrationCaseRow,
  type MigrationCaseSubmissionRow,
  type MigrationCaseTermSheetRow,
} from "@/lib/migration-case-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  buildDailyWorklist,
  summariseDealBook,
  type WorklistCaseInput,
  type WorklistRow,
} from "@/lib/worklist";

export const metadata: Metadata = {
  title: "Daily Worklist | 1-MI Admin",
  description: "Constraint-sorted operator worklist: what unblocks a submission today.",
};

// Live operator surface over staged-schema-tolerant reads; never prerender.
export const dynamic = "force-dynamic";

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(value);
}

function stageLabel(stage: string) {
  if (stage === "kyc_ready") return "Submission Ready";
  if (stage === "submitted_to_funder") return "Submitted To Funder";
  if (stage === "kyc_direct_submitted") return "KYC Direct (Legacy)";
  return stage.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function tolerantIn<T>(table: string, column: string, values: string[]): Promise<T[]> {
  if (!values.length) return [];
  const client = getSupabaseAdminClient();
  if (!client) return [];
  const { data, error } = await client.from(table).select("*").in(column, values);
  if (error) {
    if (/does not exist|schema cache|relation/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as T[];
}

const GROUPS: { group: 1 | 2 | 3; title: string; hint: string; tone: string }[] = [
  {
    group: 1,
    title: "1 · Blocking a submission slot",
    hint: "The drum. Live SLA clocks, packs ready to fire, verified packs awaiting handoff. Doc 06 §3.2: protect the constraint first.",
    tone: "border-rose-300/22 bg-rose-300/[0.04]",
  },
  {
    group: 2,
    title: "2 · One action from bankable",
    hint: "The buffer. Exactly one step — an EOI signature or the readiness confirmation — separates these from the queue.",
    tone: "border-amber-300/22 bg-amber-300/[0.04]",
  },
  {
    group: 3,
    title: "3 · Everything else",
    hint: "Subordinate work, ordered by staleness so nothing rots quietly.",
    tone: "border-white/10 bg-white/[0.02]",
  },
];

function ownerTone(owner: WorklistRow["owner"]) {
  if (owner === "Foundation-1") return "border-lime-300/25 bg-lime-300/8 text-lime-100";
  if (owner === "Funder") return "border-cyan-300/25 bg-cyan-300/8 text-cyan-100";
  return "border-white/14 bg-white/[0.04] text-white/60";
}

/**
 * The Daily Worklist — the operator's landing screen (doc 06 §5.3 item 1).
 * Pure derivation from existing case data via `buildDailyWorklist`; this page
 * only loads rows and renders. Karman runs the whole book from here.
 */
export default async function AdminWorklistPage() {
  const cases = (await listMigrationCasesForAdmin(200)) as MigrationCaseRow[];
  const caseIds = cases.map((item) => item.id);

  const [readinessRows, kycDocumentRows, submissionRows, termSheetRows, signatureRows] = await Promise.all([
    tolerantIn<MigrationCaseKycReadinessRow>("migration_case_kyc_readiness", "case_id", caseIds),
    tolerantIn<MigrationCaseKycDocumentRow>("migration_case_kyc_documents", "case_id", caseIds),
    tolerantIn<MigrationCaseSubmissionRow>("migration_case_submissions", "case_id", caseIds),
    tolerantIn<MigrationCaseTermSheetRow>("migration_case_term_sheets", "case_id", caseIds),
    listDocumentSignaturesForCases(caseIds).catch(() => [] as DocumentSignatureRow[]),
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
  const signaturesByCase = new Map<string, DocumentSignatureRow>();
  for (const row of signatureRows) {
    if (!signaturesByCase.has(row.case_id)) signaturesByCase.set(row.case_id, row);
  }

  const inputs: WorklistCaseInput[] = cases.map((item) => {
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

  // Server component: one clock read per request is stable for the response.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const rows = buildDailyWorklist(inputs, now);
  const dealBook = summariseDealBook(termSheetRows.map((sheet) => ({
    dealValueRands: Number(sheet.deal_value_rands),
    status: sheet.status ?? null,
  })));
  const group1 = rows.filter((row) => row.group === 1).length;

  return (
    <div className="mx-auto max-w-[1300px] space-y-6">
      <header className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.35)] md:p-8">
        <p className="line-label">Daily worklist</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-3xl font-medium tracking-[-0.05em] text-white md:text-5xl">What unblocks a submission today.</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/48">
              Constraint order: first the drum, then the buffer, then everything else. Each row carries the one next action and its owner — work the list from the top.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              [String(group1), "Drum items"],
              [String(rows.length), "Open cases"],
              [dealBook.count ? money(dealBook.totalRands) : "R0", `Deal book · ${dealBook.count}${dealBook.signedCount ? ` (${dealBook.signedCount} signed)` : ""}`],
            ].map(([value, label]) => (
              <div key={String(label)} className="min-w-28 rounded-[1rem] border border-white/10 bg-black/25 p-4 text-center">
                <strong className="block text-xl font-medium text-white md:text-2xl">{value}</strong>
                <span className="mt-1 block text-[0.58rem] uppercase tracking-[0.2em] text-white/34">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {GROUPS.map(({ group, title, hint, tone }) => {
        const groupRows = rows.filter((row) => row.group === group);
        return (
          <section key={group} className={`rounded-[2rem] border p-5 md:p-6 ${tone}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-white/80">{title}</h2>
              <span className="text-lg font-semibold text-white/70">{groupRows.length}</span>
            </div>
            <p className="mt-1 text-[0.68rem] leading-5 text-white/38">{hint}</p>
            {groupRows.length ? (
              <div className="mt-4 overflow-hidden rounded-[1.2rem] border border-white/10 bg-black/30">
                <div className="hidden grid-cols-[1.15fr_0.7fr_0.4fr_1.5fr_0.45fr] gap-4 border-b border-white/10 px-5 py-3 text-[0.58rem] uppercase tracking-[0.18em] text-white/30 lg:grid">
                  <span>Case</span><span>Stage</span><span>Days in stage</span><span>Next action</span><span>Owner</span>
                </div>
                <ul className="divide-y divide-white/8">
                  {groupRows.map((row) => (
                    <li key={row.caseId}>
                      <a
                        href={`/admin/migration-cases#case-${row.caseId}`}
                        className="grid gap-2 px-5 py-3.5 transition hover:bg-white/[0.03] lg:grid-cols-[1.15fr_0.7fr_0.4fr_1.5fr_0.45fr] lg:items-center lg:gap-4"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-white/88">{row.businessName}</span>
                          <span className="mt-0.5 block font-mono text-[0.6rem] text-white/34">{row.reference}</span>
                        </span>
                        <span className="text-[0.66rem] uppercase tracking-[0.12em] text-white/48">{stageLabel(row.stage)}</span>
                        <span className={`text-sm font-medium ${row.daysInStage >= 14 ? "text-rose-200" : row.daysInStage >= 7 ? "text-amber-200" : "text-white/70"}`}>{row.daysInStage}d</span>
                        <span className="text-[0.72rem] leading-5 text-white/62">{row.nextAction}</span>
                        <span><span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.56rem] uppercase tracking-[0.13em] ${ownerTone(row.owner)}`}>{row.owner}</span></span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 text-[0.68rem] text-white/30">Nothing here right now.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

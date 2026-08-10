import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AssessmentPublishControl } from "@/components/admin/AssessmentPublishControl";
import { CaseFilesPanel } from "@/components/admin/CaseFilesPanel";
import { FunderReportControl, type FunderReportView } from "@/components/admin/FunderReportControl";
import {
  BillPackReviewControl,
  KycReviewControl,
  SubmissionControl,
  TermSheetControl,
  type MigrationCaseOpsData,
} from "@/components/admin/MigrationCaseOps";
import { SlaRow, type SubmissionSlaItem } from "@/components/admin/SubmissionQueue";
import { PartnerProposalIssueControl } from "@/components/admin/PartnerProposalIssueControl";
import {
  migrationCaseDate,
  migrationCaseMoney,
  migrationCaseOwnerTone,
  migrationCaseStageLabel,
  migrationCaseStageTone,
} from "@/components/admin/migration-case-presentation";
import {
  buildChargeTreatmentMatrix,
  type ChargeTreatmentMatrix,
  type OnsiteTreatment,
  type WheelingTreatment,
} from "@/lib/charge-treatment";
import { documentSignatureStatusLabel, type DocumentSignatureRow } from "@/lib/document-signing";
import { listDocumentSignaturesForCases } from "@/lib/document-signing-store";
import { getStoredFunderReport } from "@/lib/funder-report-pipeline";
import { evaluateKycGate, kycPlanFromStoredItems } from "@/lib/migration-case-kyc";
import {
  getMigrationCaseRelations,
  kycPackStatus,
  MIGRATION_CASE_DOCUMENT_BUCKET,
  type MigrationCaseBillPackRow,
  type MigrationCaseRow,
  type MigrationCaseSubmissionRow,
} from "@/lib/migration-case-store";
import { buildSlaEscalationDraft, slaClock } from "@/lib/submission-queue";
import { isUtilityBillDocumentAnalysis } from "@/lib/utility-bill-analysis";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildDailyWorklist, type WorklistCaseInput } from "@/lib/worklist";

export const metadata: Metadata = {
  title: "Case File | 1OS Admin",
  description: "The full case file: intake, bills, proposal, EOI, KYC custody, submission and timeline.",
};

// Live operator surface over staged-schema-tolerant reads; never prerender.
export const dynamic = "force-dynamic";

type CaseEventRow = {
  id: string;
  created_at: string;
  event_type: string;
  actor_type: "client" | "system" | "operator";
  detail: string;
};

/** Load one case by id; tolerant of staged columns absent on the remote schema. */
async function loadCase(id: string): Promise<MigrationCaseRow | null> {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from("migration_cases").select("*").eq("id", id).maybeSingle();
    if (error || !data) return null;
    return {
      client_profile: null,
      profile_completed_at: null,
      nda_signed_at: null,
      active_nda_id: null,
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
      ...data,
    } as MigrationCaseRow;
  } catch {
    return null;
  }
}

async function loadEvents(caseId: string): Promise<CaseEventRow[]> {
  const client = getSupabaseAdminClient();
  if (!client) return [];
  const { data, error } = await client
    .from("migration_case_events")
    .select("id,created_at,event_type,actor_type,detail")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) return [];
  return (data ?? []) as CaseEventRow[];
}

/** Latest submission for the case (the active_submission_id pointer can lag). */
async function loadLatestSubmission(caseId: string): Promise<MigrationCaseSubmissionRow | null> {
  const client = getSupabaseAdminClient();
  if (!client) return null;
  const { data, error } = await client
    .from("migration_case_submissions")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return null;
  return ((data ?? [])[0] ?? null) as MigrationCaseSubmissionRow | null;
}

/** Short-lived signed URL for a stored object (read-only; 10 minutes). */
async function signedUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const client = getSupabaseAdminClient();
  if (!client) return null;
  const { data } = await client.storage.from(MIGRATION_CASE_DOCUMENT_BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

function Section({
  number,
  title,
  status,
  children,
}: {
  number: number;
  title: string;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.4rem] border border-white/10 bg-black/30 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2.5 text-[0.68rem] font-medium uppercase tracking-[0.18em] text-white/64">
          <span className="inline-flex size-5 items-center justify-center rounded-md border border-white/14 bg-white/[0.04] font-mono text-[0.6rem] text-white/50">{number}</span>
          {title}
        </h2>
        {status ? <div className="flex flex-wrap items-center gap-2">{status}</div> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StatusChip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[0.56rem] font-semibold uppercase tracking-[0.14em] ${tone}`}>
      {children}
    </span>
  );
}

const CHIP_DONE = "border-emerald-300/40 bg-emerald-300/10 text-emerald-200";
const CHIP_WAIT = "border-white/14 bg-white/[0.04] text-white/40";
const CHIP_WARN = "border-amber-300/40 bg-amber-300/10 text-amber-200";

/**
 * Charge-treatment matrix off the audited bill pack. Returns null whenever the
 * pack holds no parsed charge lines, so the section renders nothing rather
 * than an empty table.
 */
function chargeTreatmentFromBillPack(billPack: MigrationCaseBillPackRow | null): ChargeTreatmentMatrix | null {
  const periods = (billPack?.portfolio as { periods?: unknown } | undefined)?.periods;
  if (!Array.isArray(periods)) return null;
  const analyses = periods.filter(isUtilityBillDocumentAnalysis);
  const lines = analyses.flatMap((analysis) => analysis.chargeLines ?? []);
  if (lines.length === 0) return null;
  return buildChargeTreatmentMatrix(lines, { periodCount: analyses.length });
}

const ONSITE_TREATMENT_LABEL: Record<OnsiteTreatment, string> = {
  "removed-pro-rata": "Removed pro-rata",
  conditional: "Conditional",
  retained: "Stays",
};

const WHEELING_TREATMENT_LABEL: Record<WheelingTreatment, string> = {
  replaced: "Replaced",
  retained: "Stays",
  conditional: "Conditional",
};

function treatmentTone(treatment: OnsiteTreatment | WheelingTreatment) {
  if (treatment === "removed-pro-rata" || treatment === "replaced") return "text-emerald-200/85";
  if (treatment === "conditional") return "text-amber-200/85";
  return "text-white/34";
}

/**
 * The answer to the question that stalls every client meeting: line by line,
 * which charge does the on-site system take away and which does wheeling take
 * away. Read directly off the client's own audited invoices.
 */
function ChargeTreatmentTable({ matrix }: { matrix: ChargeTreatmentMatrix }) {
  const { totals, perKwh } = matrix;
  const share = (value: number) => `${(value * 100).toFixed(1)}%`;
  const rate = (value: number) => `R${value.toFixed(4)}`;
  const buckets = (["peak", "standard", "off-peak"] as const)
    .map((bucket) => ({ bucket, data: perKwh.buckets[bucket] }))
    .filter((entry) => entry.data);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="text-[0.56rem] uppercase tracking-[0.14em] text-white/30">What each product removes</p>
      <p className="mt-1 text-[0.66rem] leading-5 text-white/44">
        Per month across {matrix.lines.reduce((sum, line) => sum + line.sourceLineCount, 0)} audited invoice lines.
        On-site removes every charge billed per kWh; wheeling replaces the energy commodity only.
      </p>
      <table className="mt-2.5 w-full border-collapse text-[0.66rem]">
        <thead>
          <tr className="text-[0.56rem] uppercase tracking-[0.12em] text-white/28">
            <th className="border-b border-white/8 py-1 text-left font-normal">Charge</th>
            <th className="border-b border-white/8 py-1 text-right font-normal">R/month</th>
            <th className="border-b border-white/8 py-1 pl-3 text-left font-normal">On-site</th>
            <th className="border-b border-white/8 py-1 pl-3 text-left font-normal">Wheeling</th>
          </tr>
        </thead>
        <tbody>
          {matrix.lines.map((line) => (
            <tr key={`${line.category}-${line.touBucket ?? "all"}`} className="align-top">
              <td className="border-b border-white/5 py-1 pr-2 text-white/62">{line.label}</td>
              <td className="border-b border-white/5 py-1 text-right tabular-nums text-white/62">
                {migrationCaseMoney(line.monthlyAmount)}
              </td>
              <td className={`border-b border-white/5 py-1 pl-3 ${treatmentTone(line.onsite.treatment)}`}>
                {ONSITE_TREATMENT_LABEL[line.onsite.treatment]}
              </td>
              <td className={`border-b border-white/5 py-1 pl-3 ${treatmentTone(line.wheeling.treatment)}`}>
                {WHEELING_TREATMENT_LABEL[line.wheeling.treatment]}
              </td>
            </tr>
          ))}
          <tr className="text-white/72">
            <td className="py-1.5 pr-2 font-medium">Bill total</td>
            <td className="py-1.5 text-right tabular-nums font-medium">{migrationCaseMoney(totals.billMonthly)}</td>
            <td className="py-1.5 pl-3 tabular-nums">
              {migrationCaseMoney(totals.onsiteReachable)} · {share(totals.onsiteReachableShare)}
            </td>
            <td className="py-1.5 pl-3 tabular-nums">
              {migrationCaseMoney(totals.wheelingReachable)} · {share(totals.wheelingReachableShare)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-[0.66rem] leading-5 text-white/44">
        Neither product removes {migrationCaseMoney(totals.neverReachable)}/month ({share(totals.neverReachableShare)})
        {totals.conditionalNmd > 0
          ? `, of which ${migrationCaseMoney(totals.conditionalNmd)} is capacity charge that only falls on a formal notified-maximum-demand reduction.`
          : "."}
      </p>
      {buckets.length > 0 ? (
        <p className="mt-1.5 text-[0.66rem] leading-5 text-white/44">
          Avoided cost per kWh displaced on site —{" "}
          {buckets.map((entry, index) => (
            <span key={entry.bucket}>
              {index > 0 ? " · " : ""}
              {entry.bucket} {rate(entry.data!.onsiteAvoidedRate)}
            </span>
          ))}
          . Energy {rate(perKwh.blendedEnergyRate)}/kWh blended plus a {rate(perKwh.rider)}/kWh network, levy and
          ancillary rider that wheeling does not touch.
        </p>
      ) : null}
      {matrix.warnings.map((warning) => (
        <p key={warning} className="mt-1.5 text-[0.66rem] leading-5 text-amber-100/64">{warning}</p>
      ))}
    </div>
  );
}

/**
 * LEVEL 2 — THE CASE FILE. Everything about one case, in journey order:
 * intake → bills → proposal/funder report → EOI → formal proposal → KYC
 * custody → submission/SLA/term sheet → timeline. Every operator capability
 * from the old monolith row lives here, one section each.
 */
export default async function AdminMigrationCaseFilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const caseRow = await loadCase(id);
  if (!caseRow) notFound();

  const back = typeof query.back === "string" ? query.back : "";
  const backHref = `/admin/migration-cases${back ? `?${back}` : ""}`;

  const [relations, events, latestSubmission, signatureRows] = await Promise.all([
    getMigrationCaseRelations(caseRow),
    loadEvents(caseRow.id),
    loadLatestSubmission(caseRow.id),
    listDocumentSignaturesForCases([caseRow.id]).catch(() => [] as DocumentSignatureRow[]),
  ]);
  const submission = relations.submission ?? latestSubmission;
  const signature = signatureRows[0] ?? null;
  const storedReport = await getStoredFunderReport(caseRow).catch(() => null);
  const funderReportView: FunderReportView | null = storedReport
    ? {
        status: storedReport.status,
        generatedAt: storedReport.generatedAt,
        operatorConfirmed: storedReport.operatorConfirmed,
        holdReasons: storedReport.holdReasons,
        crosschecks: storedReport.crosschecks.map((row) => ({
          source: row.source,
          field: row.field,
          stated: row.stated,
          predicted: row.predicted,
          deviationPct: row.deviationPct,
          pass: row.pass,
          note: row.note,
        })),
      }
    : null;

  const [eoiPdfUrl, ndaPdfUrl, termSheetUrls] = await Promise.all([
    signedUrl(relations.eoi?.pdf_storage_path),
    signedUrl(relations.nda?.pdf_storage_path),
    Promise.all(relations.termSheets.map(async (sheet) => ({
      id: sheet.id,
      name: sheet.original_name,
      url: await signedUrl(sheet.storage_path),
    }))),
  ]);

  const gate = evaluateKycGate(
    relations.kycDocuments,
    kycPlanFromStoredItems(relations.kycReadiness?.items, relations.kycReadiness?.fix_it_plan),
  );
  const latestKycByType = kycPackStatus(relations.kycDocuments).latest;

  // Server component: one clock read per request is stable for the response.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const signedFunderProposalAt = signature?.status === "submitted_by_client"
    ? (signature.submitted_at ?? signature.signed_at)
    : null;

  // THE one next action — same derivation as the board and the worklist.
  const worklistRow = buildDailyWorklist([{
    caseId: caseRow.id,
    reference: caseRow.public_reference,
    businessName: caseRow.business_name,
    stage: caseRow.stage,
    createdAt: caseRow.created_at,
    updatedAt: caseRow.updated_at,
    proposalReadyAt: caseRow.proposal_ready_at,
    eoiSignedAt: caseRow.eoi_signed_at,
    kycReadinessConfirmedAt: caseRow.kyc_readiness_confirmed_at,
    submittedToFunderAt: caseRow.submitted_to_funder_at,
    kycPackCompleteAt: caseRow.kyc_pack_complete_at,
    kycVerifiedAt: caseRow.kyc_verified_at,
    kycHandedOffAt: caseRow.kyc_handed_off_at,
    termSheetIssuedAt: caseRow.term_sheet_issued_at,
    partnerProposalReadyAt: caseRow.partner_proposal_ready_at,
    partnerProposalSignedAt: caseRow.partner_proposal_signed_at,
    hasBillPack: Boolean(caseRow.active_bill_pack_id),
    hasProposal: Boolean(caseRow.active_proposal_id),
    readinessStatus: relations.kycReadiness?.status ?? null,
    readinessReassessOn: relations.kycReadiness?.reassess_on ?? null,
    signedFunderProposalAt,
    submissionPending: submission?.outcome === "pending",
    submissionSubmittedAt: submission?.submitted_at ?? null,
    submissionSlaDays: submission?.sla_days ?? null,
    submissionAcknowledgedAt: submission?.acknowledged_at ?? null,
    kycPackComplete: gate.complete,
  } satisfies WorklistCaseInput], now)[0];

  // Live SLA panel (clock + acknowledge + escalation drafts) for a pending
  // submission — the same row the old submission queue rendered.
  let slaItem: SubmissionSlaItem | null = null;
  if (submission && submission.outcome === "pending") {
    const clock = slaClock({
      submittedAt: submission.submitted_at,
      slaDays: submission.sla_days,
      acknowledgedAt: submission.acknowledged_at,
      now,
    });
    const draftInput = {
      reference: caseRow.public_reference,
      businessName: caseRow.business_name,
      submittedAt: submission.submitted_at,
      slaDueAt: submission.sla_due_at,
      batchReference: submission.batch_reference,
      channel: submission.channel,
      dayNumber: clock.dayNumber,
    };
    slaItem = {
      caseId: caseRow.id,
      reference: caseRow.public_reference,
      businessName: caseRow.business_name,
      submittedAt: submission.submitted_at,
      slaDays: submission.sla_days,
      slaDueAt: submission.sla_due_at,
      acknowledgedAt: submission.acknowledged_at,
      batchReference: submission.batch_reference,
      channel: submission.channel,
      clock,
      day5Draft: clock.escalationDue ? buildSlaEscalationDraft("day5_escalation", draftInput) : null,
      day8Draft: clock.breachDue ? buildSlaEscalationDraft("day8_breach", draftInput) : null,
    };
  }

  const proposal = relations.proposal;
  const billPack = relations.billPack;
  const chargeTreatment = chargeTreatmentFromBillPack(billPack);
  const partnerProposal = relations.partnerProposal;
  const opsData: MigrationCaseOpsData = {
    caseId: caseRow.id,
    reference: caseRow.public_reference,
    stage: caseRow.stage,
    eoiSignedAt: caseRow.eoi_signed_at,
    hasBillPack: Boolean(caseRow.active_bill_pack_id),
    proposalPublishedAt: caseRow.proposal_ready_at ?? null,
    proposalSource: (proposal?.source as string | null) ?? null,
    readiness: relations.kycReadiness
      ? {
          status: relations.kycReadiness.status,
          confirmedAt: relations.kycReadiness.confirmed_at,
          missing: gate.missing,
          reassessOn: relations.kycReadiness.reassess_on,
        }
      : null,
    submission: submission
      ? {
          channel: submission.channel,
          submittedAt: submission.submitted_at,
          slaDueAt: submission.sla_due_at,
          acknowledgedAt: submission.acknowledged_at,
          outcome: submission.outcome,
        }
      : null,
    partnerProposal: partnerProposal
      ? {
          status: partnerProposal.status,
          issuedAt: partnerProposal.issued_at,
          signedAt: partnerProposal.signed_at,
        }
      : null,
    documentSigning: signature
      ? {
          statusLabel: documentSignatureStatusLabel(signature.status),
          status: signature.status,
          signedAt: signature.signed_at,
          submittedAt: signature.submitted_at,
          signedSha256: signature.signed_sha256,
          downloadable: Boolean(signature.signed_storage_path),
        }
      : null,
    kyc: {
      packCompleteAt: caseRow.kyc_pack_complete_at,
      verifiedAt: caseRow.kyc_verified_at,
      handedOffAt: caseRow.kyc_handed_off_at,
      receivedCount: gate.receivedCount,
      verifiedCount: gate.verifiedCount,
      requiredCount: gate.requiredCount,
      complete: gate.complete,
      bankReady: gate.bankReady,
      nextExpectedBy: gate.nextExpectedBy,
      documents: gate.items.map((entry) => {
        const document = latestKycByType.get(entry.id) ?? null;
        return {
          id: document?.id ?? null,
          type: entry.id,
          label: entry.label,
          status: document ? document.status : "outstanding",
          state: entry.state,
          expectedBy: entry.expectedBy,
          fileName: entry.fileName,
          uploadedAt: entry.uploadedAt,
          reviewNote: document?.review_note ?? null,
        };
      }),
    },
    termSheets: relations.termSheets.map((sheet) => ({
      id: sheet.id ?? null,
      pathway: sheet.pathway,
      issuedAt: sheet.issued_at,
      dealValueRands: Number(sheet.deal_value_rands),
      reference: sheet.reference,
      status: sheet.status ?? null,
      receivedAt: sheet.received_at ?? null,
    })),
  };

  const commercialFit = proposal?.preview_snapshot
    && typeof proposal.preview_snapshot === "object"
    && "commercialFit" in proposal.preview_snapshot
    ? proposal.preview_snapshot.commercialFit as {
        requiredPvKwp?: number;
        minimumCommercialPvKwp?: number;
        selectedPvKwp?: number;
        sizeVariancePct?: number;
        belowCommercialMinimum?: boolean;
        aboveStandardMaximum?: boolean;
      }
    : null;
  const eoiSigned = Boolean(caseRow.eoi_signed_at);
  const report = caseRow.indicative_report;
  const showTermSheet = Boolean(opsData.kyc.handedOffAt)
    || opsData.termSheets.length > 0
    || caseRow.stage === "kyc_direct_submitted";

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      {/* ---- Header ---- */}
      <header className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-5 md:p-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-[0.62rem] uppercase tracking-[0.16em] text-white/44 transition hover:text-white/80"
        >
          <ArrowLeft className="size-3.5" /> Back to the board
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-medium tracking-[-0.04em] text-white md:text-3xl">{caseRow.business_name}</h1>
            <p className="mt-1 font-mono text-xs text-white/48">{caseRow.public_reference}</p>
            <p className="mt-2 text-xs text-white/40">
              {caseRow.contact_name} · {caseRow.contact_email} · {caseRow.contact_phone} · prefers {caseRow.preferred_contact_method}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.58rem] uppercase tracking-[0.14em] ${migrationCaseStageTone(caseRow.stage)}`}>
              {migrationCaseStageLabel(caseRow.stage)}
            </span>
            <span className={`text-sm font-medium ${worklistRow.daysInStage >= 14 ? "text-rose-200" : worklistRow.daysInStage >= 7 ? "text-amber-200" : "text-white/64"}`}>
              {worklistRow.daysInStage}d in stage
            </span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[1rem] border border-white/10 bg-black/25 px-3.5 py-2.5">
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.54rem] uppercase tracking-[0.12em] ${migrationCaseOwnerTone(worklistRow.owner)}`}>
            {worklistRow.owner === "Foundation-1" ? "Us" : worklistRow.owner}
          </span>
          <p className="text-[0.74rem] leading-5 text-white/78">{worklistRow.nextAction}</p>
        </div>
      </header>

      {/* ---- 1 · Intake / first report ---- */}
      <Section
        number={1}
        title="Report & intake"
        status={<StatusChip tone={CHIP_DONE}>Fit: {report?.preliminaryFit?.replace(/-/g, " ") ?? "unknown"}</StatusChip>}
      >
        <div className="grid gap-3 text-xs text-white/56 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-[0.56rem] uppercase tracking-[0.14em] text-white/30">Site</p><p className="mt-1">{caseRow.site_city}, {caseRow.province}</p><p className="text-white/36">{caseRow.supply_type.replace(/-/g, " ")}</p></div>
          <div><p className="text-[0.56rem] uppercase tracking-[0.14em] text-white/30">Reported spend</p><p className="mt-1">{migrationCaseMoney(Number(caseRow.monthly_spend_ex_vat))}/month ex VAT</p>{caseRow.monthly_kwh_unverified ? <p className="text-white/36">{Number(caseRow.monthly_kwh_unverified).toLocaleString("en-ZA")} kWh (unverified)</p> : null}</div>
          <div><p className="text-[0.56rem] uppercase tracking-[0.14em] text-white/30">Created</p><p className="mt-1">{migrationCaseDate(caseRow.created_at)}</p>{caseRow.source_campaign ? <p className="text-white/36">via {caseRow.source_campaign}</p> : null}</div>
          <div>
            <p className="text-[0.56rem] uppercase tracking-[0.14em] text-white/30">Profile & NDA</p>
            <p className="mt-1">{caseRow.profile_completed_at ? `Profile ${migrationCaseDate(caseRow.profile_completed_at)}` : "Profile outstanding"}</p>
            <p className="text-white/36">
              {relations.nda || caseRow.nda_signed_at ? `NDA signed ${migrationCaseDate(relations.nda?.signed_at ?? caseRow.nda_signed_at)}` : "NDA outstanding"}
              {ndaPdfUrl ? <> · <a className="underline underline-offset-2 hover:text-white" href={ndaPdfUrl} target="_blank" rel="noreferrer">PDF</a></> : null}
            </p>
          </div>
        </div>
        {caseRow.client_profile ? (
          <p className="mt-3 text-[0.66rem] text-white/38">
            {caseRow.client_profile.registeredName}
            {caseRow.client_profile.registrationNumber ? ` · reg ${caseRow.client_profile.registrationNumber}` : ""}
            {caseRow.client_profile.vatNumber ? ` · VAT ${caseRow.client_profile.vatNumber}` : ""}
            {caseRow.client_profile.physicalAddress ? ` · ${caseRow.client_profile.physicalAddress}` : ""}
          </p>
        ) : null}
      </Section>

      {/* ---- 2 · Bills ---- */}
      <Section
        number={2}
        title="Utility bills & assessment"
        status={billPack ? (
          <StatusChip tone={billPack.status === "ready" ? CHIP_DONE : CHIP_WARN}>
            {billPack.recognised_period_count}/6 periods · {billPack.covered_days}d · {billPack.status.replace(/_/g, " ")}
          </StatusChip>
        ) : <StatusChip tone={CHIP_WAIT}>Awaiting bill pack</StatusChip>}
      >
        <div className="space-y-3">
          {billPack && (billPack.blockers.length > 0 || billPack.warnings.length > 0) ? (
            <div className="rounded-lg border border-amber-300/20 bg-amber-300/[0.04] p-2.5">
              {billPack.blockers.map((blocker) => (
                <p key={blocker} className="text-[0.66rem] leading-5 text-amber-100/85">Blocker: {blocker}</p>
              ))}
              {billPack.warnings.map((warning) => (
                <p key={warning} className="text-[0.66rem] leading-5 text-white/44">Warning: {warning}</p>
              ))}
            </div>
          ) : null}
          {caseRow.stage === "bill_pack_review" ? <BillPackReviewControl data={opsData} /> : null}
          {chargeTreatment ? <ChargeTreatmentTable matrix={chargeTreatment} /> : null}
          <CaseFilesPanel caseId={caseRow.id} groups={["utility_bill"]} emptyLabel="No utility bills uploaded yet." />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <AssessmentPublishControl
              caseId={caseRow.id}
              reference={caseRow.public_reference}
              hasBillPack={Boolean(caseRow.active_bill_pack_id)}
              publishedAt={caseRow.proposal_ready_at ?? null}
              publishedSource={(proposal?.source as string | null) ?? null}
            />
          </div>
        </div>
      </Section>

      {/* ---- 3 · Proposal + funder report approval ---- */}
      <Section
        number={3}
        title="Proposal & funder report"
        status={proposal ? (
          <StatusChip tone={proposal.economically_positive ? CHIP_DONE : CHIP_WARN}>
            {proposal.status.replace(/_/g, " ")}
          </StatusChip>
        ) : <StatusChip tone={CHIP_WAIT}>No proposal yet</StatusChip>}
      >
        <div className="space-y-3">
          {proposal ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <p className={`text-sm font-medium ${proposal.economically_positive ? "text-lime-200" : "text-orange-200"}`}>
                {migrationCaseMoney(Number(proposal.year_one_monthly_difference))}/mo year one
              </p>
              <p className="mt-1 text-xs text-white/38">{migrationCaseMoney(Number(proposal.ten_year_difference))} over 10 years · engine {proposal.engine_version}</p>
              {commercialFit ? (
                <p className={`mt-2 text-[0.68rem] leading-5 ${commercialFit.belowCommercialMinimum || commercialFit.aboveStandardMaximum ? "text-orange-200/72" : "text-white/38"}`}>
                  Load {Number(commercialFit.requiredPvKwp ?? 0).toFixed(1)} kWp → package {Number(commercialFit.selectedPvKwp ?? 0).toFixed(0)} kWp
                  {commercialFit.belowCommercialMinimum ? ` · minimum ${Number(commercialFit.minimumCommercialPvKwp ?? 0).toFixed(0)} kWp · +${Math.abs(Number(commercialFit.sizeVariancePct ?? 0)).toFixed(1)}%` : ""}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-[0.68rem] text-white/30">No bill-audited proposal on this case yet — publish one from section 2 or run the funder-report pipeline below.</p>
          )}
          <FunderReportControl caseId={caseRow.id} initial={funderReportView} />
          <CaseFilesPanel caseId={caseRow.id} groups={["assessment"]} emptyLabel="No published assessment PDFs yet." />
        </div>
      </Section>

      {/* ---- 4 · EOI ---- */}
      <Section
        number={4}
        title="Expression of interest"
        status={relations.eoi
          ? <StatusChip tone={CHIP_DONE}>Signed {migrationCaseDate(relations.eoi.signed_at)}</StatusChip>
          : <StatusChip tone={CHIP_WAIT}>Not signed</StatusChip>}
      >
        {relations.eoi ? (
          <div className="text-xs text-white/56">
            <p>
              Signed by {relations.eoi.signer_name} ({relations.eoi.signer_position})
              {relations.eoi.company_registration_number ? ` · reg ${relations.eoi.company_registration_number}` : ""}
            </p>
            <p className="mt-1 text-white/36">Declarations {relations.eoi.declarations_version}</p>
            {eoiPdfUrl ? (
              <a href={eoiPdfUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[0.66rem] text-white/72 underline underline-offset-4 hover:text-white">
                Open signed EOI PDF
              </a>
            ) : (
              <p className="mt-2 text-[0.62rem] text-white/28">No stored EOI PDF.</p>
            )}
          </div>
        ) : (
          <p className="text-[0.68rem] leading-5 text-white/30">The non-binding EOI is outstanding. Bank-facing actions unlock after the signed EOI.</p>
        )}
      </Section>

      {/* ---- 5 · Formal (partner) proposal + signing ---- */}
      <Section
        number={5}
        title="Formal proposal & signing"
        status={partnerProposal
          ? <StatusChip tone={partnerProposal.status === "issued" ? CHIP_WARN : CHIP_DONE}>{partnerProposal.status.replace(/_/g, " ")}</StatusChip>
          : <StatusChip tone={CHIP_WAIT}>Not issued</StatusChip>}
      >
        <div className="space-y-3">
          <PartnerProposalIssueControl
            caseId={caseRow.id}
            eoiSigned={eoiSigned}
            status={partnerProposal?.status ?? null}
            issuedAt={partnerProposal?.issued_at ?? null}
            signedAt={partnerProposal?.signed_at ?? null}
            confirmedAt={partnerProposal?.direct_kyc_confirmed_at ?? null}
            signing={opsData.documentSigning}
          />
          {partnerProposal ? (
            <CaseFilesPanel caseId={caseRow.id} groups={["partner_proposal"]} emptyLabel="No proposal PDFs stored." />
          ) : null}
        </div>
      </Section>

      {/* ---- 6 · KYC custody ---- */}
      <Section
        number={6}
        title="KYC custody"
        status={
          <>
            <StatusChip tone={gate.complete ? CHIP_DONE : CHIP_WARN}>{gate.receivedCount}/{gate.requiredCount} in · {gate.verifiedCount}/{gate.requiredCount} verified</StatusChip>
            {gate.bankReady ? <StatusChip tone={CHIP_DONE}>Bank-ready</StatusChip> : null}
          </>
        }
      >
        {eoiSigned ? (
          <KycReviewControl data={opsData} />
        ) : (
          <p className="text-[0.68rem] leading-5 text-white/30">Bank-facing actions unlock after the signed EOI.</p>
        )}
      </Section>

      {/* ---- 7 · Submission, SLA & term sheet ---- */}
      <Section
        number={7}
        title="Funder submission & term sheet"
        status={submission
          ? <StatusChip tone={submission.outcome === "pending" ? CHIP_WARN : CHIP_DONE}>{submission.outcome.replace(/_/g, " ")}</StatusChip>
          : <StatusChip tone={CHIP_WAIT}>Not submitted</StatusChip>}
      >
        {eoiSigned ? (
          <div className="space-y-3">
            {opsData.readiness ? (
              <p className="text-[0.66rem] leading-5 text-white/44">
                KYC readiness: <span className="uppercase tracking-[0.1em]">{opsData.readiness.status.replace(/_/g, " ")}</span>
                {opsData.readiness.confirmedAt ? ` · confirmed ${migrationCaseDate(opsData.readiness.confirmedAt)}` : ""}
                {opsData.readiness.reassessOn ? ` · reassess ${opsData.readiness.reassessOn}` : ""}
                {opsData.readiness.missing.length ? ` · missing: ${opsData.readiness.missing.join(", ")}` : ""}
              </p>
            ) : null}
            <SubmissionControl data={opsData} />
            {slaItem ? (
              <ul className="list-none">
                <SlaRow item={slaItem} />
              </ul>
            ) : null}
            {showTermSheet ? (
              <div className="space-y-2">
                <TermSheetControl data={opsData} />
                {termSheetUrls.filter((sheet) => sheet.url).length ? (
                  <div className="flex flex-wrap gap-2">
                    {termSheetUrls.filter((sheet) => sheet.url).map((sheet) => (
                      <a key={sheet.id ?? sheet.url} href={sheet.url!} target="_blank" rel="noreferrer" className="text-[0.64rem] text-white/64 underline underline-offset-4 hover:text-white">
                        {sheet.name ?? "Term sheet PDF"}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-[0.62rem] text-white/28">Term-sheet recording opens after the KYC handoff (or once a sheet exists).</p>
            )}
          </div>
        ) : (
          <p className="text-[0.68rem] leading-5 text-white/30">Bank-facing actions unlock after the signed EOI.</p>
        )}
      </Section>

      {/* ---- 8 · Timeline ---- */}
      <Section number={8} title="Timeline" status={<StatusChip tone={CHIP_WAIT}>{events.length} event{events.length === 1 ? "" : "s"}</StatusChip>}>
        {events.length ? (
          <ul className="space-y-1.5">
            {events.map((event) => (
              <li key={event.id} className="rounded-lg border border-white/8 bg-black/25 px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-white/48">{event.event_type.replace(/_/g, " ")}</span>
                  <span className="text-[0.58rem] text-white/30">
                    {new Date(event.created_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })} · {event.actor_type}
                  </span>
                </div>
                <p className="mt-1 text-[0.68rem] leading-5 text-white/56">{event.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.68rem] text-white/30">No events recorded for this case.</p>
        )}
      </Section>
    </div>
  );
}

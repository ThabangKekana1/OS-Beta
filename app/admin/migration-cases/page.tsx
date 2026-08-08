import type { Metadata } from "next";
import { MigrationCaseOps, type MigrationCaseOpsData } from "@/components/admin/MigrationCaseOps";
import { KYC_DOCUMENT_TYPES } from "@/lib/migration-case-kyc";
import { documentSignatureStatusLabel, type DocumentSignatureRow } from "@/lib/document-signing";
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
import { readFunnelSummary } from "@/lib/funnel-summary";

export const metadata: Metadata = {
  title: "Migration Cases | 1OS Admin",
  description: "Worklist, submission drum, KYC custody and deal book from report to term sheet.",
};

// This operator surface reads live Supabase state and may reference columns
// introduced by migrations that are intentionally staged locally before remote
// rollout. Never execute it during the production build.
export const dynamic = "force-dynamic";

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function stageLabel(stage: string) {
  if (stage === "kyc_ready") return "Submission Ready";
  if (stage === "submitted_to_funder") return "Submitted To Funder";
  if (stage === "kyc_direct_submitted") return "KYC Direct (Legacy)";
  return stage.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stageTone(stage: string) {
  if (stage === "eoi_signed") return "border-emerald-300/25 bg-emerald-300/8 text-emerald-100";
  if (stage === "kyc_ready") return "border-lime-300/25 bg-lime-300/8 text-lime-100";
  if (stage === "submitted_to_funder") return "border-cyan-300/25 bg-cyan-300/8 text-cyan-100";
  if (stage === "partner_proposal_ready") return "border-sky-300/25 bg-sky-300/8 text-sky-100";
  if (stage === "partner_proposal_signed") return "border-violet-300/25 bg-violet-300/8 text-violet-100";
  if (stage === "kyc_verified") return "border-emerald-300/25 bg-emerald-300/8 text-emerald-100";
  if (stage === "kyc_handed_off") return "border-emerald-300/25 bg-emerald-300/8 text-emerald-100";
  if (stage === "term_sheet_issued") return "border-lime-300/35 bg-lime-300/12 text-lime-100";
  if (stage === "kyc_direct_submitted") return "border-emerald-300/25 bg-emerald-300/8 text-emerald-100";
  if (stage === "proposal_ready") return "border-lime-300/25 bg-lime-300/8 text-lime-100";
  if (stage === "proposal_not_recommended") return "border-orange-300/25 bg-orange-300/8 text-orange-100";
  if (stage === "bill_pack_review") return "border-amber-300/25 bg-amber-300/8 text-amber-100";
  return "border-white/12 bg-white/[0.04] text-white/62";
}

async function tolerantIn<T>(
  table: string,
  column: string,
  values: string[],
): Promise<T[]> {
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

type WorklistBucket = {
  key: string;
  title: string;
  hint: string;
  tone: string;
  items: { id: string; reference: string; name: string; detail: string }[];
};

export default async function AdminMigrationCasesPage() {
  const cases = (await listMigrationCasesForAdmin(150)) as MigrationCaseRow[];
  const funnel = await readFunnelSummary(30).catch(() => null);
  const client = getSupabaseAdminClient();
  const caseIds = cases.map((item) => item.id);
  const billPackIds = cases.map((item) => item.active_bill_pack_id).filter((value): value is string => Boolean(value));
  const proposalIds = cases.map((item) => item.active_proposal_id).filter((value): value is string => Boolean(value));
  const partnerProposalIds = cases.map((item) => item.active_partner_proposal_id).filter((value): value is string => Boolean(value));

  const [packResult, proposalResult, partnerProposalResult] = client
    ? await Promise.all([
        billPackIds.length
          ? client.from("migration_case_bill_packs").select("id,status,source_file_count,recognised_period_count,covered_days,blockers,warnings,completed_at").in("id", billPackIds)
          : Promise.resolve({ data: [], error: null }),
        proposalIds.length
          ? client.from("migration_case_proposals").select("id,status,economically_positive,year_one_monthly_difference,ten_year_difference,preview_snapshot,created_at,source").in("id", proposalIds)
          : Promise.resolve({ data: [], error: null }),
        partnerProposalIds.length
          ? client.from("migration_case_partner_proposals").select("id,status,issued_at,signed_at,direct_kyc_confirmed_at").in("id", partnerProposalIds).then((result) => (
              result.error && /does not exist|schema cache|relation/i.test(result.error.message)
                ? { data: [], error: null }
                : result
            ))
          : Promise.resolve({ data: [], error: null }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];

  const [readinessRows, kycDocumentRows, submissionRows, termSheetRows, signatureRows] = await Promise.all([
    tolerantIn<MigrationCaseKycReadinessRow>("migration_case_kyc_readiness", "case_id", caseIds),
    tolerantIn<MigrationCaseKycDocumentRow>("migration_case_kyc_documents", "case_id", caseIds),
    tolerantIn<MigrationCaseSubmissionRow>("migration_case_submissions", "case_id", caseIds),
    tolerantIn<MigrationCaseTermSheetRow>("migration_case_term_sheets", "case_id", caseIds),
    listDocumentSignaturesForCases(caseIds).catch(() => [] as DocumentSignatureRow[]),
  ]);

  const packs = new Map((packResult.data ?? []).map((item) => [item.id, item]));
  const proposals = new Map((proposalResult.data ?? []).map((item) => [item.id, item]));
  const partnerProposals = new Map((partnerProposalResult.data ?? []).map((item) => [item.id, item]));
  const readinessByCase = new Map(readinessRows.map((row) => [row.case_id, row]));
  const kycDocumentsByCase = new Map<string, MigrationCaseKycDocumentRow[]>();
  for (const row of kycDocumentRows) {
    const list = kycDocumentsByCase.get(row.case_id) ?? [];
    list.push(row);
    kycDocumentsByCase.set(row.case_id, list);
  }
  const submissionsByCase = new Map<string, MigrationCaseSubmissionRow>();
  for (const row of submissionRows) {
    const existing = submissionsByCase.get(row.case_id);
    if (!existing || row.created_at > existing.created_at) submissionsByCase.set(row.case_id, row);
  }
  const termSheetsByCase = new Map<string, MigrationCaseTermSheetRow[]>();
  for (const row of termSheetRows) {
    const list = termSheetsByCase.get(row.case_id) ?? [];
    list.push(row);
    termSheetsByCase.set(row.case_id, list);
  }
  // Latest in-platform signing record per case (rows arrive newest-first).
  const signaturesByCase = new Map<string, DocumentSignatureRow>();
  for (const row of signatureRows) {
    if (!signaturesByCase.has(row.case_id)) signaturesByCase.set(row.case_id, row);
  }

  // Server component, rendered once per request: a clock read here is stable
  // for the response. The purity rule targets client re-render instability.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const dealBookValue = termSheetRows.reduce((sum, sheet) => sum + Number(sheet.deal_value_rands), 0);
  const dealBookCount = termSheetRows.length;
  const signedCount = cases.filter((item) => item.eoi_signed_at).length;
  const proposalCount = cases.filter((item) => item.active_proposal_id).length;

  // ---------------------------------------------------------------------
  // The Daily Worklist — constraint-sorted (protect the submission drum).
  // ---------------------------------------------------------------------
  const buckets: WorklistBucket[] = [
    { key: "sla", title: "SLA due / breached", hint: "Submitted packs at or past the funder response deadline. Escalate.", tone: "border-rose-300/25 bg-rose-300/[0.06] text-rose-100", items: [] },
    { key: "verify", title: "KYC packs to verify", hint: "Complete packs in custody waiting on verification.", tone: "border-amber-300/25 bg-amber-300/[0.06] text-amber-100", items: [] },
    { key: "handoff", title: "Verified — record handoff", hint: "Verified packs ready for the official funder handoff.", tone: "border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-100", items: [] },
    { key: "submit", title: "Ready to submit", hint: "Readiness confirmed. Queue into the next submission batch.", tone: "border-lime-300/25 bg-lime-300/[0.06] text-lime-100", items: [] },
    { key: "chase-kyc", title: "Awaiting KYC documents", hint: "Signed pathway proposals whose packs are incomplete. Chase.", tone: "border-violet-300/25 bg-violet-300/[0.06] text-violet-100", items: [] },
    { key: "parked", title: "Readiness parked (Fix-It)", hint: "Missing KYC items with a dated plan. Follow up on reassess dates.", tone: "border-sky-300/25 bg-sky-300/[0.06] text-sky-100", items: [] },
    { key: "review", title: "Bill packs in review", hint: "Evidence blockers before a proposal can complete.", tone: "border-amber-300/25 bg-amber-300/[0.06] text-amber-100", items: [] },
  ];
  const bucket = (key: string) => buckets.find((item) => item.key === key)!;

  for (const item of cases) {
    const submission = submissionsByCase.get(item.id) ?? null;
    const readiness = readinessByCase.get(item.id) ?? null;
    const partnerProposal = item.active_partner_proposal_id ? partnerProposals.get(item.active_partner_proposal_id) : null;
    const documents = kycDocumentsByCase.get(item.id) ?? [];
    const pack = kycPackStatus(documents);
    const chip = (detail: string) => ({ id: item.id, reference: item.public_reference, name: item.business_name, detail });

    if (submission && submission.outcome === "pending" && !partnerProposal) {
      const dueMs = new Date(submission.sla_due_at).getTime();
      if (dueMs - now < 48 * 60 * 60 * 1000) {
        const overdueDays = Math.floor((now - dueMs) / (24 * 60 * 60 * 1000));
        bucket("sla").items.push(chip(overdueDays >= 0 ? `${overdueDays}d overdue` : "due within 48h"));
      }
    }
    if (item.kyc_pack_complete_at && !item.kyc_verified_at) {
      bucket("verify").items.push(chip(`${pack.verifiedCount}/6 verified`));
    }
    if (item.kyc_verified_at && !item.kyc_handed_off_at) {
      bucket("handoff").items.push(chip("record recipient + manifest"));
    }
    if (item.kyc_readiness_confirmed_at && !item.submitted_to_funder_at && !item.kyc_handed_off_at) {
      bucket("submit").items.push(chip("bankable pack"));
    }
    if (partnerProposal?.signed_at && !pack.complete && !item.kyc_handed_off_at) {
      bucket("chase-kyc").items.push(chip(`${pack.receivedCount}/6 in custody`));
    }
    if (readiness?.status === "parked" && !item.kyc_readiness_confirmed_at) {
      bucket("parked").items.push(chip(readiness.reassess_on ? `reassess ${readiness.reassess_on}` : "no date"));
    }
    if (item.stage === "bill_pack_review") {
      bucket("review").items.push(chip("evidence blockers"));
    }
  }
  const activeBuckets = buckets.filter((item) => item.items.length > 0);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.35)] md:p-8">
        <p className="line-label">Migration case pipeline</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-3xl font-medium tracking-[-0.05em] text-white md:text-5xl">Report → EOI → submission → term sheet.</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/48">Foundation-1 verifies the six-item KYC pack in custody before any funder submission, releases it with an exact recipient manifest, and records every term sheet into the deal book.</p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[[String(cases.length), "Cases"], [String(proposalCount), "Proposals"], [String(signedCount), "EOIs"], [dealBookCount ? money(dealBookValue) : "R0", `Deal book · ${dealBookCount}`]].map(([value, label]) => (
              <div key={String(label)} className="min-w-24 rounded-[1rem] border border-white/10 bg-black/25 p-4 text-center"><strong className="block text-xl font-medium text-white md:text-2xl">{value}</strong><span className="mt-1 block text-[0.58rem] uppercase tracking-[0.2em] text-white/34">{label}</span></div>
            ))}
          </div>
        </div>
      </header>

      {funnel ? (
        <section className="rounded-[2rem] border border-white/10 bg-black/30 p-5 md:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-[0.62rem] uppercase tracking-[0.2em] text-white/34">
              Conversion funnel · last {funnel.days} days
            </p>
            <p className="text-[0.6rem] text-white/28">
              {funnel.capturedEmails} report{funnel.capturedEmails === 1 ? "" : "s"} emailed
              {funnel.belowThreshold ? ` · ${funnel.belowThreshold} below threshold, kept on register` : ""}
            </p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {funnel.steps.map((step) => (
              <div key={step.key} className="rounded-[1.2rem] border border-white/10 bg-white/[0.02] p-4">
                <strong className="block text-xl font-medium text-white">{step.count}</strong>
                <span className="mt-1 block text-[0.58rem] uppercase leading-4 tracking-[0.14em] text-white/34">
                  {step.label}
                </span>
                {step.conversion !== null ? (
                  <span
                    className={`mt-2 inline-block text-[0.58rem] ${
                      step.conversion >= 0.5
                        ? "text-emerald-200/70"
                        : step.conversion >= 0.2
                          ? "text-amber-200/70"
                          : "text-rose-200/70"
                    }`}
                  >
                    {Math.round(step.conversion * 100)}% of previous
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeBuckets.length ? (
        <section className="rounded-[2rem] border border-white/10 bg-black/30 p-5 md:p-6">
          <p className="text-[0.62rem] uppercase tracking-[0.2em] text-white/34">Daily worklist · constraint order</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeBuckets.map((item) => (
              <div key={item.key} className={`rounded-[1.2rem] border p-4 ${item.tone}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-medium">{item.title}</h2>
                  <span className="text-lg font-semibold">{item.items.length}</span>
                </div>
                <p className="mt-1 text-[0.66rem] leading-5 opacity-70">{item.hint}</p>
                <ul className="mt-3 space-y-1.5">
                  {item.items.slice(0, 6).map((entry) => (
                    <li key={`${item.key}:${entry.id}`}>
                      <a href={`#case-${entry.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-black/25 px-2.5 py-1.5 text-[0.68rem] transition hover:bg-black/45">
                        <span className="min-w-0 truncate">{entry.name}</span>
                        <span className="shrink-0 opacity-60">{entry.detail}</span>
                      </a>
                    </li>
                  ))}
                  {item.items.length > 6 ? <li className="px-2.5 text-[0.62rem] opacity-55">+{item.items.length - 6} more</li> : null}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/30">
        <div className="hidden grid-cols-[0.8fr_1.05fr_0.7fr_0.7fr_1.2fr_0.55fr] gap-4 border-b border-white/10 px-6 py-4 text-[0.6rem] uppercase tracking-[0.18em] text-white/30 lg:grid">
          <span>Case / stage</span><span>Client / site</span><span>Bill evidence</span><span>Economics</span><span>Operate</span><span>Created</span>
        </div>
        <div className="divide-y divide-white/8">
          {cases.map((item) => {
            const pack = item.active_bill_pack_id ? packs.get(item.active_bill_pack_id) : null;
            const proposal = item.active_proposal_id ? proposals.get(item.active_proposal_id) : null;
            const partnerProposal = item.active_partner_proposal_id ? partnerProposals.get(item.active_partner_proposal_id) : null;
            const readiness = readinessByCase.get(item.id) ?? null;
            const submission = submissionsByCase.get(item.id) ?? null;
            const documents = kycDocumentsByCase.get(item.id) ?? [];
            const termSheets = termSheetsByCase.get(item.id) ?? [];
            const latestByType = kycPackStatus(documents).latest;
            const opsData: MigrationCaseOpsData = {
              caseId: item.id,
              reference: item.public_reference,
              stage: item.stage,
              eoiSignedAt: item.eoi_signed_at,
              hasBillPack: Boolean(item.active_bill_pack_id),
              proposalPublishedAt: item.proposal_ready_at ?? null,
              proposalSource: (proposal?.source as string | null) ?? null,
              readiness: readiness
                ? {
                    status: readiness.status,
                    confirmedAt: readiness.confirmed_at,
                    missing: (readiness.items ?? []).filter((entry) => !entry.held).map((entry) => entry.id),
                    reassessOn: readiness.reassess_on,
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
              documentSigning: (() => {
                const signature = signaturesByCase.get(item.id);
                return signature
                  ? {
                      statusLabel: documentSignatureStatusLabel(signature.status),
                      status: signature.status,
                      signedAt: signature.signed_at,
                      submittedAt: signature.submitted_at,
                      signedSha256: signature.signed_sha256,
                      downloadable: Boolean(signature.signed_storage_path),
                    }
                  : null;
              })(),
              kyc: {
                packCompleteAt: item.kyc_pack_complete_at,
                verifiedAt: item.kyc_verified_at,
                handedOffAt: item.kyc_handed_off_at,
                documents: KYC_DOCUMENT_TYPES.map((definition) => {
                  const document = latestByType.get(definition.id);
                  return {
                    id: document?.id ?? null,
                    type: definition.id,
                    label: definition.label,
                    status: document ? document.status : "outstanding",
                    fileName: document?.original_name ?? null,
                    uploadedAt: document?.created_at ?? null,
                    reviewNote: document?.review_note ?? null,
                  };
                }),
              },
              termSheets: termSheets.map((sheet) => ({
                pathway: sheet.pathway,
                issuedAt: sheet.issued_at,
                dealValueRands: Number(sheet.deal_value_rands),
                reference: sheet.reference,
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
            return (
              <article key={item.id} id={`case-${item.id}`} className="grid scroll-mt-24 gap-5 px-5 py-6 transition hover:bg-white/[0.018] md:px-6 lg:grid-cols-[0.8fr_1.05fr_0.7fr_0.7fr_1.2fr_0.55fr] lg:items-start">
                <div>
                  <p className="font-mono text-xs text-white/74">{item.public_reference}</p>
                  <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[0.58rem] uppercase tracking-[0.14em] ${stageTone(item.stage)}`}>{stageLabel(item.stage)}</span>
                </div>
                <div>
                  <h2 className="text-sm font-medium text-white">{item.business_name}</h2>
                  <p className="mt-1 text-xs text-white/40">{item.contact_name} · {item.contact_email}</p>
                  <p className="mt-2 text-xs text-white/34">{item.site_city}, {item.province} · {item.supply_type.replace(/-/g, " ")}</p>
                  <p className="mt-2 text-xs text-white/56">First report: {money(Number(item.monthly_spend_ex_vat))}/month ex VAT</p>
                </div>
                <div>
                  {pack ? <><p className="text-sm font-medium text-white">{pack.recognised_period_count}/6 periods</p><p className="mt-1 text-xs text-white/38">{pack.covered_days} days · {pack.source_file_count} files</p>{Array.isArray(pack.blockers) && pack.blockers.length ? <details className="mt-3"><summary className="cursor-pointer text-[0.68rem] text-amber-200/68">View blockers</summary><ul className="mt-2 space-y-1.5">{pack.blockers.map((blocker: string) => <li key={blocker} className="text-[0.68rem] leading-5 text-white/40">{blocker}</li>)}</ul></details> : null}</> : <p className="text-xs text-white/30">Awaiting complete pack</p>}
                </div>
                <div>
                  {proposal ? <><p className={`text-sm font-medium ${proposal.economically_positive ? "text-lime-200" : "text-orange-200"}`}>{money(Number(proposal.year_one_monthly_difference))}/mo</p><p className="mt-1 text-xs text-white/38">{money(Number(proposal.ten_year_difference))} over 10 years</p><p className="mt-2 text-[0.62rem] uppercase tracking-[0.14em] text-white/28">{proposal.status.replace(/_/g, " ")}</p>{commercialFit ? <p className={`mt-3 text-[0.68rem] leading-5 ${commercialFit.belowCommercialMinimum || commercialFit.aboveStandardMaximum ? "text-orange-200/72" : "text-white/38"}`}>Load {Number(commercialFit.requiredPvKwp ?? 0).toFixed(1)} kWp → package {Number(commercialFit.selectedPvKwp ?? 0).toFixed(0)} kWp{commercialFit.belowCommercialMinimum ? ` · minimum ${Number(commercialFit.minimumCommercialPvKwp ?? 0).toFixed(0)} kWp · +${Math.abs(Number(commercialFit.sizeVariancePct ?? 0)).toFixed(1)}%` : ""}</p> : null}</> : <p className="text-xs text-white/30">No proposal yet</p>}
                </div>
                <MigrationCaseOps data={opsData} />
                <div><p className="text-xs text-white/52">{new Date(item.created_at).toLocaleDateString("en-ZA", { dateStyle: "medium" })}</p><p className="mt-1 text-[0.68rem] text-white/28">{new Date(item.created_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</p>{item.eoi_signed_at ? <p className="mt-3 text-[0.68rem] text-emerald-200/62">EOI {new Date(item.eoi_signed_at).toLocaleDateString("en-ZA")}</p> : null}{item.term_sheet_issued_at ? <p className="mt-1 text-[0.68rem] text-lime-200/70">Term sheet {new Date(item.term_sheet_issued_at).toLocaleDateString("en-ZA")}</p> : null}</div>
              </article>
            );
          })}
          {cases.length === 0 ? <div className="px-6 py-20 text-center"><p className="text-sm text-white/42">No migration cases have been created yet.</p></div> : null}
        </div>
      </section>
    </div>
  );
}

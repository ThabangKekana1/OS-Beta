"use client";

import { useState } from "react";
import { Check, FileUp, Send, ShieldCheck, Stamp } from "lucide-react";
import { OrbitalBusyDot } from "@/components/FoundationMark";
import { AssessmentPublishControl } from "@/components/admin/AssessmentPublishControl";
import { PartnerProposalIssueControl } from "@/components/admin/PartnerProposalIssueControl";

type KycDocumentSlot = {
  id: string | null;
  type: string;
  label: string;
  status: "outstanding" | "received" | "verified" | "rejected";
  /** Client-declared three-state: uploaded / promised / dont_have / outstanding. */
  state: "uploaded" | "promised" | "dont_have" | "outstanding";
  expectedBy: string | null;
  fileName: string | null;
  uploadedAt: string | null;
  reviewNote: string | null;
};

export type MigrationCaseOpsData = {
  caseId: string;
  reference: string;
  stage: string;
  eoiSignedAt: string | null;
  hasBillPack: boolean;
  proposalPublishedAt: string | null;
  proposalSource: string | null;
  readiness: null | {
    status: "confirmed" | "parked" | "in_progress";
    confirmedAt: string | null;
    missing: string[];
    reassessOn: string | null;
  };
  submission: null | {
    channel: string;
    submittedAt: string;
    slaDueAt: string;
    acknowledgedAt: string | null;
    outcome: string;
  };
  partnerProposal: null | {
    status: "issued" | "signed" | "direct_kyc_confirmed";
    issuedAt: string | null;
    signedAt: string | null;
  };
  /** In-platform signing audit state (migration_case_document_signatures). */
  documentSigning: null | {
    statusLabel: string;
    status: "awaiting_signature" | "signed" | "submitted_by_client";
    signedAt: string | null;
    submittedAt: string | null;
    signedSha256: string | null;
    downloadable: boolean;
  };
  kyc: {
    packCompleteAt: string | null;
    verifiedAt: string | null;
    handedOffAt: string | null;
    receivedCount: number;
    verifiedCount: number;
    requiredCount: number;
    complete: boolean;
    bankReady: boolean;
    nextExpectedBy: string | null;
    documents: KycDocumentSlot[];
  };
  termSheets: {
    id: string | null;
    pathway: string;
    issuedAt: string;
    dealValueRands: number;
    reference: string | null;
    /** Tracker status; null until the staged tracker migration is applied. */
    status: "received" | "signed" | "declined" | null;
    receivedAt: string | null;
  }[];
};

function date(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(parsed);
}

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(value);
}

async function postJson(url: string, body: Record<string, unknown>, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "The operation failed.");
}

function ActionButton({ busy, onClick, children, tone = "light" }: {
  busy?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "light" | "outline";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[0.62rem] font-medium uppercase tracking-[0.13em] transition disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === "light"
          ? "border border-white bg-white text-black hover:bg-white/88"
          : "border border-white/16 bg-white/[0.03] text-white/72 hover:bg-white/10"
      }`}
    >
      {busy ? <OrbitalBusyDot /> : null}
      {children}
    </button>
  );
}

function SubmissionControl({ data }: { data: MigrationCaseOpsData }) {
  const [channel, setChannel] = useState("eden_ufms");
  const [batchReference, setBatchReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      window.location.reload();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "The operation failed.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * The founder's rule: an incomplete KYC pack WARNS, it never blocks.
   * The first attempt surfaces the warnings; "Submit anyway" resends with an
   * explicit acknowledgement. Karman decides — the system informs.
   */
  async function submit(acknowledgeIncompleteKyc: boolean) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/migration-cases/${encodeURIComponent(data.caseId)}/submission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, batchReference, acknowledgeIncompleteKyc }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; warnNotBlock?: boolean; warnings?: string[] }
        | null;
      if (payload?.warnNotBlock && Array.isArray(payload.warnings)) {
        setWarnings(payload.warnings);
        return;
      }
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "The operation failed.");
      window.location.reload();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "The operation failed.");
    } finally {
      setBusy(false);
    }
  }

  if (data.submission) {
    const overdue = !data.partnerProposal && new Date(data.submission.slaDueAt).getTime() < Date.now();
    return (
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-[0.66rem] font-medium uppercase tracking-[0.14em] text-white/70">
          <Send className="size-3.5" /> Submitted · {data.submission.channel.replace(/_/g, " ")}
        </p>
        <p className="text-[0.68rem] leading-5 text-white/36">
          {date(data.submission.submittedAt)} · response due {date(data.submission.slaDueAt)}
          {data.submission.acknowledgedAt ? ` · acknowledged ${date(data.submission.acknowledgedAt)}` : ""}
        </p>
        {overdue ? <p className="text-[0.66rem] font-medium text-rose-300">SLA breached — escalate (dealer agreement cl. 4.2.1).</p> : null}
        {!data.submission.acknowledgedAt ? (
          <ActionButton busy={busy} tone="outline" onClick={() => void run(() => postJson(`/api/admin/migration-cases/${encodeURIComponent(data.caseId)}/submission`, { action: "acknowledge" }, "PATCH"))}>
            Mark acknowledged
          </ActionButton>
        ) : null}
        {error ? <p className="text-[0.66rem] text-rose-200" role="alert">{error}</p> : null}
      </div>
    );
  }

  const packComplete = data.kyc.complete;
  return (
    <div className="space-y-2">
      {packComplete ? (
        <p className="text-[0.62rem] uppercase tracking-[0.14em] text-lime-200/72">
          Submission-ready · pack {data.kyc.receivedCount}/{data.kyc.requiredCount}
        </p>
      ) : (
        <p className="text-[0.62rem] uppercase tracking-[0.14em] text-amber-200/78">
          Pack incomplete · {data.kyc.receivedCount}/{data.kyc.requiredCount} in — submitting is your call, not blocked
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
          className="h-8 rounded-lg border border-white/14 bg-black px-2 text-[0.66rem] text-white/78"
        >
          <option value="eden_ufms">Eden / UFMS</option>
          <option value="awaken_wheeling">Awaken wheeling</option>
          <option value="both">Both</option>
        </select>
        <input
          value={batchReference}
          onChange={(event) => setBatchReference(event.target.value)}
          placeholder="Batch ref"
          className="h-8 w-24 rounded-lg border border-white/14 bg-black px-2 text-[0.66rem] text-white/78 placeholder:text-white/24"
        />
        <ActionButton busy={busy} onClick={() => void submit(false)}>
          <Send className="size-3.5" /> Record submission
        </ActionButton>
      </div>
      {warnings.length ? (
        <div className="space-y-1.5 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] p-2.5">
          {warnings.map((warning) => (
            <p key={warning} className="text-[0.66rem] leading-5 text-amber-100/85">{warning}</p>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <ActionButton busy={busy} tone="outline" onClick={() => void submit(true)}>
              <Send className="size-3.5" /> Submit anyway — I accept the incomplete pack
            </ActionButton>
            <ActionButton tone="outline" onClick={() => setWarnings([])}>Hold back</ActionButton>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-[0.66rem] text-rose-200" role="alert">{error}</p> : null}
    </div>
  );
}

function KycReviewControl({ data }: { data: MigrationCaseOpsData }) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [recipient, setRecipient] = useState("");
  const [handoffBusy, setHandoffBusy] = useState(false);

  async function review(documentId: string, decision: "verified" | "rejected") {
    setBusyId(documentId);
    setError("");
    try {
      await postJson(`/api/admin/migration-cases/${encodeURIComponent(data.caseId)}/kyc-review`, {
        documentId,
        decision,
        note: decision === "rejected" ? note : undefined,
      });
      window.location.reload();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Review failed.");
    } finally {
      setBusyId("");
    }
  }

  async function handoff() {
    setHandoffBusy(true);
    setError("");
    try {
      await postJson(`/api/admin/migration-cases/${encodeURIComponent(data.caseId)}/handoff`, { recipient });
      window.location.reload();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Handoff failed.");
    } finally {
      setHandoffBusy(false);
    }
  }

  // The completeness card: n/6 with a single unmistakable flag. The
  // "bank-ready" badge appears only at 6/6 VERIFIED — custody alone is not
  // bank-ready.
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-2 text-[0.66rem] font-medium uppercase tracking-[0.14em] text-white/70">
          <ShieldCheck className="size-3.5" /> KYC pack · {data.kyc.receivedCount}/{data.kyc.requiredCount} in · {data.kyc.verifiedCount}/{data.kyc.requiredCount} verified
        </p>
        <span className={`rounded-md border px-2 py-0.5 text-[0.56rem] font-semibold uppercase tracking-[0.14em] ${
          data.kyc.complete
            ? "border-lime-300/40 bg-lime-300/12 text-lime-200"
            : "border-amber-300/40 bg-amber-300/10 text-amber-200"
        }`}>{data.kyc.complete ? "Complete" : "Incomplete"}</span>
        {data.kyc.bankReady ? (
          <span className="rounded-md border border-emerald-300/45 bg-emerald-300/14 px-2 py-0.5 text-[0.56rem] font-semibold uppercase tracking-[0.14em] text-emerald-200">
            Bank-ready
          </span>
        ) : null}
      </div>
      {!data.kyc.complete && data.kyc.nextExpectedBy ? (
        <p className="text-[0.64rem] text-white/40">Next promised document expected {date(data.kyc.nextExpectedBy)}.</p>
      ) : null}
      <ul className="space-y-1.5">
        {data.kyc.documents.map((slot) => (
          <li key={slot.type} className="rounded-lg border border-white/8 bg-black/30 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[0.66rem] text-white/62">{slot.label}</span>
              <span className={`shrink-0 text-[0.58rem] uppercase tracking-[0.12em] ${
                slot.status === "verified" ? "text-emerald-300" : slot.status === "rejected" ? "text-rose-300" : slot.status === "received" ? "text-amber-200" : slot.state === "promised" ? "text-sky-200" : slot.state === "dont_have" ? "text-rose-200/80" : "text-white/26"
              }`}>{
                slot.status !== "outstanding"
                  ? slot.status
                  : slot.state === "promised"
                    ? `promised${slot.expectedBy ? ` · ${slot.expectedBy}` : ""}`
                    : slot.state === "dont_have"
                      ? "client doesn't have"
                      : "outstanding"
              }</span>
            </div>
            {slot.uploadedAt ? (
              <p className="mt-0.5 text-[0.58rem] text-white/28">{slot.fileName ?? "document"} · {date(slot.uploadedAt)}</p>
            ) : null}
            {slot.status === "received" && slot.id ? (
              rejecting === slot.id ? (
                <div className="mt-2 space-y-1.5">
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Rejection reason for the client"
                    className="h-8 w-full rounded-lg border border-white/14 bg-black px-2 text-[0.66rem] text-white/78 placeholder:text-white/24"
                  />
                  <div className="flex gap-2">
                    <ActionButton busy={busyId === slot.id} tone="outline" onClick={() => void review(slot.id!, "rejected")}>Confirm reject</ActionButton>
                    <ActionButton tone="outline" onClick={() => { setRejecting(null); setNote(""); }}>Cancel</ActionButton>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <ActionButton busy={busyId === slot.id} onClick={() => void review(slot.id!, "verified")}><Check className="size-3" /> Verify</ActionButton>
                  <ActionButton tone="outline" onClick={() => { setRejecting(slot.id); setNote(""); }}>Reject</ActionButton>
                </div>
              )
            ) : null}
          </li>
        ))}
      </ul>
      {data.kyc.verifiedAt && !data.kyc.handedOffAt ? (
        <div className="mt-2 space-y-1.5 rounded-lg border border-emerald-300/16 bg-emerald-300/[0.05] p-2.5">
          <p className="text-[0.62rem] uppercase tracking-[0.13em] text-emerald-200/78">Pack verified — record official handoff</p>
          <input
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="Exact recipient (person / mailbox)"
            className="h-8 w-full rounded-lg border border-white/14 bg-black px-2 text-[0.66rem] text-white/78 placeholder:text-white/24"
          />
          <ActionButton busy={handoffBusy} onClick={() => void handoff()}><Send className="size-3.5" /> Record handoff</ActionButton>
        </div>
      ) : null}
      {data.kyc.handedOffAt ? <p className="text-[0.66rem] text-emerald-200/70">Handed off {date(data.kyc.handedOffAt)} · manifest logged.</p> : null}
      {error ? <p className="text-[0.66rem] text-rose-200" role="alert">{error}</p> : null}
    </div>
  );
}

function TermSheetControl({ data }: { data: MigrationCaseOpsData }) {
  const [pathway, setPathway] = useState("eden");
  const [source, setSource] = useState("funder_direct");
  const [value, setValue] = useState("");
  const [reference, setReference] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState("");
  const [error, setError] = useState("");

  /** Tracker: received → signed | declined. Declined leaves the deal book. */
  async function setSheetStatus(termSheetId: string, status: "received" | "signed" | "declined") {
    setStatusBusy(termSheetId);
    setError("");
    try {
      await postJson(`/api/admin/migration-cases/${encodeURIComponent(data.caseId)}/term-sheet`, { termSheetId, status }, "PATCH");
      window.location.reload();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Unable to update the term sheet.");
    } finally {
      setStatusBusy("");
    }
  }

  async function record() {
    const dealValue = Number(value.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(dealValue) || dealValue <= 0) {
      setError("Enter the deal value in rands.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("pathway", pathway);
      form.set("source", source);
      form.set("dealValueRands", String(dealValue));
      if (reference) form.set("reference", reference);
      if (receivedAt) form.set("receivedAt", receivedAt);
      if (file) form.set("file", file, file.name);
      const response = await fetch(`/api/admin/migration-cases/${encodeURIComponent(data.caseId)}/term-sheet`, {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "Unable to record the term sheet.");
      window.location.reload();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Unable to record the term sheet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {data.termSheets.length ? (
        <ul className="space-y-1.5">
          {data.termSheets.map((sheet) => {
            const status = sheet.status ?? "received";
            return (
              <li key={`${sheet.pathway}:${sheet.issuedAt}`} className={`rounded-lg border px-2.5 py-2 ${status === "declined" ? "border-rose-300/18 bg-rose-300/[0.04]" : "border-lime-300/18 bg-lime-300/[0.05]"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-[0.66rem] font-medium uppercase tracking-[0.12em] ${status === "declined" ? "text-rose-200/80" : "text-lime-200"}`}>
                    {sheet.pathway} · {money(sheet.dealValueRands)}
                  </p>
                  <span className={`shrink-0 text-[0.56rem] uppercase tracking-[0.14em] ${status === "signed" ? "text-emerald-300" : status === "declined" ? "text-rose-300" : "text-amber-200/80"}`}>{status}</span>
                </div>
                <p className="mt-0.5 text-[0.62rem] text-white/38">{date(sheet.receivedAt ?? sheet.issuedAt)}{sheet.reference ? ` · ${sheet.reference}` : ""}</p>
                {sheet.id && status === "received" ? (
                  <div className="mt-1.5 flex gap-2">
                    <ActionButton busy={statusBusy === sheet.id} onClick={() => void setSheetStatus(sheet.id!, "signed")}><Check className="size-3" /> Signed</ActionButton>
                    <ActionButton busy={statusBusy === sheet.id} tone="outline" onClick={() => void setSheetStatus(sheet.id!, "declined")}>Declined</ActionButton>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <details className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
        <summary className="cursor-pointer text-[0.62rem] uppercase tracking-[0.13em] text-white/48">
          <Stamp className="mr-1 inline size-3" /> Record term sheet
        </summary>
        <div className="mt-2 space-y-1.5">
          <div className="flex gap-2">
            <select value={pathway} onChange={(event) => setPathway(event.target.value)} className="h-8 flex-1 rounded-lg border border-white/14 bg-black px-2 text-[0.66rem] text-white/78">
              <option value="eden">Eden</option>
              <option value="nightshade">Nightshade</option>
              <option value="awaken">Awaken</option>
            </select>
            <select value={source} onChange={(event) => setSource(event.target.value)} className="h-8 flex-1 rounded-lg border border-white/14 bg-black px-2 text-[0.66rem] text-white/78">
              <option value="funder_direct">Funder direct</option>
              <option value="foundation1">Foundation-1</option>
            </select>
          </div>
          <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Deal value (R)" inputMode="decimal" className="h-8 w-full rounded-lg border border-white/14 bg-black px-2 text-[0.66rem] text-white/78 placeholder:text-white/24" />
          <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Reference (optional)" className="h-8 w-full rounded-lg border border-white/14 bg-black px-2 text-[0.66rem] text-white/78 placeholder:text-white/24" />
          <label className="block text-[0.6rem] text-white/38">
            <span className="mb-1 block uppercase tracking-[0.12em]">Received date (defaults to today)</span>
            <input type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} className="h-8 w-full rounded-lg border border-white/14 bg-black px-2 text-[0.66rem] text-white/78" />
          </label>
          <label className="block text-[0.6rem] text-white/38">
            <span className="mb-1 block uppercase tracking-[0.12em]">Term sheet PDF (optional)</span>
            <input type="file" accept=".pdf,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full text-[0.64rem] text-white/48 file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-2 file:py-1 file:text-[0.6rem] file:text-black" />
          </label>
          <ActionButton busy={busy} onClick={() => void record()}><FileUp className="size-3.5" /> Record</ActionButton>
          {error ? <p className="text-[0.66rem] text-rose-200" role="alert">{error}</p> : null}
        </div>
      </details>
    </div>
  );
}

/**
 * Constraint-ordered operator controls for one migration case:
 * readiness → submission (SLA) → pathway proposal → KYC verification →
 * handoff → term sheet.
 */
/**
 * The exit from bill_pack_review.
 *
 * A pack that fails recognition used to have no way out: no route and no
 * button, so the case sat until the client happened to re-upload everything.
 */
function BillPackReviewControl({ data }: { data: MigrationCaseOpsData }) {
  const [busy, setBusy] = useState<"rerun" | "reopen" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function run(action: "rerun" | "reopen") {
    setBusy(action);
    setError("");
    try {
      await postJson(
        `/api/admin/migration-cases/${encodeURIComponent(data.caseId)}/bill-pack-review`,
        { action, note },
      );
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The operation failed.");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-3">
      <p className="text-[0.62rem] font-medium uppercase tracking-[0.13em] text-amber-100/80">
        Bill pack in review
      </p>
      <p className="text-[0.68rem] leading-5 text-white/50">
        Re-run the audit over the stored files after a catalogue or parser fix, or return the
        pack to the client so they can add what is missing. Returning it emails them the reason.
      </p>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Reason shown to the client (optional)"
        className="h-8 w-full rounded-lg border border-white/12 bg-white/[0.03] px-3 text-[0.68rem] text-white placeholder:text-white/25"
      />
      {error ? <p className="text-[0.65rem] text-amber-200">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <ActionButton busy={busy === "rerun"} onClick={() => void run("rerun")}>
          Re-run audit
        </ActionButton>
        <ActionButton busy={busy === "reopen"} tone="outline" onClick={() => void run("reopen")}>
          Return to client
        </ActionButton>
      </div>
    </div>
  );
}

export function MigrationCaseOps({ data }: { data: MigrationCaseOpsData }) {
  const assessmentDesk = (
    <AssessmentPublishControl
      caseId={data.caseId}
      reference={data.reference}
      hasBillPack={data.hasBillPack}
      publishedAt={data.proposalPublishedAt}
      publishedSource={data.proposalSource}
    />
  );

  if (!data.eoiSignedAt) {
    return (
      <div className="space-y-3">
        {data.stage === "bill_pack_review" ? <BillPackReviewControl data={data} /> : null}
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">{assessmentDesk}</div>
        <p className="text-[0.68rem] leading-5 text-white/30">Bank-facing actions unlock after the signed EOI.</p>
      </div>
    );
  }
  // The completeness card shows from the moment bank-facing actions unlock:
  // Karman must always see n/6 before deciding to submit externally.
  const showKyc = true;
  const showTermSheet = Boolean(data.kyc.handedOffAt) || data.termSheets.length > 0 || data.stage === "kyc_direct_submitted";
  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-3">
      {assessmentDesk}
      <SubmissionControl data={data} />
      {data.submission || data.partnerProposal ? (
        <PartnerProposalIssueControl
          caseId={data.caseId}
          eoiSigned={Boolean(data.eoiSignedAt)}
          status={data.partnerProposal?.status ?? null}
          issuedAt={data.partnerProposal?.issuedAt ?? null}
          signedAt={data.partnerProposal?.signedAt ?? null}
          confirmedAt={null}
          signing={data.documentSigning}
        />
      ) : null}
      {showKyc ? <KycReviewControl data={data} /> : null}
      {showTermSheet ? <TermSheetControl data={data} /> : null}
    </div>
  );
}

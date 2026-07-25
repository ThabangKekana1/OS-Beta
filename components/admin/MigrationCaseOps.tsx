"use client";

import { useState } from "react";
import { Check, FileUp, Send, ShieldCheck, Stamp } from "lucide-react";
import { OrbitalBusyDot } from "@/components/FoundationMark";
import { PartnerProposalIssueControl } from "@/components/admin/PartnerProposalIssueControl";

type KycDocumentSlot = {
  id: string | null;
  type: string;
  label: string;
  status: "outstanding" | "received" | "verified" | "rejected";
  fileName: string | null;
  uploadedAt: string | null;
  reviewNote: string | null;
};

export type MigrationCaseOpsData = {
  caseId: string;
  stage: string;
  eoiSignedAt: string | null;
  readiness: null | {
    status: "confirmed" | "parked";
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
  kyc: {
    packCompleteAt: string | null;
    verifiedAt: string | null;
    handedOffAt: string | null;
    documents: KycDocumentSlot[];
  };
  termSheets: { pathway: string; issuedAt: string; dealValueRands: number; reference: string | null }[];
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

  const readinessConfirmed = data.readiness?.status === "confirmed";

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

  if (!readinessConfirmed) {
    return (
      <p className="text-[0.68rem] leading-5 text-white/30">
        {data.readiness?.status === "parked"
          ? `Readiness parked · ${data.readiness.missing.length} missing · reassess ${date(data.readiness.reassessOn) ?? "soon"}`
          : "Awaiting the client's KYC readiness confirmation."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] uppercase tracking-[0.14em] text-lime-200/72">Submission-ready</p>
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
        <ActionButton busy={busy} onClick={() => void run(() => postJson(`/api/admin/migration-cases/${encodeURIComponent(data.caseId)}/submission`, { channel, batchReference }))}>
          <Send className="size-3.5" /> Record submission
        </ActionButton>
      </div>
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

  const received = data.kyc.documents.filter((slot) => slot.status !== "outstanding");
  if (!received.length) {
    return <p className="text-[0.68rem] leading-5 text-white/30">Awaiting KYC documents from the client.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-[0.66rem] font-medium uppercase tracking-[0.14em] text-white/70">
        <ShieldCheck className="size-3.5" /> KYC custody · {received.filter((slot) => slot.status === "verified").length}/6 verified
      </p>
      <ul className="space-y-1.5">
        {data.kyc.documents.map((slot) => (
          <li key={slot.type} className="rounded-lg border border-white/8 bg-black/30 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[0.66rem] text-white/62">{slot.label}</span>
              <span className={`shrink-0 text-[0.58rem] uppercase tracking-[0.12em] ${
                slot.status === "verified" ? "text-emerald-300" : slot.status === "rejected" ? "text-rose-300" : slot.status === "received" ? "text-amber-200" : "text-white/26"
              }`}>{slot.status}</span>
            </div>
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
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
          {data.termSheets.map((sheet) => (
            <li key={`${sheet.pathway}:${sheet.issuedAt}`} className="rounded-lg border border-lime-300/18 bg-lime-300/[0.05] px-2.5 py-2">
              <p className="text-[0.66rem] font-medium uppercase tracking-[0.12em] text-lime-200">
                {sheet.pathway} · {money(sheet.dealValueRands)}
              </p>
              <p className="mt-0.5 text-[0.62rem] text-white/38">{date(sheet.issuedAt)}{sheet.reference ? ` · ${sheet.reference}` : ""}</p>
            </li>
          ))}
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
export function MigrationCaseOps({ data }: { data: MigrationCaseOpsData }) {
  if (!data.eoiSignedAt) {
    return <p className="text-[0.68rem] leading-5 text-white/30">Pre-EOI. Operator actions unlock after the signed EOI.</p>;
  }
  const showKyc = Boolean(data.partnerProposal?.signedAt) || data.kyc.documents.some((slot) => slot.status !== "outstanding");
  const showTermSheet = Boolean(data.kyc.handedOffAt) || data.termSheets.length > 0 || data.stage === "kyc_direct_submitted";
  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-3">
      <SubmissionControl data={data} />
      {data.submission || data.partnerProposal ? (
        <PartnerProposalIssueControl
          caseId={data.caseId}
          eoiSigned={Boolean(data.eoiSignedAt)}
          status={data.partnerProposal?.status ?? null}
          issuedAt={data.partnerProposal?.issuedAt ?? null}
          signedAt={data.partnerProposal?.signedAt ?? null}
          confirmedAt={null}
        />
      ) : null}
      {showKyc ? <KycReviewControl data={data} /> : null}
      {showTermSheet ? <TermSheetControl data={data} /> : null}
    </div>
  );
}

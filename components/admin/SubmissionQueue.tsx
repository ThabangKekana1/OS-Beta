"use client";

import { useMemo, useState } from "react";
import { Copy, Download, FileDown, Mail, Send } from "lucide-react";
import { OrbitalBusyDot } from "@/components/FoundationMark";
import type { EscalationDraft, SlaClock, SubmissionManifest } from "@/lib/submission-queue";

/**
 * The submission queue + SLA clocks (doc 06 §3.2, §5.3).
 *
 * Three shelves — signed-and-ready, bankable, blocked — with a batch action
 * that marks the selection submitted under one numbered manifest, and a
 * clock section that tracks every live submission against the 7-day service
 * level (dealer agreement cl. 4.2.1). Escalation text is DRAFTED here and
 * sent manually by the operator; this console never emails a funder.
 */

export type SubmissionQueueItem = {
  caseId: string;
  reference: string;
  businessName: string;
  siteCity: string;
  province: string;
  tier: "signed_ready" | "bankable" | "blocked";
  blockedReason: string;
  eoiSignedAt: string | null;
  kycReadinessConfirmedAt: string | null;
  signedFunderProposalAt: string | null;
};

export type SubmissionSlaItem = {
  caseId: string;
  reference: string;
  businessName: string;
  submittedAt: string;
  slaDays: number;
  slaDueAt: string;
  acknowledgedAt: string | null;
  batchReference: string | null;
  channel: string;
  clock: SlaClock;
  /** Drafts arrive pre-built from the pure library; null until their day. */
  day5Draft: EscalationDraft | null;
  day8Draft: EscalationDraft | null;
};

type BatchResult = {
  batchReference: string;
  manifest: SubmissionManifest;
  manifestText: string;
  submitted: { caseId: string; reference: string }[];
  failures: { caseId: string; reference: string | null; reason: string }[];
};

function date(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(parsed);
}

function downloadBlob(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function DraftPanel({ label, draft, tone }: { label: string; draft: EscalationDraft; tone: "amber" | "rose" }) {
  const [copied, setCopied] = useState(false);
  const text = `Subject: ${draft.subject}\n\n${draft.body.join("\n")}`;
  return (
    <details className={`rounded-lg border p-2.5 ${tone === "rose" ? "border-rose-300/22 bg-rose-300/[0.04]" : "border-amber-300/22 bg-amber-300/[0.04]"}`}>
      <summary className={`cursor-pointer text-[0.62rem] uppercase tracking-[0.13em] ${tone === "rose" ? "text-rose-200/85" : "text-amber-200/85"}`}>
        <Mail className="mr-1 inline size-3" /> {label} — draft (send manually)
      </summary>
      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-black/40 p-2.5 font-sans text-[0.66rem] leading-5 text-white/70">{text}</pre>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1_600); }); }}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/16 bg-white/[0.03] px-2.5 text-[0.6rem] uppercase tracking-[0.12em] text-white/72 transition hover:bg-white/10"
        >
          <Copy className="size-3" /> {copied ? "Copied" : "Copy draft"}
        </button>
        <a
          href={`mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body.join("\n"))}`}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/16 bg-white/[0.03] px-2.5 text-[0.6rem] uppercase tracking-[0.12em] text-white/72 transition hover:bg-white/10"
        >
          <Mail className="size-3" /> Open in mail client
        </a>
      </div>
    </details>
  );
}

function SlaRow({ item }: { item: SubmissionSlaItem }) {
  const [ackDate, setAckDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { clock } = item;

  async function acknowledge() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/migration-cases/${encodeURIComponent(item.caseId)}/submission`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge", acknowledgedAt: ackDate || undefined }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "Unable to record the acknowledgement.");
      window.location.reload();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Unable to record the acknowledgement.");
      setBusy(false);
    }
  }

  const badge = clock.breachDue
    ? { label: `Day ${clock.dayNumber} — BREACH (cl. 4.2.1)`, tone: "border-rose-300/30 bg-rose-300/10 text-rose-200" }
    : clock.escalationDue
      ? { label: `Day ${clock.dayNumber} of ${item.slaDays} — escalate`, tone: "border-amber-300/30 bg-amber-300/10 text-amber-200" }
      : { label: `Day ${clock.dayNumber} of ${item.slaDays}`, tone: "border-cyan-300/25 bg-cyan-300/8 text-cyan-100" };

  return (
    <li className="rounded-[1rem] border border-white/10 bg-black/25 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{item.businessName}</p>
          <p className="mt-0.5 font-mono text-[0.64rem] text-white/40">{item.reference}{item.batchReference ? ` · ${item.batchReference}` : ""}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.6rem] font-medium uppercase tracking-[0.13em] ${badge.tone}`}>{badge.label}</span>
      </div>
      <p className="mt-2 text-[0.66rem] text-white/40">
        Submitted {date(item.submittedAt)} · response due {date(item.slaDueAt)}
        {item.acknowledgedAt ? ` · acknowledged ${date(item.acknowledgedAt)}` : " · not yet acknowledged"}
      </p>
      {!item.acknowledgedAt ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input type="date" value={ackDate} onChange={(event) => setAckDate(event.target.value)} className="h-8 rounded-lg border border-white/14 bg-black px-2 text-[0.66rem] text-white/78" />
          <button type="button" disabled={busy} onClick={() => void acknowledge()} className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/16 bg-white/[0.03] px-3 text-[0.62rem] font-medium uppercase tracking-[0.13em] text-white/72 transition hover:bg-white/10 disabled:opacity-40">
            {busy ? <OrbitalBusyDot /> : null} Record funder ack
          </button>
        </div>
      ) : null}
      {item.day8Draft ? (
        <div className="mt-2"><DraftPanel label="Day-8 formal breach note" draft={item.day8Draft} tone="rose" /></div>
      ) : item.day5Draft ? (
        <div className="mt-2"><DraftPanel label="Day-5 escalation" draft={item.day5Draft} tone="amber" /></div>
      ) : null}
      {error ? <p className="mt-2 text-[0.66rem] text-rose-200" role="alert">{error}</p> : null}
    </li>
  );
}

export function SubmissionQueue({ queue, slaItems }: { queue: SubmissionQueueItem[]; slaItems: SubmissionSlaItem[] }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [channel, setChannel] = useState("eden_ufms");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BatchResult | null>(null);

  const signedReady = useMemo(() => queue.filter((item) => item.tier === "signed_ready"), [queue]);
  const bankable = useMemo(() => queue.filter((item) => item.tier === "bankable"), [queue]);
  const blocked = useMemo(() => queue.filter((item) => item.tier === "blocked"), [queue]);
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  async function runBatch() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/migration-cases/submission-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseIds: selectedIds, channel }),
      });
      const payload = (await response.json().catch(() => null)) as (BatchResult & { ok?: boolean; error?: string }) | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "The batch failed.");
      setResult(payload);
      setSelected({});
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "The batch failed.");
    } finally {
      setBusy(false);
    }
  }

  function shelf(title: string, hint: string, items: SubmissionQueueItem[], selectable: boolean, tone: string) {
    return (
      <div className={`rounded-[1.2rem] border p-4 ${tone}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">{title}</h3>
          <span className="text-lg font-semibold">{items.length}</span>
        </div>
        <p className="mt-1 text-[0.66rem] leading-5 opacity-70">{hint}</p>
        <ul className="mt-3 space-y-1.5">
          {items.map((item) => (
            <li key={item.caseId} className="rounded-lg bg-black/25 px-2.5 py-2">
              <div className="flex items-start gap-2.5">
                {selectable ? (
                  <input
                    type="checkbox"
                    checked={Boolean(selected[item.caseId])}
                    onChange={(event) => setSelected((previous) => ({ ...previous, [item.caseId]: event.target.checked }))}
                    className="mt-0.5 size-3.5 shrink-0 accent-white"
                    aria-label={`Select ${item.reference} for the batch`}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[0.72rem] text-white/85">{item.businessName}</span>
                    <span className="shrink-0 font-mono text-[0.58rem] text-white/34">{item.reference}</span>
                  </div>
                  <p className="mt-0.5 text-[0.62rem] leading-4 text-white/38">
                    {item.tier === "blocked"
                      ? item.blockedReason
                      : item.tier === "signed_ready"
                        ? `Signed funder proposal ${date(item.signedFunderProposalAt)} · ${item.siteCity}`
                        : `EOI ${date(item.eoiSignedAt)} · readiness ${date(item.kycReadinessConfirmedAt)} · ${item.siteCity}`}
                  </p>
                </div>
              </div>
            </li>
          ))}
          {items.length === 0 ? <li className="px-2.5 py-1 text-[0.62rem] opacity-45">Empty.</li> : null}
        </ul>
      </div>
    );
  }

  return (
    <section className="rounded-[2rem] border border-white/10 bg-black/30 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.62rem] uppercase tracking-[0.2em] text-white/34">Submission queue · the drum</p>
          <p className="mt-1 text-[0.68rem] text-white/38">Batch complete packs on the weekly rhythm. Every batch carries a numbered manifest; every submission starts a 7-day SLA clock (cl. 4.2.1).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={channel} onChange={(event) => setChannel(event.target.value)} className="h-9 rounded-lg border border-white/14 bg-black px-2 text-[0.66rem] text-white/78">
            <option value="eden_ufms">Eden / UFMS</option>
            <option value="awaken_wheeling">Awaken wheeling</option>
            <option value="both">Both</option>
          </select>
          <button
            type="button"
            disabled={busy || selectedIds.length === 0}
            onClick={() => void runBatch()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white bg-white px-4 text-[0.64rem] font-medium uppercase tracking-[0.13em] text-black transition hover:bg-white/88 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <OrbitalBusyDot /> : <Send className="size-3.5" />} Submit {selectedIds.length || ""} to funder
          </button>
        </div>
      </div>

      {error ? <p className="mt-3 text-[0.68rem] text-rose-200" role="alert">{error}</p> : null}

      {result ? (
        <div className="mt-4 rounded-[1.2rem] border border-emerald-300/22 bg-emerald-300/[0.05] p-4">
          <p className="text-[0.66rem] font-medium uppercase tracking-[0.14em] text-emerald-200">Batch {result.batchReference} recorded · {result.submitted.length} case{result.submitted.length === 1 ? "" : "s"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadBlob(`${result.batchReference}.txt`, result.manifestText, "text/plain")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/16 bg-white/[0.03] px-3 text-[0.6rem] uppercase tracking-[0.12em] text-white/72 hover:bg-white/10">
              <FileDown className="size-3" /> Manifest (text)
            </button>
            <button type="button" onClick={() => downloadBlob(`${result.batchReference}.json`, JSON.stringify(result.manifest, null, 2), "application/json")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/16 bg-white/[0.03] px-3 text-[0.6rem] uppercase tracking-[0.12em] text-white/72 hover:bg-white/10">
              <Download className="size-3" /> Manifest (JSON)
            </button>
            <button type="button" onClick={() => window.location.reload()} className="inline-flex h-8 items-center rounded-lg border border-white/16 bg-white/[0.03] px-3 text-[0.6rem] uppercase tracking-[0.12em] text-white/72 hover:bg-white/10">
              Refresh view
            </button>
          </div>
          {result.failures.length ? (
            <ul className="mt-2 space-y-1">
              {result.failures.map((failure) => (
                <li key={failure.caseId} className="text-[0.64rem] text-amber-200/80">{failure.reference ?? failure.caseId}: {failure.reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {shelf("Signed & ready", "Client returned the signed funder proposal. The funder is waiting on us.", signedReady, true, "border-emerald-300/25 bg-emerald-300/[0.05] text-emerald-100")}
        {shelf("Bankable", "EOI signed + six-item KYC readiness confirmed. Bankable-Pack Rule satisfied.", bankable, true, "border-lime-300/25 bg-lime-300/[0.05] text-lime-100")}
        {shelf("Blocked", "One line each: exactly what is missing before a slot can be consumed.", blocked, false, "border-white/12 bg-white/[0.03] text-white/70")}
      </div>

      {slaItems.length ? (
        <div className="mt-5">
          <p className="text-[0.62rem] uppercase tracking-[0.2em] text-white/34">SLA clocks · {slaItems.length} live submission{slaItems.length === 1 ? "" : "s"}</p>
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {slaItems.map((item) => <SlaRow key={item.caseId} item={item} />)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

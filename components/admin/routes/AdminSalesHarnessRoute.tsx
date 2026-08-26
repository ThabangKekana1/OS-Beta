"use client";

/**
 * The Sales Harness console (doc 20, Phase 2): the Monday view. The harness
 * assembles; the founder decides. Nothing on this screen sends anything.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, Send, ShieldCheck, Target, XCircle } from "lucide-react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";

type QueueRow = {
  id: string;
  prospectKey: string;
  toAddress: string | null;
  subject: string;
  bodyText: string;
  status: "draft" | "approved" | "rejected" | "sent";
  approvedBy: string | null;
  sentAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  templateKey: string | null;
};

type LeadRow = {
  bookId: string;
  companyName: string;
  sector: string;
  town: string | null;
  estSpendBand: string | null;
  score: number;
  reasons: string[];
};

type DealBook = {
  gatedValueZar: number;
  gatedCount: number;
  weightedPipelineZar: number;
  goalZar: number;
  error?: string;
};

type HarnessView = {
  ok: boolean;
  pipeline: { stageCounts: Array<{ stage: string; count: number }>; totalCases: number };
  leads: LeadRow[];
  queue: QueueRow[];
  dealBook: DealBook;
};

const zar = (value: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(value);

export function AdminSalesHarnessRoute() {
  const [view, setView] = useState<HarnessView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/sales/harness", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (payload?.ok) setView(payload);
    else setNotice(payload?.error ?? "Unable to load the harness view.");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function generate(count: number) {
    setBusy("generate");
    const response = await fetch("/api/admin/sales/harness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate", count }),
    });
    const payload = await response.json().catch(() => null);
    setNotice(payload?.ok ? `${payload.created} first-touch draft(s) queued for approval.` : payload?.error ?? "Generate failed.");
    setBusy(null);
    await refresh();
  }

  async function decide(id: string, action: "approve" | "reject") {
    let reason: string | null = "";
    if (action === "reject") {
      reason = window.prompt("Why is this draft rejected? (becomes a learning signal)");
      if (!reason) return;
    }
    setBusy(id);
    const response = await fetch(`/api/admin/sales/harness/queue/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const payload = await response.json().catch(() => null);
    if (!payload?.ok) setNotice(payload?.error ?? "Gate action failed.");
    setBusy(null);
    await refresh();
  }

  async function dispatch() {
    if (!window.confirm("Dispatch all approved sends now? Caps and cadence are enforced.")) return;
    setBusy("dispatch");
    const response = await fetch("/api/admin/sales/harness/dispatch", { method: "POST" });
    const payload = await response.json().catch(() => null);
    setNotice(
      payload?.ok
        ? `Dispatched ${payload.dispatched} approved send(s); ${payload.results.filter((r: { ok: boolean }) => !r.ok).length} blocked by caps/cadence/provider.`
        : payload?.error ?? "Dispatch failed.",
    );
    setBusy(null);
    await refresh();
  }

  const drafts = view?.queue.filter((row) => row.status === "draft") ?? [];
  const approvedRows = view?.queue.filter((row) => row.status === "approved") ?? [];
  const dealBookPct = view ? Math.min(100, Math.round((view.dealBook.gatedValueZar / view.dealBook.goalZar) * 100)) : 0;

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="1-MI · Sales Harness"
        title="Sales Harness"
        description="The harness prepares everything; you decide what leaves. Nothing sends without your approval."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-white/12 bg-white/[0.03] p-4">
          <p className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-70"><Target className="size-3.5" /> R100m deal book · term sheet only</p>
          <p className="mt-2 text-2xl font-medium">{zar(view?.dealBook.gatedValueZar ?? 0)}</p>
          <p className="mt-1 text-xs opacity-60">{view?.dealBook.gatedCount ?? 0} gated deal(s) · weighted pipeline {zar(view?.dealBook.weightedPipelineZar ?? 0)} (never counted)</p>
          <div className="mt-3 h-1.5 rounded bg-white/10">
            <div className="h-1.5 rounded bg-emerald-400/80" style={{ width: `${dealBookPct}%` }} />
          </div>
          <p className="mt-1 text-[11px] opacity-50">{dealBookPct}% of goal{view?.dealBook.error ? ` · ⚠ ${view.dealBook.error}` : ""}</p>
        </div>
        <div className="rounded-lg border border-white/12 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-wide opacity-70">Pipeline</p>
          <p className="mt-2 text-2xl font-medium">{view?.pipeline.totalCases ?? 0} cases</p>
          <ul className="mt-2 space-y-0.5 text-xs opacity-70">
            {(view?.pipeline.stageCounts ?? []).slice(0, 6).map((stage) => (
              <li key={stage.stage}>{stage.stage}: {stage.count}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-white/12 bg-white/[0.03] p-4 flex flex-col justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-70"><ShieldCheck className="size-3.5" /> Founder gate</p>
            <p className="mt-2 text-sm leading-5 opacity-80">{drafts.length} draft(s) waiting · {approvedRows.length} approved &amp; sendable.</p>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void generate(10)}
              disabled={busy !== null}
              className="rounded-md border border-white/16 px-3 py-1.5 text-xs hover:bg-white/8 disabled:opacity-40"
            >
              {busy === "generate" ? "Assembling…" : "Prepare 10 drafts"}
            </button>
            <button
              type="button"
              onClick={() => void dispatch()}
              disabled={busy !== null || approvedRows.length === 0}
              className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-white/90 disabled:opacity-30"
            >
              <Send className="size-3" /> {busy === "dispatch" ? "Dispatching…" : "Dispatch approved"}
            </button>
          </div>
        </div>
      </section>

      {notice ? (
        <p className="rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-200">{notice}</p>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm uppercase tracking-wide opacity-70">Top-ranked open leads</h2>
          <button type="button" onClick={() => void refresh()} className="flex items-center gap-1 text-xs opacity-60 hover:opacity-100">
            <RefreshCw className="size-3" /> refresh
          </button>
        </div>
        <ul className="divide-y divide-white/8 rounded-lg border border-white/10">
          {(view?.leads ?? []).map((lead) => (
            <li key={lead.bookId} className="flex items-start justify-between gap-4 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{lead.companyName}</p>
                <p className="truncate text-xs opacity-60">{[lead.sector, lead.town, lead.estSpendBand].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 truncate text-[11px] opacity-45">{lead.reasons.join("; ")}</p>
              </div>
              <AdminBadge label={`score ${lead.score}`} />
            </li>
          ))}
          {!view?.leads.length && <li className="p-3 text-sm opacity-60">Every top-ranked lead already has a queued touch. Approve or prepare more.</li>}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wide opacity-70">Send queue</h2>
        <ul className="divide-y divide-white/8 rounded-lg border border-white/10">
          {(view?.queue ?? []).map((row) => (
            <li key={row.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{row.subject}</p>
                  <p className="truncate text-xs opacity-55">{row.prospectKey} → {row.toAddress ?? "(no address on row)"}</p>
                </div>
                <StatusChip status={row.status} />
              </div>
              <details className="mt-2 text-xs opacity-75">
                <summary className="cursor-pointer select-none">review body</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[11px]">{row.bodyText}</pre>
              </details>
              {row.status === "draft" ? (
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={busy === row.id} onClick={() => void decide(row.id, "approve")}
                    className="flex items-center gap-1 rounded-md border border-emerald-300/25 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-300/10">
                    <CheckCircle2 className="size-3" /> approve
                  </button>
                  <button type="button" disabled={busy === row.id} onClick={() => void decide(row.id, "reject")}
                    className="flex items-center gap-1 rounded-md border border-rose-300/25 px-2.5 py-1 text-xs text-rose-200 hover:bg-rose-300/10">
                    <XCircle className="size-3" /> reject
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-[11px] opacity-45">
                  {row.status === "approved" && `approved by ${row.approvedBy}`}
                  {row.status === "sent" && `sent ${new Date(row.sentAt ?? "").toLocaleString()}`}
                  {row.status === "rejected" && `rejected: ${row.rejectedReason}`}
                </p>
              )}
            </li>
          ))}
          {!view?.queue.length && <li className="p-3 text-sm opacity-60">Queue is empty. Prepare drafts to begin.</li>}
        </ul>
      </section>

      <p className="text-[11px] leading-4 opacity-40">
        Caps in force: max 20 sends/day platform-wide, one follow-up per prospect per rolling week.
        An approved send marked here cannot leave the platform by any other path — the gate has no bypass.        Signed in under an admin session; every approval is recorded by name.
      </p>
    </div>
  );
}

function StatusChip({ status }: { status: QueueRow["status"] }) {
  const tone =
    status === "approved" ? "bg-sky-300/15 text-sky-200"
    : status === "sent" ? "bg-emerald-300/15 text-emerald-200"
    : status === "rejected" ? "bg-rose-300/15 text-rose-200"
    : "bg-white/10 opacity-80";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${tone}`}>{status}</span>;
}

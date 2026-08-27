"use client";

/**
 * The Deck — Today (doc 21). Design system: 1OS operator tokens
 * (--panel/--ink/--line/--electric) per NEW F-1 DESIGN_GUIDE.md discipline:
 * evidence-first density, shared-border matrices, 6px geometry, telemetry
 * labels, pills reserved for status, motion only for state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";

type DeckItem = {
  id: string;
  prospectKey: string;
  toAddress: string | null;
  subject: string;
  bodyText: string;
  status: "draft" | "approved" | "rejected" | "sent";
  createdAt: string;
  approvedBy?: string | null;
  sentAt?: string | null;
  rejectedReason?: string | null;
  payload: { bookId?: string; sector?: string; score?: number; scoreReasons?: string[]; companyName?: string };
};

type DeckView = {
  ok: boolean;
  drafts: DeckItem[];
  receipts: DeckItem[];
  receiptsHidden: number;
  approvedCount: number;
  decisions: Array<{ id: string; summary: string | null; reason: string | null; createdAt: string }>;
  brief: {
    dealBook: { gatedValueZar: number; gatedCount: number; weightedPipelineZar: number; goalZar: number } | null;
    funnels: Array<{ sliceKey: string; counts: Record<string, number> }>;
  };
};

const zar = (v: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(v);

export function AdminDeckRoute() {
  const [view, setView] = useState<DeckView | null>(null);
  const [cursor, setCursor] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/deck", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (payload?.ok) {
      setView(payload);
      setCursor((c) => Math.min(c, Math.max(0, payload.drafts.length - 1)));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyVerdicts = useCallback(
    async (verdicts: Array<{ id: string; action: "approve" | "reject"; reason?: string }>) => {
      if (!verdicts.length) return;
      setBusy(true);
      const response = await fetch("/api/admin/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdicts }),
      });
      const payload = await response.json().catch(() => null);
      setNotice(payload?.ok ? `${payload.applied} verdict(s) recorded.` : payload?.error ?? "Verdicts failed.");
      setBusy(false);
      await refresh();
    },
    [],
  );

  const drafts = view?.drafts ?? [];
  const focus = drafts[cursor] ?? null;

  const verdictFocused = useCallback(
    (action: "approve" | "reject") => {
      if (!focus || busy) return;
      if (action === "reject") {
        const reason = window.prompt(`Rejection reason for "${focus.subject}"?`);
        if (!reason) return;
        void applyVerdicts([{ id: focus.id, action, reason }]);
        return;
      }
      void applyVerdicts([{ id: focus.id, action }]);
      setCursor((c) => Math.min(c + 1, Math.max(0, drafts.length - 2 < 0 ? 0 : drafts.length - 2)));
    },
    [focus, busy, applyVerdicts, drafts.length],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key.toLowerCase()) {
        case "j":
          setCursor((c) => Math.min(c + 1, Math.max(0, drafts.length - 1)));
          break;
        case "k":
          setCursor((c) => Math.max(c - 1, 0));
          break;
        case "e":
          if (focus) {
            setExpanded((prev) => {
              const next = new Set(prev);
              next.has(focus.id) ? next.delete(focus.id) : next.add(focus.id);
              return next;
            });
          }
          break;
        case "y":
          event.preventDefault();
          verdictFocused("approve");
          break;
        case "n":
          event.preventDefault();
          verdictFocused("reject");
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drafts.length, focus, verdictFocused]);

  async function approveAllVisible() {
    if (!drafts.length) return;
    const sectorFilter = window.prompt("Approve ALL drafts of which sector? (blank = everything)");
    if (sectorFilter === null) return;
    const target = drafts.filter((d) => !sectorFilter.trim() || d.payload.sector === sectorFilter.trim());
    if (!target.length) {
      setNotice("No drafts match that filter.");
      return;
    }
    if (!window.confirm(`Approve ${target.length} draft(s)?`)) return;
    await applyVerdicts(target.map((item) => ({ id: item.id, action: "approve" as const })));
  }

  const funnel = useMemo(() => view?.brief.funnels.find((f) => f.sliceKey === "_all"), [view]);
  const goalPct = useMemo(() => {
    const book = view?.brief.dealBook;
    if (!book?.goalZar) return 0;
    return Math.min(100, Math.round((book.gatedValueZar / book.goalZar) * 100));
  }, [view]);

  return (
    <div className="space-y-8">
      <AdminHeader
        eyebrow="Today"
        title="The verdict stack."
        description="Everything that needs you, ordered. J/K move · Y approve · N reject · E expand."
        actions={
          <button type="button" onClick={() => void refresh()} className="line-label flex items-center gap-2 hover:text-white">
            <RefreshCw className="size-3" /> sync
          </button>
        }
      />

      {/* Brief matrix: one cell row, shared borders, telemetry labels */}
      <section className="grid grid-cols-1 overflow-hidden rounded-md border border-white/10 sm:grid-cols-3 sm:gap-px sm:bg-white/10">
        <div className="bg-[var(--canvas)] p-4">
          <p className="line-label">Deal book · term sheet gated</p>
          <p className="mt-3 font-mono text-xl tracking-tight text-white">{zar(view?.brief.dealBook?.gatedValueZar ?? 0)}</p>
          <div className="mt-3 h-px w-full bg-white/12">
            <div className="h-px bg-[var(--electric)]" style={{ width: `${Math.max(goalPct, 1)}%` }} />
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
            {goalPct}% OF R100M · {view?.brief.dealBook?.gatedCount ?? 0} GATED · PIPELINE {zar(view?.brief.dealBook?.weightedPipelineZar ?? 0)}
          </p>
        </div>
        <div className="border-t border-white/10 bg-[var(--canvas)] p-4 sm:border-t-0">
          <p className="line-label">Funnel · cumulative</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[11px] text-white/70">
            {[["sent", funnel?.counts.sent], ["replied", funnel?.counts.reply], ["bills-in", funnel?.counts.bills_in], ["term sheet", funnel?.counts.term_sheet]].map(([label, value]) => (
              <div key={String(label)} className="flex justify-between border-b border-white/6 pb-1">
                <dt className="text-white/45">{label}</dt>
                <dd className="tabular-nums">{value ?? 0}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="border-t border-white/10 bg-[var(--canvas)] p-4 sm:border-t-0">
          <p className="line-label">Verdicts waiting</p>
          <p className="mt-3 flex items-baseline gap-3">
            <span className="font-mono text-xl tracking-tight text-white">{drafts.length}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">{view?.approvedCount ?? 0} APPROVED &amp; SENDABLE</span>
          </p>
          <button
            type="button"
            onClick={() => void approveAllVisible()}
            disabled={busy || !drafts.length}
            className="mt-3 min-h-[40px] rounded-sm border border-white/16 px-3 py-1.5 text-xs text-white/80 transition hover:border-white/40 hover:text-white disabled:pointer-events-none disabled:opacity-30"
          >
            Batch approve…
          </button>
        </div>
      </section>

      {notice ? (
        <p className="rounded-sm border border-white/14 bg-white/[0.03] px-3 py-2 text-xs text-white/80">{notice}</p>
      ) : null}

      <section className="space-y-2">
        {!drafts.length && (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-white/12 py-14 text-center">
            <span className="status-dot size-1.5 animate-pulse text-[var(--electric)]" style={{ animationDuration: "3.5s" }} />
            <p className="text-sm text-white/60">Queue clear.</p>
            <p className="line-label">MI WORKS. YOU DECIDE.</p>
          </div>
        )}
        {drafts.length > 0 && (
          <ul className="divide-y divide-white/8 overflow-hidden rounded-md border border-white/12 bg-white/[0.015]">
            {drafts.map((item, index) => {
              const isFocus = index === cursor;
              const isOpen = expanded.has(item.id);
              return (
                <li
                  key={item.id}
                  onMouseEnter={() => setCursor(index)}
                  className={`relative transition-colors ${isFocus ? "bg-white/[0.035]" : "hover:bg-white/[0.02]"}`}
                >
                  {isFocus ? <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-[var(--electric)]" /> : null}
                  <div className="flex items-start justify-between gap-4 px-4 py-3 pl-5">
                    <button type="button" onClick={() => setExpanded((prev) => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; })} className="min-w-0 flex-1 text-left">
                      <p className={`truncate text-[13px] ${isFocus ? "text-white" : "text-white/85"}`}>
                        {item.subject}
                      </p>
                      <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
                        {(item.payload.companyName ?? item.prospectKey)}
                        {item.toAddress ? ` → ${item.toAddress}` : ""}
                        {item.payload.sector ? ` · ${item.payload.sector}` : ""}
                        {" · "}
                        {(item.createdAt ?? "").slice(0, 16).replace("T", " ")}
                      </p>
                    </button>
                    <span className={`mt-0.5 shrink-0 font-mono text-[11px] tabular-nums ${isFocus ? "text-white" : "text-white/50"}`}>
                      {typeof item.payload.score === "number" ? String(item.payload.score).padStart(2, "0") : "--"}
                    </span>
                  </div>

                  {isOpen && (
                    <div className="space-y-2 px-5 pb-3">
                      {!!item.payload.scoreReasons?.length && (
                        <p className="font-mono text-[10px] leading-4 text-white/45">
                          {item.payload.scoreReasons.map((reason) => reason.toUpperCase()).join(" · ")}
                        </p>
                      )}
                      <pre className="whitespace-pre-wrap break-words rounded-sm border border-white/8 bg-black/45 p-3 text-xs leading-5 text-white/85">{item.bodyText}</pre>
                    </div>
                  )}

                  {isFocus ? (
                    <div className="flex items-center gap-3 px-5 pb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-white/55">
                      <span><kbd className="mr-1 rounded-sm border border-white/18 px-1 py-0.5">Y</kbd>APPROVE</span>
                      <span><kbd className="mr-1 rounded-sm border border-white/18 px-1 py-0.5">N</kbd>REJECT</span>
                      <span><kbd className="mr-1 rounded-sm border border-white/18 px-1 py-0.5">E</kbd>EXPAND</span>
                      <span className="ml-auto tabular-nums text-white/35">{index + 1}/{drafts.length}</span>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!!view?.receipts?.length && (
        <section className="space-y-2">
          <h2 className="line-label">Receipts{view.receiptsHidden > 0 ? ` · +${view.receiptsHidden} OLDER` : ""}</h2>
          <ul className="divide-y divide-white/6 rounded-md border border-white/8">
            {view.receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2 text-xs">
                <span className="truncate text-white/60">{r.subject}</span>
                <ReceiptStatus status={r.status} stamp={r.sentAt ?? r.createdAt} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ReceiptStatus({ status, stamp }: { status: DeckItem["status"]; stamp: string }) {
  const tone =
    status === "sent"
      ? "text-[var(--electric)]"
      : status === "approved"
        ? "text-white/80"
        : "text-white/40";
  return (
    <span className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] ${tone}`}>
      {status}{stamp ? ` · ${stamp.slice(0, 10)}` : ""}
    </span>
  );
}

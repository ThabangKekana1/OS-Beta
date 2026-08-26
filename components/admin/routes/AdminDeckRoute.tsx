"use client";

/**
 * The Deck (doc 21) — the admin front door. One ordered queue of verdicts:
 * Y approves, N rejects with a reason, E expands, J/K moves, A approves every
 * visible draft in the current filter. Every card shows its evidence before
 * it asks for a keystroke.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Inbox, Sparkles } from "lucide-react";
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
  const listRef = useRef<HTMLDivElement>(null);

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
      setNotice(payload?.ok ? `${payload.applied} verdict(s) applied.` : payload?.error ?? "Verdicts failed.");
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
    <div className="mx-auto max-w-5xl space-y-6">
      <AdminHeader
        eyebrow="1-MI · The Deck"
        title="Today."
        description="Everything that needs you, in one order. J/K move · Y approve · N reject · E expand · everything else already happened."
      />

      {notice && (
        <p className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-200">{notice}</p>
      )}

      <section className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-white/12 bg-white/[0.03] p-3">
          <p className="text-[11px] uppercase tracking-wide opacity-60">Deal book</p>
          <p className="mt-1 font-medium">{zar(view?.brief.dealBook?.gatedValueZar ?? 0)}</p>
          <div className="mt-2 h-1 rounded bg-white/10"><div className="h-1 rounded bg-emerald-400/80" style={{ width: `${goalPct}%` }} /></div>
          <p className="mt-1 text-[11px] opacity-50">{goalPct}% of R100m · {funnel?.counts.sent ?? 0} touched</p>
        </div>
        <div className="rounded-lg border border-white/12 bg-white/[0.03] p-3">
          <p className="text-[11px] uppercase tracking-wide opacity-60">Waiting on you</p>
          <p className="mt-1 text-2xl font-medium">{drafts.length}</p>
          <button type="button" onClick={() => void approveAllVisible()} disabled={busy || !drafts.length}
            className="mt-2 text-xs underline decoration-dotted opacity-70 hover:opacity-100 disabled:opacity-30">
            batch approve…
          </button>
        </div>
        <div className="rounded-lg border border-white/12 bg-white/[0.03] p-3">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide opacity-60"><Sparkles className="size-3" /> What the harness changed</p>
          <ul className="mt-1 space-y-1 text-[11px] leading-4 opacity-75">
            {(view?.decisions ?? []).slice(0, 2).map((d) => (
              <li key={d.id} className="truncate" title={d.reason ?? ""}>{d.summary ?? d.id}</li>
            ))}
            {!view?.decisions?.length && <li className="opacity-50">No self-changes yet.</li>}
          </ul>
        </div>
      </section>

      <section ref={listRef} className="space-y-2">
        {!drafts.length && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/14 py-12 text-center">
            <Inbox className="size-6 opacity-40" />
            <p className="text-sm opacity-60">Queue clear. The harness works; you live your life.</p>
          </div>
        )}
        {drafts.map((item, index) => {
          const isFocus = index === cursor;
          const isOpen = expanded.has(item.id);
          return (
            <article
              key={item.id}
              onMouseEnter={() => setCursor(index)}
              className={`cursor-default rounded-lg border p-3 transition-colors ${
                isFocus ? "border-emerald-300/40 bg-emerald-300/[0.04]" : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => setExpanded((prev) => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; })}
                  className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium">
                    {isFocus ? <span className="mr-1.5 text-emerald-300">›</span> : null}
                    {item.subject}
                  </p>
                  <p className="truncate text-xs opacity-55">
                    {item.payload.companyName ?? item.prospectKey}
                    {item.toAddress ? ` → ${item.toAddress}` : ""}
                    {item.payload.sector ? ` · ${item.payload.sector}` : ""}
                    {" · "}
                    {(item.createdAt ?? "").slice(0, 16).replace("T", " ")}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <AdminBadge label={typeof item.payload.score === "number" ? `${item.payload.score}` : "—"} tone={isFocus ? "bright" : "neutral"} />
                  {isOpen ? <ChevronUp className="size-4 opacity-50" /> : <ChevronDown className="size-4 opacity-50" />}
                </div>
              </div>

              {isOpen && (
                <div className="mt-3 space-y-2">
                  {!!item.payload.scoreReasons?.length && (
                    <ul className="flex flex-wrap gap-1.5">
                      {item.payload.scoreReasons.map((reason) => (
                        <li key={reason} className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] opacity-75">{reason}</li>
                      ))}
                    </ul>
                  )}
                  <pre className="whitespace-pre-wrap break-words rounded-md bg-black/45 p-3 text-[12px] leading-5 opacity-90">{item.bodyText}</pre>
                </div>
              )}

              {isFocus && (
                <div className="mt-2.5 flex items-center gap-2 text-[11px] opacity-80">
                  <kbd className="rounded border border-white/20 px-1.5 py-0.5">Y</kbd> approve
                  <kbd className="ml-2 rounded border border-white/20 px-1.5 py-0.5">N</kbd> reject
                  <kbd className="ml-2 rounded border border-white/20 px-1.5 py-0.5">E</kbd> expand
                  <span className="ml-auto opacity-50">{index + 1}/{drafts.length}</span>
                </div>
              )}
            </article>
          );
        })}
      </section>

      {!!view?.receipts?.length && (
        <section className="space-y-1.5">
          <h2 className="text-[11px] uppercase tracking-widest opacity-40">Receipts{view.receiptsHidden > 0 ? ` (+${view.receiptsHidden} older)` : ""}</h2>
          <ul className="divide-y divide-white/6 rounded-lg border border-white/8">
            {view.receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                <span className="truncate opacity-65">{r.subject}</span>
                <span className={`shrink-0 text-[10px] uppercase ${
                  r.status === "sent" ? "text-emerald-300/70" : r.status === "approved" ? "text-sky-300/70" : "text-rose-300/70"
                }`}>
                  {r.status}{r.sentAt ? ` ${r.sentAt.slice(0, 10)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

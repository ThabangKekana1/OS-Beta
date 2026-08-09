"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileDown, Search, Send } from "lucide-react";
import { OrbitalBusyDot } from "@/components/FoundationMark";
import {
  migrationCaseOwnerTone,
  migrationCaseStageIndex,
  migrationCaseStageLabel,
  migrationCaseStageTone,
} from "@/components/admin/migration-case-presentation";
import type { SubmissionManifest } from "@/lib/submission-queue";

/**
 * One board row per case. Everything here is derived server-side from
 * lib/worklist + lib/submission-queue (the constraint logic is never
 * duplicated in the client); this component only filters, sorts and renders.
 */
export type CaseBoardRow = {
  caseId: string;
  reference: string;
  businessName: string;
  siteCity: string;
  province: string;
  stage: string;
  daysInStage: number;
  /** THE one next action, from lib/worklist. */
  nextAction: string;
  owner: "Foundation-1" | "Client" | "Funder";
  /** Constraint-order position from buildDailyWorklist (0 sorts first). */
  priority: number;
  slaDayNumber: number | null;
  slaPhase: "waiting" | "escalate" | "breach" | "acknowledged_overdue" | null;
  slaRisk: boolean;
  blocked: boolean;
  blockedReason: string | null;
  /** A funder report is generated and held awaiting operator approval. */
  heldReport: boolean;
  newToday: boolean;
  /** Selectable for the submission batch: readiness tier, when unsubmitted. */
  selectable: "signed_ready" | "bankable" | null;
  lastActivityAt: string;
  createdAt: string;
};

export type CaseBoardInitialFilters = {
  q?: string;
  stage?: string;
  quick?: string;
  sort?: string;
  dir?: string;
};

type QuickFilter = "needs_me" | "new_today" | "sla_risk" | "blocked" | null;
type SortKey = "newest" | "priority" | "reference" | "name" | "stage" | "days" | "owner" | "activity";

type BatchResult = {
  batchReference: string;
  manifest: SubmissionManifest;
  manifestText: string;
  submitted: { caseId: string; reference: string }[];
  failures: { caseId: string; reference: string | null; reason: string }[];
};

const QUICK_FILTERS: { key: Exclude<QuickFilter, null>; label: string }[] = [
  { key: "needs_me", label: "Needs me today" },
  { key: "new_today", label: "New today" },
  { key: "sla_risk", label: "SLA risk" },
  { key: "blocked", label: "Blocked" },
];

function relativeDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (!Number.isFinite(days) || days < 0) return "today";
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function downloadBlob(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Badge({ tone, children, title }: { tone: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[0.54rem] font-semibold uppercase tracking-[0.12em] ${tone}`}>
      {children}
    </span>
  );
}

/**
 * THE BOARD — one dense row per case, worklist priority order by default.
 * Filtering, search and sorting run in memory over the server-derived rows
 * (fine up to the current 250-row fetch limit). Pagination, when needed,
 * slots in below the `visible` computation without touching the row model.
 */
export function MigrationCaseBoard({
  rows,
  initialFilters,
}: {
  rows: CaseBoardRow[];
  initialFilters?: CaseBoardInitialFilters;
}) {
  const [query, setQuery] = useState(initialFilters?.q ?? "");
  const [stageFilter, setStageFilter] = useState(initialFilters?.stage ?? "all");
  const [quick, setQuick] = useState<QuickFilter>(
    QUICK_FILTERS.some((item) => item.key === initialFilters?.quick)
      ? (initialFilters?.quick as QuickFilter)
      : null,
  );
  // Founder rule 2026-08-09: the latest migrations always sit on top.
  const [sortKey, setSortKey] = useState<SortKey>((initialFilters?.sort as SortKey) || "newest");
  const [sortDir, setSortDir] = useState<1 | -1>(initialFilters?.dir === "desc" ? -1 : 1);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [channel, setChannel] = useState("eden_ufms");
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

  // Legacy deep links (`#case-<id>`, from the daily worklist and old
  // notifications) forward straight to the case file.
  useEffect(() => {
    const match = window.location.hash.match(/^#case-(.+)$/);
    if (match && rows.some((row) => row.caseId === match[1])) {
      window.location.replace(`/admin/migration-cases/${encodeURIComponent(match[1])}`);
    }
  }, [rows]);

  /** The active filters as a querystring — synced to the URL so the case
   * file's back link restores the exact board view. */
  function filterQuery(next: {
    q?: string; stage?: string; quick?: QuickFilter; sort?: SortKey; dir?: 1 | -1;
  } = {}): string {
    const params = new URLSearchParams();
    const q = next.q ?? query;
    const stage = next.stage ?? stageFilter;
    const quickValue = "quick" in next ? next.quick : quick;
    const sort = next.sort ?? sortKey;
    const dir = next.dir ?? sortDir;
    if (q) params.set("q", q);
    if (stage !== "all") params.set("stage", stage);
    if (quickValue) params.set("quick", quickValue);
    if (sort !== "newest") params.set("sort", sort);
    if (dir === -1) params.set("dir", "desc");
    return params.toString();
  }

  function syncUrl(next: Parameters<typeof filterQuery>[0]) {
    const qs = filterQuery(next);
    window.history.replaceState(null, "", `/admin/migration-cases${qs ? `?${qs}` : ""}`);
  }

  const stageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.stage, (counts.get(row.stage) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => migrationCaseStageIndex(a[0]) - migrationCaseStageIndex(b[0]));
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (stageFilter !== "all" && row.stage !== stageFilter) return false;
      if (quick === "needs_me" && !(row.owner === "Foundation-1" && row.stage !== "term_sheet_issued")) return false;
      if (quick === "new_today" && !row.newToday) return false;
      if (quick === "sla_risk" && !row.slaRisk) return false;
      if (quick === "blocked" && !row.blocked) return false;
      if (needle && !row.businessName.toLowerCase().includes(needle) && !row.reference.toLowerCase().includes(needle)) return false;
      return true;
    });
    const compare = (a: CaseBoardRow, b: CaseBoardRow): number => {
      switch (sortKey) {
        case "reference": return a.reference.localeCompare(b.reference);
        case "name": return a.businessName.localeCompare(b.businessName);
        case "stage": return migrationCaseStageIndex(a.stage) - migrationCaseStageIndex(b.stage);
        case "days": return a.daysInStage - b.daysInStage;
        case "owner": return a.owner.localeCompare(b.owner);
        case "activity": return a.lastActivityAt.localeCompare(b.lastActivityAt);
        case "priority": return a.priority - b.priority;
        default: return b.createdAt.localeCompare(a.createdAt);
      }
    };
    filtered.sort((a, b) => sortDir * compare(a, b) || a.priority - b.priority);
    return filtered;
  }, [rows, query, stageFilter, quick, sortKey, sortDir]);

  const selectableVisible = visible.filter((row) => row.selectable);
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      const dir: 1 | -1 = sortDir === 1 ? -1 : 1;
      setSortDir(dir);
      syncUrl({ dir });
    } else {
      const dir: 1 | -1 = key === "activity" || key === "days" ? -1 : 1;
      setSortKey(key);
      setSortDir(dir);
      syncUrl({ sort: key, dir });
    }
  }

  async function runBatch() {
    setBatchBusy(true);
    setBatchError("");
    try {
      const response = await fetch("/api/admin/migration-cases/submission-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseIds: selectedIds, channel }),
      });
      const payload = (await response.json().catch(() => null)) as (BatchResult & { ok?: boolean; error?: string }) | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "The batch failed.");
      setBatchResult(payload);
      setSelected({});
    } catch (issue) {
      setBatchError(issue instanceof Error ? issue.message : "The batch failed.");
    } finally {
      setBatchBusy(false);
    }
  }

  const backQuery = filterQuery();
  const caseHref = (row: CaseBoardRow) =>
    `/admin/migration-cases/${encodeURIComponent(row.caseId)}${backQuery ? `?back=${encodeURIComponent(backQuery)}` : ""}`;

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDir === 1 ? " ↑" : " ↓") : "");
  const headerButton = (key: SortKey, label: string) => (
    <button type="button" onClick={() => toggleSort(key)} className="text-left uppercase tracking-[0.18em] transition hover:text-white/60">
      {label}{sortIndicator(key)}
    </button>
  );

  return (
    <section className="space-y-3">
      {/* ---- Top bar: search · quick filters · batch action ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); syncUrl({ q: event.target.value }); }}
            placeholder="Search name or reference"
            className="h-9 w-64 rounded-lg border border-white/14 bg-black pl-8 pr-3 text-[0.72rem] text-white/82 placeholder:text-white/26 outline-none transition focus:border-white/40"
          />
        </label>
        {QUICK_FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              const next = quick === item.key ? null : item.key;
              setQuick(next);
              syncUrl({ quick: next });
            }}
            className={`inline-flex h-9 items-center rounded-lg border px-3 text-[0.62rem] font-medium uppercase tracking-[0.13em] transition ${
              quick === item.key
                ? "border-white bg-white text-black"
                : "border-white/14 bg-white/[0.03] text-white/58 hover:bg-white/10"
            }`}
          >
            {item.label}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            className="h-9 rounded-lg border border-white/14 bg-black px-2 text-[0.66rem] text-white/78"
            aria-label="Submission channel"
          >
            <option value="eden_ufms">Eden / UFMS</option>
            <option value="awaken_wheeling">Awaken wheeling</option>
            <option value="both">Both</option>
          </select>
          <button
            type="button"
            disabled={batchBusy || selectedIds.length === 0}
            onClick={() => void runBatch()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white bg-white px-4 text-[0.62rem] font-medium uppercase tracking-[0.13em] text-black transition hover:bg-white/88 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {batchBusy ? <OrbitalBusyDot /> : <Send className="size-3.5" />}
            Submit {selectedIds.length || ""} to funder
          </button>
        </div>
      </div>

      {/* ---- Stage pills with counts ---- */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => { setStageFilter("all"); syncUrl({ stage: "all" }); }}
          className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[0.6rem] uppercase tracking-[0.12em] transition ${
            stageFilter === "all" ? "border-white bg-white text-black" : "border-white/14 bg-white/[0.03] text-white/58 hover:bg-white/10"
          }`}
        >
          All <span className="font-semibold">{rows.length}</span>
        </button>
        {stageCounts.map(([stage, count]) => (
          <button
            key={stage}
            type="button"
            onClick={() => {
              const next = stageFilter === stage ? "all" : stage;
              setStageFilter(next);
              syncUrl({ stage: next });
            }}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[0.6rem] uppercase tracking-[0.12em] transition ${
              stageFilter === stage ? "border-white bg-white text-black" : `${migrationCaseStageTone(stage)} hover:brightness-125`
            }`}
          >
            {migrationCaseStageLabel(stage)} <span className="font-semibold">{count}</span>
          </button>
        ))}
      </div>

      {batchError ? <p className="text-[0.68rem] text-rose-200" role="alert">{batchError}</p> : null}
      {batchResult ? (
        <div className="rounded-[1.2rem] border border-emerald-300/22 bg-emerald-300/[0.05] p-4">
          <p className="text-[0.66rem] font-medium uppercase tracking-[0.14em] text-emerald-200">
            Batch {batchResult.batchReference} recorded · {batchResult.submitted.length} case{batchResult.submitted.length === 1 ? "" : "s"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadBlob(`${batchResult.batchReference}.txt`, batchResult.manifestText, "text/plain")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/16 bg-white/[0.03] px-3 text-[0.6rem] uppercase tracking-[0.12em] text-white/72 hover:bg-white/10">
              <FileDown className="size-3" /> Manifest (text)
            </button>
            <button type="button" onClick={() => downloadBlob(`${batchResult.batchReference}.json`, JSON.stringify(batchResult.manifest, null, 2), "application/json")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/16 bg-white/[0.03] px-3 text-[0.6rem] uppercase tracking-[0.12em] text-white/72 hover:bg-white/10">
              <Download className="size-3" /> Manifest (JSON)
            </button>
            <button type="button" onClick={() => window.location.reload()} className="inline-flex h-8 items-center rounded-lg border border-white/16 bg-white/[0.03] px-3 text-[0.6rem] uppercase tracking-[0.12em] text-white/72 hover:bg-white/10">
              Refresh view
            </button>
          </div>
          {batchResult.failures.length ? (
            <ul className="mt-2 space-y-1">
              {batchResult.failures.map((failure) => (
                <li key={failure.caseId} className="text-[0.64rem] text-amber-200/80">{failure.reference ?? failure.caseId}: {failure.reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* ---- The table ---- */}
      <div className="overflow-hidden rounded-[1.4rem] border border-white/10 bg-black/30">
        <div className="hidden grid-cols-[1.4rem_7.2rem_1.1fr_8.2rem_3.4rem_1.5fr_5.6rem_9rem_4.6rem] items-center gap-3 border-b border-white/10 px-4 py-3 text-[0.56rem] text-white/30 lg:grid">
          <span className="flex justify-center">
            <input
              type="checkbox"
              aria-label="Select all bankable rows"
              checked={selectableVisible.length > 0 && selectableVisible.every((row) => selected[row.caseId])}
              onChange={(event) => {
                const on = event.target.checked;
                setSelected((previous) => {
                  const next = { ...previous };
                  for (const row of selectableVisible) next[row.caseId] = on;
                  return next;
                });
              }}
              className="size-3.5 accent-white"
            />
          </span>
          {headerButton("reference", "Reference")}
          {headerButton("name", "Business")}
          {headerButton("stage", "Stage")}
          {headerButton("days", "Days")}
          {headerButton("priority", "Next action")}
          {headerButton("owner", "Owner")}
          <span className="uppercase tracking-[0.18em]">Alerts</span>
          {headerButton("activity", "Activity")}
        </div>
        <div className="divide-y divide-white/6">
          {visible.map((row) => (
            <div key={row.caseId} className="relative flex flex-wrap items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.03] lg:grid lg:grid-cols-[1.4rem_7.2rem_1.1fr_8.2rem_3.4rem_1.5fr_5.6rem_9rem_4.6rem]">
              <span className="relative z-10 flex justify-center">
                {row.selectable ? (
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.reference} for the submission batch`}
                    checked={Boolean(selected[row.caseId])}
                    onChange={(event) => setSelected((previous) => ({ ...previous, [row.caseId]: event.target.checked }))}
                    className="size-3.5 accent-white"
                    title={row.selectable === "signed_ready" ? "Signed funder proposal in hand" : "Bankable — EOI + KYC readiness confirmed"}
                  />
                ) : (
                  <span className="block size-3.5" />
                )}
              </span>
              <a href={caseHref(row)} className="font-mono text-[0.62rem] text-white/56 hover:text-white" aria-label={`Open case ${row.reference}`}>
                <span className="absolute inset-0" aria-hidden />
                {row.reference.replace(/^F1-MC-/, "")}
              </a>
              <span className="min-w-0">
                <span className="block truncate text-[0.8rem] text-white/90">{row.businessName}</span>
                <span className="block truncate text-[0.6rem] text-white/30">{row.siteCity}, {row.province}</span>
              </span>
              <span>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.54rem] uppercase tracking-[0.12em] ${migrationCaseStageTone(row.stage)}`}>
                  {migrationCaseStageLabel(row.stage)}
                </span>
              </span>
              <span className={`text-[0.78rem] font-medium ${row.daysInStage >= 14 ? "text-rose-200" : row.daysInStage >= 7 ? "text-amber-200" : "text-white/64"}`}>
                {row.daysInStage}d
              </span>
              <span className="min-w-0 truncate text-[0.68rem] leading-5 text-white/62" title={row.nextAction}>{row.nextAction}</span>
              <span>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.54rem] uppercase tracking-[0.12em] ${migrationCaseOwnerTone(row.owner)}`}>
                  {row.owner === "Foundation-1" ? "Us" : row.owner}
                </span>
              </span>
              <span className="flex flex-wrap gap-1">
                {row.slaDayNumber !== null ? (
                  <Badge tone={row.slaPhase === "breach" || row.slaPhase === "acknowledged_overdue"
                    ? "border-rose-300/40 bg-rose-300/10 text-rose-200"
                    : row.slaPhase === "escalate"
                      ? "border-amber-300/40 bg-amber-300/10 text-amber-200"
                      : "border-cyan-300/30 bg-cyan-300/8 text-cyan-100"}
                    title="SLA clock (dealer agreement cl. 4.2.1)"
                  >
                    SLA d{row.slaDayNumber}
                  </Badge>
                ) : null}
                {row.blocked ? (
                  <Badge tone="border-orange-300/35 bg-orange-300/8 text-orange-200" title={row.blockedReason ?? undefined}>Blocked</Badge>
                ) : null}
                {row.heldReport ? (
                  <Badge tone="border-violet-300/40 bg-violet-300/10 text-violet-200" title="Funder report held — approve on the case file">Held report</Badge>
                ) : null}
                {row.newToday ? (
                  <Badge tone="border-emerald-300/40 bg-emerald-300/10 text-emerald-200">New</Badge>
                ) : null}
              </span>
              <span className="text-[0.64rem] text-white/38">{relativeDays(row.lastActivityAt)}</span>
            </div>
          ))}
          {visible.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-white/42">No cases match the current filters.</p>
            </div>
          ) : null}
        </div>
      </div>
      <p className="text-[0.6rem] text-white/24">
        {visible.length} of {rows.length} case{rows.length === 1 ? "" : "s"} · default order is the daily-worklist constraint priority · tick rows to batch-submit bankable packs.
      </p>
    </section>
  );
}

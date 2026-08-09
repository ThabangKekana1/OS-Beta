"use client";

import { useState } from "react";
import { Check, RefreshCw, ShieldAlert } from "lucide-react";
import { OrbitalBusyDot } from "@/components/FoundationMark";

/** Crosscheck rows as returned by the funder-report API (trimmed for UI). */
export type FunderReportCrosscheckView = {
  source: string;
  field: string;
  stated: number | null;
  predicted: number | null;
  deviationPct: number | null;
  pass: boolean | null;
  note: string;
};

export type FunderReportView = {
  status: "ready" | "hold_for_operator";
  generatedAt: string;
  operatorConfirmed: boolean;
  holdReasons: string[];
  crosschecks: FunderReportCrosscheckView[];
};

const CORRECTION_FIELDS: { key: string; label: string }[] = [
  { key: "ufmsMonthlyCharge", label: "UFMS monthly charge (R)" },
  { key: "ufmsEscalationPct", label: "UFMS escalation %" },
  { key: "ufmsTermYears", label: "UFMS term (years)" },
  { key: "pvKwp", label: "PV size (kWp)" },
  { key: "bessKwh", label: "BESS (kWh)" },
  { key: "monthlyGenerationKwh", label: "Monthly generation (kWh)" },
  { key: "wheelingRatePerKwh", label: "Wheeling rate (R/kWh)" },
  { key: "wheelingEscalationPct", label: "Wheeling escalation %" },
  { key: "wheelingTermYears", label: "Wheeling term (years)" },
];

function date(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

/**
 * The funder-report approval desk (founder rule 2026-08-08: every report is
 * operator-approved before the client sees it). Wraps the existing
 * `/api/admin/migration-cases/[id]/funder-report` API:
 *   generate → re-run the extraction pipeline over the uploaded funder paper;
 *   confirm  → approve (optionally with corrected figures) and release.
 */
export function FunderReportControl({
  caseId,
  initial,
}: {
  caseId: string;
  initial: FunderReportView | null;
}) {
  const [report] = useState<FunderReportView | null>(initial);
  const [busy, setBusy] = useState<"generate" | "confirm" | null>(null);
  const [error, setError] = useState("");
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [showCorrections, setShowCorrections] = useState(false);

  async function run(action: "generate" | "confirm") {
    setBusy(action);
    setError("");
    try {
      const body: Record<string, unknown> = { action };
      if (action === "confirm") {
        const parsed: Record<string, number> = {};
        for (const [key, raw] of Object.entries(corrections)) {
          const value = Number(raw);
          if (raw.trim() !== "" && Number.isFinite(value) && value > 0) parsed[key] = value;
        }
        if (Object.keys(parsed).length > 0) body.corrections = parsed;
      }
      const response = await fetch(`/api/admin/migration-cases/${encodeURIComponent(caseId)}/funder-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "The funder-report action failed.");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The funder-report action failed.");
      setBusy(null);
    }
  }

  const held = report && !report.operatorConfirmed;
  const failing = report?.crosschecks.filter((row) => row.pass === false) ?? [];

  return (
    <div className={`space-y-2 rounded-xl border p-3 ${
      held ? "border-amber-300/22 bg-amber-300/[0.04]" : "border-white/10 bg-white/[0.02]"
    }`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-2 text-[0.62rem] font-medium uppercase tracking-[0.14em] text-white/64">
          <ShieldAlert className="size-3.5" /> Funder report desk
        </p>
        {report ? (
          <span className={`rounded-md border px-2 py-0.5 text-[0.56rem] font-semibold uppercase tracking-[0.14em] ${
            report.operatorConfirmed
              ? "border-emerald-300/45 bg-emerald-300/14 text-emerald-200"
              : report.status === "ready"
                ? "border-amber-300/40 bg-amber-300/10 text-amber-200"
                : "border-rose-300/40 bg-rose-300/10 text-rose-200"
          }`}>
            {report.operatorConfirmed
              ? "Approved & released"
              : report.status === "ready"
                ? "Verified clean · held for your approval"
                : "Held — extraction needs review"}
          </span>
        ) : (
          <span className="rounded-md border border-white/14 bg-white/[0.04] px-2 py-0.5 text-[0.56rem] uppercase tracking-[0.14em] text-white/40">
            No report generated yet
          </span>
        )}
      </div>
      {report ? (
        <p className="text-[0.64rem] text-white/38">Generated {date(report.generatedAt)}.</p>
      ) : (
        <p className="text-[0.66rem] leading-5 text-white/40">
          Run the pipeline once a machine-readable funder proposal (UFMS or wheeling) has been issued on this case.
        </p>
      )}
      {report && !report.operatorConfirmed && report.holdReasons.length ? (
        <ul className="space-y-1 rounded-lg border border-rose-300/18 bg-rose-300/[0.04] p-2.5">
          {report.holdReasons.map((reason) => (
            <li key={reason} className="text-[0.66rem] leading-5 text-rose-100/85">{reason}</li>
          ))}
        </ul>
      ) : null}
      {failing.length ? (
        <details className="rounded-lg border border-white/10 bg-black/25 p-2.5" open={Boolean(held)}>
          <summary className="cursor-pointer text-[0.62rem] uppercase tracking-[0.13em] text-amber-200/78">
            {failing.length} failing cross-check{failing.length === 1 ? "" : "s"} · stated vs clone engine
          </summary>
          <ul className="mt-2 space-y-1.5">
            {failing.map((row) => (
              <li key={`${row.source}:${row.field}`} className="text-[0.64rem] leading-5 text-white/56">
                <span className="font-mono text-white/72">{row.source} · {row.field}</span>
                {" — "}stated {row.stated ?? "—"} vs predicted {row.predicted ?? "—"}
                {row.deviationPct !== null ? ` (${row.deviationPct.toFixed(1)}% off)` : ""}
                {row.note ? ` · ${row.note}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {held ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowCorrections((current) => !current)}
            className="text-[0.62rem] uppercase tracking-[0.13em] text-white/48 underline underline-offset-4"
          >
            {showCorrections ? "Hide corrections" : "Correct extracted figures before approving"}
          </button>
          {showCorrections ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {CORRECTION_FIELDS.map((field) => (
                <label key={field.key} className="block">
                  <span className="mb-1 block text-[0.56rem] uppercase tracking-[0.13em] text-white/36">{field.label}</span>
                  <input
                    value={corrections[field.key] ?? ""}
                    onChange={(event) => setCorrections((current) => ({ ...current, [field.key]: event.target.value }))}
                    inputMode="decimal"
                    placeholder="as stated"
                    className="h-8 w-full rounded-lg border border-white/14 bg-black px-2 text-[0.66rem] text-white/78 placeholder:text-white/22"
                  />
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run("generate")}
          className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/16 bg-white/[0.03] px-3 text-[0.62rem] font-medium uppercase tracking-[0.13em] text-white/72 transition hover:bg-white/10 disabled:opacity-40"
        >
          {busy === "generate" ? <OrbitalBusyDot /> : <RefreshCw className="size-3.5" />}
          {report ? "Re-run report" : "Generate report"}
        </button>
        {held ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("confirm")}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-white bg-white px-3 text-[0.62rem] font-medium uppercase tracking-[0.13em] text-black transition hover:bg-white/88 disabled:opacity-40"
          >
            {busy === "confirm" ? <OrbitalBusyDot /> : <Check className="size-3.5" />}
            Approve & release to client
          </button>
        ) : null}
      </div>
      {error ? <p className="text-[0.66rem] text-rose-200" role="alert">{error}</p> : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Download, FileUp, Files, Megaphone } from "lucide-react";
import { OrbitalBusyDot } from "@/components/FoundationMark";

type CaseFile = {
  id: string;
  group: string;
  label: string;
  originalName: string;
  sizeBytes: number | null;
  createdAt: string;
  url: string | null;
};

const FIELD =
  "h-9 w-full rounded-lg border border-white/14 bg-white/[0.04] px-3 text-[0.72rem] text-white outline-none transition focus:border-white/45";
const LABEL = "mb-1.5 block text-[0.58rem] uppercase tracking-[0.15em] text-white/40";

function size(bytes: number | null) {
  if (!bytes) return "";
  return bytes > 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Phase 1 operator desk: pull the client's bills out, run the assessment off
 * platform, publish the result back. Publishing notifies the client.
 */
export function AssessmentPublishControl({
  caseId,
  reference,
  hasBillPack,
  publishedAt,
  publishedSource,
}: {
  caseId: string;
  reference: string;
  hasBillPack: boolean;
  publishedAt: string | null;
  publishedSource: string | null;
}) {
  const [files, setFiles] = useState<CaseFile[] | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    currentMonthlyCostExVat: "",
    solutionMonthlyCostExVat: "",
    yearOneMonthlyDifference: "",
    tenYearDifference: "",
    tariffProvider: "",
    tariffNames: "",
    billingPeriods: "",
    coveredDays: "",
    note: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function loadFiles() {
    setLoadingFiles(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/migration-cases/${encodeURIComponent(caseId)}/files`);
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; files?: CaseFile[]; error?: string }
        | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "Could not load the documents.");
      setFiles(payload.files ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the documents.");
    } finally {
      setLoadingFiles(false);
    }
  }

  async function publish() {
    if (!file) {
      setError("Choose the assessment PDF.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      for (const [key, value] of Object.entries(form)) body.set(key, value);
      const response = await fetch(
        `/api/admin/migration-cases/${encodeURIComponent(caseId)}/proposal`,
        { method: "POST", body },
      );
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "Could not publish the assessment.");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not publish the assessment.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { setFiles(null); void loadFiles(); }}
          disabled={loadingFiles}
          className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/16 bg-white/[0.03] px-3 text-[0.62rem] font-medium uppercase tracking-[0.13em] text-white/72 transition hover:bg-white/10 disabled:opacity-40"
        >
          {loadingFiles ? <OrbitalBusyDot /> : <Files className="size-3.5" />} Case documents
        </button>
        {hasBillPack ? (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-white bg-white px-3 text-[0.62rem] font-medium uppercase tracking-[0.13em] text-black transition hover:bg-white/88"
          >
            <Megaphone className="size-3.5" /> {publishedAt ? "Republish assessment" : "Publish assessment"}
          </button>
        ) : (
          <p className="text-[0.68rem] text-white/30">No utility bill pack yet.</p>
        )}
      </div>

      {publishedAt ? (
        <p className="text-[0.66rem] text-white/38">
          Published {new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(new Date(publishedAt))}
          {publishedSource === "operator" ? " by an operator." : " by the engine."}
        </p>
      ) : null}

      {files ? (
        files.length === 0 ? (
          <p className="text-[0.68rem] text-white/30">No documents held for this case.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/12">
            {files.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 border-b border-white/8 bg-white/[0.02] px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.7rem] text-white/80">{entry.originalName}</p>
                  <p className="text-[0.6rem] uppercase tracking-[0.12em] text-white/32">
                    {entry.label}{entry.sizeBytes ? ` · ${size(entry.sizeBytes)}` : ""}
                  </p>
                </div>
                {entry.url ? (
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-white/16 px-2.5 text-[0.6rem] uppercase tracking-[0.12em] text-white/70 transition hover:bg-white/10"
                  >
                    <Download className="size-3" /> Open
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : null}

      {open && hasBillPack ? (
        <div className="space-y-3 rounded-lg border border-white/14 bg-white/[0.02] p-3.5">
          <p className="text-[0.62rem] uppercase tracking-[0.14em] text-white/45">
            Publish assessment for {reference}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL}>Current monthly cost ex VAT</span>
              <input className={FIELD} inputMode="decimal" value={form.currentMonthlyCostExVat}
                onChange={(event) => set("currentMonthlyCostExVat")(event.target.value)} placeholder="110000" />
            </label>
            <label className="block">
              <span className={LABEL}>Solution monthly cost ex VAT</span>
              <input className={FIELD} inputMode="decimal" value={form.solutionMonthlyCostExVat}
                onChange={(event) => set("solutionMonthlyCostExVat")(event.target.value)} placeholder="103000" />
            </label>
            <label className="block">
              <span className={LABEL}>Year-one monthly movement</span>
              <input className={FIELD} inputMode="decimal" value={form.yearOneMonthlyDifference}
                onChange={(event) => set("yearOneMonthlyDifference")(event.target.value)} placeholder="7000" />
              <span className="mt-1 block text-[0.58rem] text-white/28">Positive saves the client money. Negative is a premium.</span>
            </label>
            <label className="block">
              <span className={LABEL}>Ten-year movement</span>
              <input className={FIELD} inputMode="decimal" value={form.tenYearDifference}
                onChange={(event) => set("tenYearDifference")(event.target.value)} placeholder="1200000" />
            </label>
            <label className="block">
              <span className={LABEL}>Utility provider</span>
              <input className={FIELD} value={form.tariffProvider}
                onChange={(event) => set("tariffProvider")(event.target.value)} placeholder="Eskom" />
            </label>
            <label className="block">
              <span className={LABEL}>Tariff names</span>
              <input className={FIELD} value={form.tariffNames}
                onChange={(event) => set("tariffNames")(event.target.value)} placeholder="Ruraflex, Landrate" />
            </label>
            <label className="block">
              <span className={LABEL}>Billing periods audited</span>
              <input className={FIELD} inputMode="numeric" value={form.billingPeriods}
                onChange={(event) => set("billingPeriods")(event.target.value)} placeholder="6" />
            </label>
            <label className="block">
              <span className={LABEL}>Days covered</span>
              <input className={FIELD} inputMode="numeric" value={form.coveredDays}
                onChange={(event) => set("coveredDays")(event.target.value)} placeholder="182" />
            </label>
          </div>
          <label className="block">
            <span className={LABEL}>Assessment PDF</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => { setError(""); setFile(event.target.files?.[0] ?? null); }}
              className="w-full text-[0.68rem] text-white/70 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-[0.62rem] file:font-medium file:text-black"
            />
          </label>
          <label className="block">
            <span className={LABEL}>Internal note (optional)</span>
            <input className={FIELD} value={form.note}
              onChange={(event) => set("note")(event.target.value)} placeholder="Landrate confirmed across six periods" />
          </label>
          {error ? <p className="text-[0.66rem] text-rose-200" role="alert">{error}</p> : null}
          <button
            type="button"
            onClick={() => void publish()}
            disabled={busy}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-white bg-white px-4 text-[0.62rem] font-medium uppercase tracking-[0.13em] text-black transition hover:bg-white/88 disabled:opacity-40"
          >
            {busy ? <OrbitalBusyDot /> : <FileUp className="size-3.5" />}
            {busy ? "Publishing" : "Publish and notify the client"}
          </button>
          <p className="text-[0.6rem] leading-4 text-white/28">
            Publishing moves the case to the proposal stage, emails the client and adds it to their Updates feed.
          </p>
        </div>
      ) : null}
      {error && !open ? <p className="text-[0.66rem] text-rose-200" role="alert">{error}</p> : null}
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ParsedRow = {
  contactName: string;
  company: string;
  email: string;
  rowNumber: number;
};

type ImportSummary = {
  total: number;
  imported: number;
  skipped: number;
  invalid: number;
};

type ImportResult =
  | { status: "imported"; row: { contactName: string; company: string; email: string }; id: string }
  | { status: "skipped" | "invalid"; row: { contactName?: string; company?: string; email?: string }; reason: string };

const TEMPLATE = "contactName,company,email\nJane Mokoena,Acme Logistics,jane@acme.co.za\n";

function parseCsv(text: string): { rows: ParsedRow[]; error: string | null } {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return { rows: [], error: "File is empty." };

  const lines = trimmed.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length < 2) return { rows: [], error: "CSV needs a header and at least one row." };

  const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
  const idx = {
    contactName: header.indexOf("contactname"),
    company: header.indexOf("company"),
    email: header.indexOf("email"),
  };
  if (idx.contactName < 0 || idx.company < 0 || idx.email < 0) {
    return {
      rows: [],
      error: "CSV must have headers: contactName, company, email.",
    };
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((cell) => cell.trim());
    rows.push({
      contactName: cells[idx.contactName] ?? "",
      company: cells[idx.company] ?? "",
      email: cells[idx.email] ?? "",
      rowNumber: i + 1,
    });
  }
  return { rows, error: null };
}

export function PartnerBulkImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [, startTransition] = useTransition();

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "partner-leads-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setSummary(null);
    setResults([]);
    setParseError(null);
    setParsed([]);
    if (!file) return;

    const text = await file.text();
    const { rows, error } = parseCsv(text);
    if (error) {
      setParseError(error);
      return;
    }
    if (rows.length > 500) {
      setParseError("Maximum 500 rows per import.");
      return;
    }
    setParsed(rows);
  }

  async function submit() {
    if (parsed.length === 0) return;
    setSubmitting(true);
    setSummary(null);
    setResults([]);

    try {
      const response = await fetch("/api/partner/leads/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: parsed.map((row) => ({
            contactName: row.contactName,
            company: row.company,
            email: row.email,
          })),
        }),
      });
      const json = (await response.json()) as {
        ok: boolean;
        error?: string;
        summary?: ImportSummary;
        results?: ImportResult[];
      };
      if (!response.ok || !json.ok) {
        setParseError(json.error ?? "Import failed.");
        return;
      }
      setSummary(json.summary ?? null);
      setResults(json.results ?? []);
      setParsed([]);
      if (fileRef.current) fileRef.current.value = "";
      startTransition(() => router.refresh());
    } catch {
      setParseError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-[1.6rem] border border-white/10 bg-white/[0.02] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-white">Bulk import (CSV)</h2>
          <p className="mt-1 text-xs text-white/55">
            Upload up to 500 leads at once. Required columns: contactName, company, email.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="rounded-full border border-white/14 bg-white/[0.04] px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/[0.08]"
        >
          Download template
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFile}
        className="block w-full text-sm text-white/70 file:mr-4 file:rounded-full file:border file:border-white/14 file:bg-white/[0.04] file:px-4 file:py-2 file:text-xs file:text-white/80 hover:file:bg-white/[0.08]"
      />

      {parseError ? (
        <div className="rounded-[0.9rem] border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-sm text-rose-200">
          {parseError}
        </div>
      ) : null}

      {parsed.length > 0 ? (
        <>
          <div className="rounded-[0.9rem] border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/75">
            {parsed.length} row{parsed.length === 1 ? "" : "s"} ready to import.
          </div>
          <div className="max-h-64 overflow-y-auto rounded-[0.9rem] border border-white/8">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.03] text-[0.6rem] uppercase tracking-[0.18em] text-white/50">
                <tr>
                  <th className="px-3 py-2 font-normal">#</th>
                  <th className="px-3 py-2 font-normal">Contact</th>
                  <th className="px-3 py-2 font-normal">Company</th>
                  <th className="px-3 py-2 font-normal">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6 text-white/80">
                {parsed.slice(0, 50).map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="px-3 py-2 text-white/45">{row.rowNumber}</td>
                    <td className="px-3 py-2">{row.contactName}</td>
                    <td className="px-3 py-2">{row.company}</td>
                    <td className="px-3 py-2 text-white/65">{row.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 50 ? (
              <div className="border-t border-white/8 px-3 py-2 text-center text-[0.65rem] text-white/45">
                + {parsed.length - 50} more
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="self-start rounded-full border border-white/20 bg-white/[0.08] px-5 py-2 text-sm text-white transition hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Importing..." : `Import ${parsed.length} leads`}
          </button>
        </>
      ) : null}

      {summary ? (
        <div className="rounded-[0.9rem] border border-emerald-400/30 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-100">
          Imported {summary.imported} of {summary.total}.{" "}
          {summary.skipped > 0 ? `${summary.skipped} skipped (duplicates). ` : ""}
          {summary.invalid > 0 ? `${summary.invalid} invalid.` : ""}
        </div>
      ) : null}

      {results.length > 0 && (summary?.skipped || 0) + (summary?.invalid || 0) > 0 ? (
        <div className="rounded-[0.9rem] border border-white/10 bg-white/[0.02] p-3">
          <p className="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-white/55">
            Issues
          </p>
          <ul className="flex flex-col gap-1 text-xs text-white/70">
            {results
              .filter((r) => r.status !== "imported")
              .slice(0, 50)
              .map((r, i) => (
                <li key={i}>
                  <span className="text-white/55">[{r.status}]</span>{" "}
                  {r.row.email || r.row.contactName || "(empty row)"} — {r.reason}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

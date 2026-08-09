"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
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

function size(bytes: number | null) {
  if (!bytes) return "";
  return bytes > 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Auto-loading document list over the existing admin files route
 * (`/api/admin/migration-cases/[id]/files`). Signed URLs are short-lived
 * (10 minutes), so a refresh button re-mints them instead of caching.
 */
export function CaseFilesPanel({
  caseId,
  groups,
  emptyLabel = "No documents held for this case.",
}: {
  caseId: string;
  /** Restrict to these file groups (e.g. ["utility_bill"]); omit for all. */
  groups?: string[];
  emptyLabel?: string;
}) {
  const [files, setFiles] = useState<CaseFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const groupsKey = groups?.join(",") ?? "";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/migration-cases/${encodeURIComponent(caseId)}/files`);
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; files?: CaseFile[]; error?: string }
        | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "Could not load the documents.");
      const wanted = groupsKey ? new Set(groupsKey.split(",")) : null;
      setFiles((payload.files ?? []).filter((entry) => !wanted || wanted.has(entry.group)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the documents.");
    } finally {
      setLoading(false);
    }
  }, [caseId, groupsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.6rem] uppercase tracking-[0.15em] text-white/34">
          {files ? `${files.length} file${files.length === 1 ? "" : "s"}` : "Documents"}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/16 bg-white/[0.03] px-2.5 text-[0.6rem] uppercase tracking-[0.12em] text-white/60 transition hover:bg-white/10 disabled:opacity-40"
        >
          {loading ? <OrbitalBusyDot /> : <RefreshCw className="size-3" />} Refresh links
        </button>
      </div>
      {error ? <p className="text-[0.66rem] text-rose-200" role="alert">{error}</p> : null}
      {files && files.length === 0 && !loading ? (
        <p className="text-[0.68rem] text-white/30">{emptyLabel}</p>
      ) : null}
      {files && files.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-white/12">
          {files.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 border-b border-white/8 bg-white/[0.02] px-3 py-2 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate text-[0.7rem] text-white/80">{entry.originalName}</p>
                <p className="text-[0.6rem] uppercase tracking-[0.12em] text-white/32">
                  {entry.label}
                  {entry.sizeBytes ? ` · ${size(entry.sizeBytes)}` : ""}
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
      ) : null}
    </div>
  );
}

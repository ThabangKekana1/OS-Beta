"use client";

import { useMemo, useRef, useState } from "react";

type UtilityBillLeadView = {
  clientProfileId: string;
  company: string;
  contactName: string;
  stage: string;
  eoiSignedAt: string | null;
  eoiSignedBy: string | null;
  uploadedCount: number;
};

type UtilityBillUploadFormProps = {
  token: string;
  initialLead: UtilityBillLeadView;
};

function formatDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function UtilityBillUploadForm({ token, initialLead }: UtilityBillUploadFormProps) {
  const [lead, setLead] = useState(initialLead);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const signedAt = formatDate(lead.eoiSignedAt);
  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  const addFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    if (incoming.length === 0) return;
    setError(null);
    setSuccess(null);
    setFiles((current) => {
      const next = [...current];
      for (const file of incoming) {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!next.some((entry) => `${entry.name}-${entry.size}-${entry.lastModified}` === key)) {
          next.push(file);
        }
      }
      return next.slice(0, 12);
    });
  };

  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  };

  const submit = async () => {
    if (files.length === 0) {
      setError("Choose at least one utility bill file before submitting.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      const response = await fetch(`/api/utility-bills/${token}`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        lead?: UtilityBillLeadView;
        uploadedCount?: number;
      };

      if (!response.ok || !payload.ok || !payload.lead) {
        setError(payload.error ?? "Unable to upload utility bills. Please try again.");
        return;
      }

      setLead(payload.lead);
      setFiles([]);
      setSuccess(
        `${payload.uploadedCount ?? files.length} file${(payload.uploadedCount ?? files.length) === 1 ? "" : "s"} uploaded successfully.`,
      );
    } catch {
      setError("Unable to reach the upload service. Please check your connection and try again.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full max-w-6xl">
      <section className="overflow-hidden rounded-[2rem] border border-white/12 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_34%),rgba(255,255,255,0.045)] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl md:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
          <div className="flex flex-col justify-between rounded-[1.6rem] border border-white/10 bg-black/35 p-5">
            <div>
              <p className="text-[0.66rem] uppercase tracking-[0.3em] text-white/42">
                1OS Qualification Upload
              </p>
              <h1 className="mt-4 max-w-xl text-[clamp(2.15rem,5vw,4.5rem)] font-medium leading-[0.94] tracking-[-0.07em] text-white">
                Upload your utility bills.
              </h1>
              <p className="mt-5 max-w-lg text-sm leading-7 text-white/62">
                We need the last 6 months of utility bills or prepaid electricity receipts so Nedbank can prepare the Generocity proposal for your site.
              </p>
            </div>

            <div className="mt-8 grid gap-2 text-sm text-white/62">
              <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] p-3">
                <span className="block text-[0.62rem] uppercase tracking-[0.22em] text-white/38">Business</span>
                <span className="mt-1 block text-white/82">{lead.company}</span>
              </div>
              <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] p-3">
                <span className="block text-[0.62rem] uppercase tracking-[0.22em] text-white/38">Profile</span>
                <span className="mt-1 block text-white/82">{lead.clientProfileId}</span>
              </div>
              <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] p-3">
                <span className="block text-[0.62rem] uppercase tracking-[0.22em] text-white/38">EOI status</span>
                <span className="mt-1 block text-emerald-100/84">
                  Approved{lead.eoiSignedBy ? ` by ${lead.eoiSignedBy}` : ""}{signedAt ? ` • ${signedAt}` : ""}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-white/10 bg-black/45 p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[0.66rem] uppercase tracking-[0.26em] text-white/42">Secure upload</p>
                <h2 className="mt-2 text-2xl font-medium tracking-[-0.04em] text-white">
                  Last 6 months
                </h2>
              </div>
              <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[0.62rem] uppercase tracking-[0.22em] text-white/56">
                {lead.uploadedCount} on file
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {["PDF or image", "One per month", "Up to 15MB each"].map((item) => (
                <div key={item} className="rounded-[1rem] border border-white/10 bg-white/[0.035] p-3 text-xs uppercase tracking-[0.16em] text-white/54">
                  {item}
                </div>
              ))}
            </div>

            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragOver(false);
                addFiles(event.dataTransfer.files);
              }}
              className={`mt-5 flex min-h-[13rem] flex-col items-center justify-center rounded-[1.4rem] border-2 border-dashed px-5 py-8 text-center transition ${
                isDragOver
                  ? "border-white/45 bg-white/[0.08]"
                  : "border-white/14 bg-black/35"
              }`}
            >
              <p className="text-lg font-medium tracking-[-0.03em] text-white">
                Drop files here
              </p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-white/52">
                Upload municipal bills, prepaid receipts, or electricity statements for the latest 6-month period.
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-5 rounded-full border border-white/18 bg-white px-5 py-2 text-sm font-medium text-black transition hover:bg-white/90"
              >
                Choose files
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt"
                onChange={(event) => {
                  if (event.target.files) addFiles(event.target.files);
                  event.target.value = "";
                }}
                className="hidden"
              />
            </div>

            {files.length > 0 ? (
              <div className="mt-5 rounded-[1.1rem] border border-white/10 bg-white/[0.035] p-3">
                <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.2em] text-white/42">
                  <span>{files.length} selected</span>
                  <span>{formatFileSize(totalSize)}</span>
                </div>
                <ul className="mt-3 space-y-2">
                  {files.map((file, index) => (
                    <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 rounded-[0.85rem] border border-white/8 bg-black/35 px-3 py-2 text-sm text-white/72">
                      <span className="min-w-0 truncate">
                        {file.name}
                        <span className="ml-2 text-xs text-white/38">{formatFileSize(file.size)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="text-[0.62rem] uppercase tracking-[0.18em] text-white/46 transition hover:text-rose-200"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {error ? (
              <p className="mt-4 rounded-[1rem] border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="mt-4 rounded-[1rem] border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                {success}
              </p>
            ) : null}

            <button
              type="button"
              onClick={submit}
              disabled={isUploading || files.length === 0}
              className="mt-5 w-full rounded-[1rem] border border-white bg-white px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:border-white/16 disabled:bg-white/10 disabled:text-white/38"
            >
              {isUploading ? "Uploading..." : "Submit Utility Bills"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

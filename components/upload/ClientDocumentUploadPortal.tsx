"use client";

import { useMemo, useRef, useState } from "react";

type UploadDocumentType = "expression_of_interest" | "signed_eoi" | "utility_bills" | "signed_proposal";

type UploadLeadView = {
  clientProfileId: string;
  company: string;
  contactName: string;
  email: string;
  stage: string;
  documentCounts: Record<UploadDocumentType, number>;
};

type ClientDocumentUploadPortalProps = {
  token: string;
  initialLead: UploadLeadView;
};

const documentOptions: Array<{
  id: UploadDocumentType;
  eyebrow: string;
  label: string;
  description: string;
  promise: string;
  accent: string;
}> = [
  {
    id: "expression_of_interest",
    eyebrow: "EOI Pack",
    label: "Expression of Interest",
    description: "Upload an EOI document or supporting EOI pack for the onboarding file.",
    promise: "Best when the team needs the unsigned EOI or source file.",
    accent: "from-sky-300/24 via-white/[0.045] to-white/[0.02]",
  },
  {
    id: "signed_eoi",
    eyebrow: "Signed EOI",
    label: "Signed Expression of Interest",
    description: "Upload the signed EOI so the profile can progress to utility-bill review.",
    promise: "This updates your dashboard stage automatically.",
    accent: "from-lime-300/24 via-white/[0.045] to-white/[0.02]",
  },
  {
    id: "utility_bills",
    eyebrow: "Bills",
    label: "6 Month Utility Bill",
    description: "Upload electricity statements, invoices, prepaid receipts, or meter documents.",
    promise: "Multiple files are welcome — keep the months in the file names if possible.",
    accent: "from-amber-300/24 via-white/[0.045] to-white/[0.02]",
  },
  {
    id: "signed_proposal",
    eyebrow: "Commercial",
    label: "Signed Proposal",
    description: "Upload a signed proposal after commercial approval or client acceptance.",
    promise: "The team will review it and move the profile into the next stage.",
    accent: "from-fuchsia-300/24 via-white/[0.045] to-white/[0.02]",
  },
];

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function uploadLabel(type: UploadDocumentType) {
  return documentOptions.find((option) => option.id === type)?.label ?? "Document";
}

export function ClientDocumentUploadPortal({ token, initialLead }: ClientDocumentUploadPortalProps) {
  const [lead, setLead] = useState(initialLead);
  const [documentType, setDocumentType] = useState<UploadDocumentType>("utility_bills");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [step, setStep] = useState<"choose" | "upload" | "complete">("choose");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const uploadedTotal = Object.values(lead.documentCounts).reduce((sum, count) => sum + count, 0);
  const progressPercent = Math.min(100, Math.round((uploadedTotal / documentOptions.length) * 100));
  const activeOption = documentOptions.find((option) => option.id === documentType) ?? documentOptions[2];

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

  const chooseDocumentType = (type: UploadDocumentType) => {
    setDocumentType(type);
    setError(null);
    setSuccess(null);
    setStep("upload");
  };

  const submit = async () => {
    if (files.length === 0) {
      setError("Choose at least one file before uploading.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("documentType", documentType);
      files.forEach((file) => formData.append("files", file));

      const response = await fetch(`/api/upload/${encodeURIComponent(token)}`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        lead?: UploadLeadView;
        uploadedCount?: number;
      };

      if (!response.ok || !payload.ok || !payload.lead) {
        setError(payload.error ?? "Unable to upload documents. Please try again.");
        return;
      }

      setLead(payload.lead);
      setFiles([]);
      setSuccess(`${payload.uploadedCount ?? files.length} file${(payload.uploadedCount ?? files.length) === 1 ? "" : "s"} uploaded to your profile.`);
      setStep("complete");
    } catch {
      setError("Unable to reach the upload service. Please check your connection and try again.");
    } finally {
      setIsUploading(false);
    }
  };

  if (!hasStarted) {
    return (
      <section className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="p-6 md:p-8">
          <p className="text-[0.6rem] uppercase tracking-[0.26em] text-lime-200/60">Foundation-1 secure upload</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-white">
            Uploads that feel effortless.
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/54">
            This link is connected to <span className="text-white/78">{lead.company}</span>. Choose the document type, drop the files, and the dashboard updates automatically.
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { label: "Profile", value: lead.clientProfileId },
              { label: "Contact", value: lead.contactName },
              { label: "Stage", value: lead.stage },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
                <span className="block text-[0.52rem] uppercase tracking-[0.18em] text-white/28">{item.label}</span>
                <span className="mt-1 block truncate text-xs text-white/52">{item.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-1 text-xs text-white/36">
            <p>Accepted: PDF, PNG, JPG, DOCX, XLSX, TXT — up to 15 MB each.</p>
            <p>Return to this link any time to upload additional documents.</p>
          </div>
          <button
            type="button"
            onClick={() => setHasStarted(true)}
            className="group mt-6 inline-flex items-center gap-2 rounded-full border border-lime-200/80 bg-lime-200 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-black transition hover:bg-white"
          >
            Start upload
            <span className="transition group-hover:translate-x-0.5">→</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-3">
        <div>
          <p className="text-[0.58rem] uppercase tracking-[0.3em] text-white/38">Secure upload</p>
          <p className="mt-0.5 text-xs text-white/48">{lead.company} · {lead.clientProfileId}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[0.56rem] uppercase tracking-[0.14em] text-white/38">
            {uploadedTotal} on file
          </span>
          <span className="rounded-full border border-lime-200/20 bg-lime-200/6 px-2.5 py-1 text-[0.56rem] uppercase tracking-[0.14em] text-lime-200/58">
            {progressPercent}% profile docs
          </span>
        </div>
      </header>

      <div className="h-[2px] bg-white/[0.06]">
        <div
          className="h-full bg-lime-200/60 transition-[width] duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="flex">
        <aside className="hidden w-44 shrink-0 flex-col border-r border-white/8 p-4 lg:flex">
          <p className="text-[0.55rem] uppercase tracking-[0.2em] text-white/26">Documents</p>
          <nav className="mt-3 flex flex-col gap-1">
            {documentOptions.map((option) => {
              const active = option.id === documentType;
              const count = lead.documentCounts[option.id] ?? 0;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => chooseDocumentType(option.id)}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
                    active ? "bg-lime-200/8 text-lime-100" : "text-white/38 hover:text-white/58"
                  }`}
                >
                  <span className={`flex size-3 shrink-0 items-center justify-center rounded-full border text-[0.42rem] ${count > 0 ? "border-lime-200/36 text-lime-200" : "border-white/14"}`}>
                    {count > 0 ? "✓" : ""}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[0.67rem] leading-4">{option.label}</span>
                    <span className="block text-[0.54rem] text-white/30">{count} uploaded</span>
                  </span>
                </button>
              );
            })}
          </nav>
          <p className="mt-auto pt-4 text-[0.54rem] leading-4 text-white/20">Up to 12 files, 15 MB each.</p>
        </aside>

        <main className="min-w-0 flex-1 p-5 md:p-7">
          {step === "choose" ? (
            <div>
              <p className="text-[0.6rem] uppercase tracking-[0.22em] text-lime-200/54">Step 1 of 2</p>
              <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-white">
                What are you sending us?
              </h2>
              <p className="mt-1 text-xs leading-5 text-white/42">
                Pick the document category. We’ll take it from there.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {documentOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => chooseDocumentType(option.id)}
                    className="rounded-xl border border-white/8 bg-white/[0.025] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
                  >
                    <span className="block text-[0.54rem] uppercase tracking-[0.18em] text-white/30">{option.eyebrow}</span>
                    <span className="mt-1.5 block text-sm font-medium text-white">{option.label}</span>
                    <span className="mt-1 block text-xs leading-4 text-white/40">{option.description}</span>
                    <span className="mt-2 block text-xs text-lime-200/54">Choose →</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === "upload" ? (
            <div>
              <button
                type="button"
                onClick={() => setStep("choose")}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.18em] text-white/42 transition hover:border-white/20 hover:text-white"
              >
                ← Change type
              </button>
              <p className="mt-4 text-[0.6rem] uppercase tracking-[0.22em] text-lime-200/54">Step 2 of 2</p>
              <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-white">
                Drop your {activeOption.label.toLowerCase()} files.
              </h2>
              <p className="mt-1 text-xs leading-5 text-white/42">{activeOption.promise}</p>

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
                className={`mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition duration-200 ${
                  isDragOver
                    ? "border-lime-200/60 bg-lime-300/8"
                    : "border-white/12 bg-white/[0.015] hover:border-white/22"
                }`}
              >
                <span className="flex size-8 items-center justify-center rounded-full border border-white/14 bg-white/[0.06] text-sm">↑</span>
                <p className="mt-3 text-sm font-medium text-white">Drop files here</p>
                <p className="mt-1 text-xs text-white/40">PDF, PNG, JPG, DOCX, XLSX, or TXT</p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-4 rounded-full border border-white bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:bg-lime-200"
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
                <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-3 text-[0.6rem] uppercase tracking-[0.18em] text-white/36">
                    <span>{files.length} ready</span>
                    <span>{formatFileSize(totalSize)}</span>
                  </div>
                  <ul className="mt-2 grid gap-1.5">
                    {files.map((file, index) => (
                      <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/6 bg-black/20 px-3 py-2 text-xs text-white/62">
                        <span className="min-w-0 truncate">
                          {file.name}
                          <span className="ml-1.5 text-white/30">{formatFileSize(file.size)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="shrink-0 text-[0.58rem] uppercase tracking-[0.16em] text-white/34 transition hover:text-rose-300"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {error ? (
                <p className="mt-3 rounded-xl border border-rose-400/22 bg-rose-400/6 px-3 py-2 text-xs text-rose-300">{error}</p>
              ) : null}
              {success ? (
                <p className="mt-3 rounded-xl border border-emerald-400/22 bg-emerald-400/6 px-3 py-2 text-xs text-emerald-300">{success}</p>
              ) : null}

              <button
                type="button"
                onClick={submit}
                disabled={isUploading || files.length === 0}
                className="mt-4 w-full rounded-xl border border-lime-200 bg-lime-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:bg-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/6 disabled:text-white/26"
              >
                {isUploading ? "Uploading..." : `Upload ${uploadLabel(documentType)}`}
              </button>
            </div>
          ) : null}

          {step === "complete" ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <span className="flex size-9 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-300/10 text-sm text-emerald-100">✓</span>
              <p className="mt-4 text-[0.6rem] uppercase tracking-[0.22em] text-emerald-200/60">Uploaded</p>
              <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-white">
                Clean. Saved. Connected.
              </h2>
              <p className="mt-2 max-w-xs text-xs leading-5 text-white/42">
                {success ?? "Your documents were uploaded to the profile."} You can upload another category now or return later using the same link.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSuccess(null);
                    setStep("choose");
                  }}
                  className="rounded-full border border-white bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:bg-lime-200"
                >
                  Upload another
                </button>
                <button
                  type="button"
                  onClick={() => setHasStarted(false)}
                  className="rounded-full border border-white/12 bg-white/[0.03] px-4 py-2 text-xs font-medium text-white/52 transition hover:border-white/24 hover:text-white"
                >
                  Back to overview
                </button>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { FileUp, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminPrimitives";
import type { CaseDocument } from "@/lib/case-documents";

const inputClass =
  "w-full rounded-[0.85rem] border border-white/12 bg-[rgba(8,8,8,0.78)] px-3 py-2 text-sm text-white placeholder:text-white/36 focus:border-white/24 focus:outline-none";
const labelClass = "mb-1.5 block text-[0.62rem] uppercase tracking-[0.2em] text-white/52";

const DOC_KINDS = [
  { value: "proposal", label: "Proposal" },
  { value: "term_sheet", label: "Term Sheet" },
  { value: "utility_bill", label: "Utility Bill" },
  { value: "eoi", label: "EOI" },
  { value: "other", label: "Other" },
];

export function CaseDocumentsRoute() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [docKind, setDocKind] = useState("proposal");
  const [title, setTitle] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [docs, setDocs] = useState<CaseDocument[]>([]);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function refreshDocs() {
    if (!workspaceId || !caseId) {
      setDocs([]);
      return;
    }
    const res = await fetch(
      `/api/admin/case-documents?workspaceId=${encodeURIComponent(workspaceId)}&caseId=${encodeURIComponent(caseId)}`,
    );
    if (res.ok) {
      const json = (await res.json()) as { docs: CaseDocument[] };
      setDocs(json.docs);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!workspaceId || !caseId || !file) {
      setMessage({ kind: "err", text: "workspaceId, caseId, and file are required." });
      return;
    }
    const fd = new FormData();
    fd.set("workspaceId", workspaceId);
    fd.set("caseId", caseId);
    fd.set("docKind", docKind);
    if (title) fd.set("title", title);
    if (customerEmail) fd.set("customerEmail", customerEmail);
    fd.set("file", file);

    startTransition(async () => {
      const res = await fetch("/api/admin/case-documents", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as {
        doc?: CaseDocument;
        extracted?: boolean;
        extractedChars?: number;
        customerNotified?: boolean;
        error?: string;
      };
      if (!res.ok || !json.doc) {
        setMessage({ kind: "err", text: json.error ?? `Upload failed (${res.status}).` });
        return;
      }
      const notifyNote = json.customerNotified ? " Customer notified via email + dashboard." : "";
      setMessage({
        kind: "ok",
        text:
          (json.extracted
            ? `Uploaded. Extracted ${json.extractedChars ?? 0} chars — agent will use this when explaining the document.`
            : "Uploaded. No text extracted (non-PDF or image-only); agent will see metadata only.") + notifyNote,
      });
      setFile(null);
      setTitle("");
      void refreshDocs();
    });
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="Documents"
        title="Case Documents"
        description="Upload proposals, term sheets, EOIs, and utility bills directly to a customer case. Text is extracted from PDFs so the AI can quote and explain them."
      />

      <form
        onSubmit={handleSubmit}
        className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-5"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={labelClass}>Workspace ID</label>
            <input
              className={inputClass}
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              placeholder="e.g. workspace-1"
            />
          </div>
          <div>
            <label className={labelClass}>Case ID</label>
            <input
              className={inputClass}
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              placeholder="e.g. volt-flow"
              onBlur={() => void refreshDocs()}
            />
          </div>
          <div>
            <label className={labelClass}>Document type</label>
            <select
              className={inputClass}
              value={docKind}
              onChange={(e) => setDocKind(e.target.value)}
            >
              {DOC_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Title (optional)</label>
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Generocity Proposal v2"
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>Notify customer email (optional)</label>
            <input
              type="email"
              className={inputClass}
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="customer@business.co.za"
            />
            <p className="mt-1 text-[0.65rem] text-white/48">
              When set, the customer receives an email + dashboard alert that a new document is ready.
            </p>
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>File (PDF preferred for extraction)</label>
            <input
              type="file"
              accept="application/pdf,text/*,image/*"
              className={inputClass}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-white/52">Max 15MB. PDFs get text-extracted automatically.</p>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.06] px-5 py-2 text-xs font-medium uppercase tracking-[0.2em] text-white transition hover:border-white/24 hover:bg-white/[0.1] disabled:opacity-50"
          >
            <FileUp className="size-3.5" />
            {pending ? "Uploading…" : "Upload"}
          </button>
        </div>

        {message ? (
          <div
            className={`mt-4 flex items-start gap-2 rounded-[0.85rem] border px-3 py-2 text-sm ${
              message.kind === "ok"
                ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200"
                : "border-rose-400/20 bg-rose-400/[0.06] text-rose-200"
            }`}
          >
            {message.kind === "ok" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        ) : null}
      </form>

      <section className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-white">
            Documents on case · {docs.length}
          </h2>
          <button
            type="button"
            onClick={() => void refreshDocs()}
            className="text-[0.65rem] uppercase tracking-[0.18em] text-white/56 hover:text-white"
          >
            Refresh
          </button>
        </div>
        {docs.length === 0 ? (
          <p className="mt-4 text-sm text-white/56">
            Enter workspace + case ID and click Refresh, or upload above.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="rounded-[1rem] border border-white/8 bg-white/[0.02] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm text-white">
                      <FileText className="size-3.5 text-white/68" />
                      {doc.title ?? "Untitled"}
                    </p>
                    <p className="mt-0.5 text-[0.65rem] uppercase tracking-[0.18em] text-white/48">
                      {doc.docKind} · {new Date(doc.createdAt).toLocaleString()}
                      {doc.uploadedBy ? ` · ${doc.uploadedBy}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.18em] ${
                      doc.extractedText
                        ? "border-emerald-400/24 bg-emerald-400/[0.06] text-emerald-200"
                        : "border-white/12 bg-white/[0.04] text-white/64"
                    }`}
                  >
                    {doc.extractedText ? `${doc.extractedText.length} chars extracted` : "no text"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

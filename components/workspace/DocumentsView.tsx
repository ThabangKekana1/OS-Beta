"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  FileSignature,
  FileText,
  MessageSquareText,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  useWorkspace,
  type WorkspaceUploadCategory,
} from "@/components/providers/WorkspaceProvider";
import { downloadBlobFile } from "@/lib/download-utils";
import type { DocumentSubmission } from "@/lib/types";

const UTILITY_BILLS_REQUIRED = 6;

type CardProps = {
  title: string;
  status: string;
  body: React.ReactNode;
  actions?: React.ReactNode;
};

function Card({ title, status, body, actions }: CardProps) {
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.84)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="line-label">{title}</p>
          <p className="mt-2 text-base font-medium text-white">{status}</p>
        </div>
      </div>
      <div className="mt-4 text-sm leading-6 text-white/70">{body}</div>
      {actions ? <div className="mt-5 flex flex-wrap gap-2">{actions}</div> : null}
    </article>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  icon: Icon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {Icon ? <Icon className="size-3.5" /> : null}
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  disabled,
  icon: Icon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.04] px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-white/82 transition hover:border-white/24 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {Icon ? <Icon className="size-3.5" /> : null}
      {children}
    </button>
  );
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" }) {
  const palette =
    tone === "ok"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : tone === "warn"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
        : "border-white/14 bg-white/[0.04] text-white/72";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.6rem] font-medium uppercase tracking-[0.18em] ${palette}`}>
      {children}
    </span>
  );
}

function isUtilityBillDoc(doc: DocumentSubmission) {
  return doc.title.toLowerCase().includes("utility bill");
}

type ClientLeadDocument = {
  id: string;
  title: string;
  category: string;
  fileType: "PDF" | "DOCX" | "XLSX" | "PNG" | "TXT";
  status: "pending" | "received" | "reviewed" | "issued" | "signed";
  uploadedAt: string;
  uploadedBy: string;
  fileName: string | null;
  contentType: string | null;
  hasStorage: boolean;
};

type ClientOnboardingLead = {
  id: string;
  clientProfileId: string;
  company: string;
  stage: string;
  eoiSigningToken: string | null;
  eoiSigningPath: string | null;
  eoiSigningUrl: string | null;
  eoiSignedBy: string | null;
  eoiSignedAt: string | null;
  documents: ClientLeadDocument[];
};

type DisplayDocument = DocumentSubmission & {
  leadDocumentId?: string | null;
};

function filenameFromDisposition(header: string | null, fallback: string) {
  if (!header) {
    return fallback;
  }

  const match = header.match(/filename="?([^";]+)"?/i);
  return match?.[1]?.trim() || fallback;
}

function remoteDocumentToSubmission(document: ClientLeadDocument): DisplayDocument {
  return {
    id: `lead:${document.id}`,
    title: document.title,
    category: document.category,
    fileType: document.fileType === "TXT" ? "DOCX" : document.fileType,
    status: document.status,
    updatedAt: document.uploadedAt,
    size: document.hasStorage ? "Stored in 1OS" : "Metadata only",
    audience: "Shared",
    leadDocumentId: document.id,
  };
}

export function DocumentsView() {
  const router = useRouter();
  const { activeCase, uploadFiles, sendMessage, workspaceId } = useWorkspace();
  const utilityInputRef = useRef<HTMLInputElement | null>(null);
  const generalInputRef = useRef<HTMLInputElement | null>(null);
  const [generalCategory, setGeneralCategory] = useState<WorkspaceUploadCategory>("EOI");
  const [clientLead, setClientLead] = useState<ClientOnboardingLead | null>(null);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  const documents = useMemo(() => activeCase?.documents ?? [], [activeCase]);
  const remoteDocuments = useMemo(
    () => (clientLead ? clientLead.documents.map(remoteDocumentToSubmission) : []),
    [clientLead],
  );
  const displayDocuments = useMemo(() => {
    const merged = new Map<string, DisplayDocument>();

    for (const document of documents) {
      merged.set(document.title.trim().toLowerCase(), {
        ...document,
        leadDocumentId: null,
      });
    }

    for (const document of remoteDocuments) {
      merged.set(document.title.trim().toLowerCase(), document);
    }

    return Array.from(merged.values());
  }, [documents, remoteDocuments]);
  const utilityBillCount = useMemo(
    () => displayDocuments.filter(isUtilityBillDoc).length,
    [displayDocuments],
  );

  useEffect(() => {
    if (!activeCase) {
      setClientLead(null);
      return;
    }

    let cancelled = false;

    const loadClientLead = async () => {
      const params = new URLSearchParams();
      params.set("workspaceId", workspaceId);
      params.set("caseName", activeCase.business.name);

      const response = await fetch(`/api/workspace/onboarding?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        lead?: ClientOnboardingLead | null;
      } | null;

      if (cancelled) {
        return;
      }

      if (!response.ok || !payload?.ok) {
        setClientLead(null);
        return;
      }

      setClientLead(payload.lead ?? null);
    };

    void loadClientLead();

    const handleFocus = () => {
      void loadClientLead();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadClientLead();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [activeCase, workspaceId]);

  if (!activeCase) {
    return (
      <div className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-8 text-center text-white/64">
        Select a business from the left rail to view its documents.
      </div>
    );
  }

  const proposal = activeCase.proposal;
  const termSheet = activeCase.termSheet;
  const signedEoiDocument =
    clientLead?.documents.find((doc) =>
      /signed expression of interest|signed eoi/i.test(doc.title),
    ) ?? null;
  const eoiSigned = Boolean(clientLead?.eoiSignedAt) || displayDocuments.some(
    (doc) => doc.title.toLowerCase().includes("expression of interest") && doc.status === "signed",
  );

  const downloadLeadDocument = async (documentId: string, fallbackFilename: string) => {
    setIsDownloading(documentId);

    try {
      const params = new URLSearchParams();
      params.set("documentId", documentId);
      params.set("workspaceId", workspaceId);
      params.set("caseName", activeCase.business.name);

      const response = await fetch(`/api/workspace/lead-documents?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Unable to download ${fallbackFilename}.`);
      }

      const blob = await response.blob();
      const filename = filenameFromDisposition(
        response.headers.get("content-disposition"),
        fallbackFilename,
      );
      downloadBlobFile(filename, blob);
    } finally {
      setIsDownloading(null);
    }
  };

  const handleUtilityChange = (event: ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files;
    if (!list || list.length === 0) return;
    uploadFiles(activeCase.id, "Utility Bills", Array.from(list));
    if (utilityInputRef.current) utilityInputRef.current.value = "";
  };

  const handleGeneralChange = (event: ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files;
    if (!list || list.length === 0) return;
    uploadFiles(activeCase.id, generalCategory, Array.from(list));
    if (generalInputRef.current) generalInputRef.current.value = "";
  };

  const askAi = (prompt: string) => {
    sendMessage(activeCase.id, prompt);
    router.push(`/case/${activeCase.id}`);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="line-label">Documents</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em] text-white">
            {activeCase.business.name}
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Sign your EOI, upload your utility bills, and review your proposal &amp; term sheet here.
            Ask 1OS to explain anything you do not understand.
          </p>
        </div>
        <StatusPill tone="neutral">{activeCase.stage}</StatusPill>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* EOI */}
        <Card
          title="Expression of Interest"
          status={eoiSigned ? "Signed" : "Awaiting your signature"}
          body={
            eoiSigned
              ? "Thanks — we have your signed EOI on file. You can download it below and continue with Dawn."
              : clientLead?.eoiSigningPath
                ? "Your EOI is ready. Sign it now, then come back here so Dawn can continue with qualification."
                : "Your EOI link is not ready yet. Finish registration with Dawn first, then return here."
          }
          actions={
            eoiSigned ? (
              <GhostButton
                icon={Download}
                onClick={() =>
                  signedEoiDocument?.id
                    ? void downloadLeadDocument(
                        signedEoiDocument.id,
                        signedEoiDocument.fileName || "signed-expression-of-interest.pdf",
                      )
                    : undefined
                }
                disabled={!signedEoiDocument?.id || isDownloading === signedEoiDocument.id}
              >
                {isDownloading === signedEoiDocument?.id ? "Downloading" : "Download Signed EOI"}
              </GhostButton>
            ) : (
              <>
                <PrimaryButton
                  icon={FileSignature}
                  onClick={() => {
                    if (!clientLead?.eoiSigningPath) {
                      return;
                    }
                    window.open(clientLead.eoiSigningPath, "_self");
                  }}
                  disabled={!clientLead?.eoiSigningPath}
                >
                  Sign EOI Now
                </PrimaryButton>
                <GhostButton
                  icon={MessageSquareText}
                  onClick={() =>
                    askAi("Please walk me through what the Expression of Interest commits me to before I sign it.")
                  }
                >
                  Explain the EOI
                </GhostButton>
              </>
            )
          }
        />

        {/* Utility Bills */}
        <Card
          title="Utility Bills (last 6 months)"
          status={`${utilityBillCount} of ${UTILITY_BILLS_REQUIRED} uploaded`}
          body={
            <>
              We need 6 months of utility bills to qualify your tariff and forecast your savings.
              PDF, image, or spreadsheet — whichever your supplier provided.
            </>
          }
          actions={
            <>
              <input
                ref={utilityInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls"
                className="hidden"
                onChange={handleUtilityChange}
              />
              <PrimaryButton icon={Upload} onClick={() => utilityInputRef.current?.click()}>
                Upload Utility Bills
              </PrimaryButton>
              {utilityBillCount >= UTILITY_BILLS_REQUIRED ? (
                <StatusPill tone="ok">All 6 received</StatusPill>
              ) : (
                <StatusPill tone="warn">{UTILITY_BILLS_REQUIRED - utilityBillCount} remaining</StatusPill>
              )}
            </>
          }
        />

        {/* Proposal */}
        <Card
          title="Proposal"
          status={proposal ? `${proposal.title} — ${proposal.status}` : "Not issued yet"}
          body={
            proposal ? (
              <div className="space-y-2">
                <p>{proposal.summary}</p>
                <p className="text-white/56">
                  Forecast savings: <span className="text-white">{proposal.savingsRange}</span> over a {proposal.termYears}-year term.
                </p>
              </div>
            ) : (
              <>Your proposal will appear here once 1OS issues it. We will notify you in chat when it is ready.</>
            )
          }
          actions={
            proposal ? (
              <>
                <GhostButton icon={Download}>Download Proposal</GhostButton>
                <PrimaryButton
                  icon={Sparkles}
                  onClick={() =>
                    askAi("Can you explain my proposal to me in plain English — what it commits me to, the savings, and what I should look out for?")
                  }
                >
                  Explain my proposal
                </PrimaryButton>
              </>
            ) : null
          }
        />

        {/* Term Sheet */}
        <Card
          title="Term Sheet"
          status={termSheet ? `${termSheet.title} — ${termSheet.status}` : "Not issued yet"}
          body={
            termSheet ? (
              <p>{termSheet.summary}</p>
            ) : (
              <>Your term sheet will appear here after the proposal is accepted.</>
            )
          }
          actions={
            termSheet ? (
              <>
                <GhostButton icon={Download}>Download Term Sheet</GhostButton>
                <PrimaryButton
                  icon={Sparkles}
                  onClick={() =>
                    askAi("Please walk me through every clause of my term sheet — explain what each one means and what I am committing to.")
                  }
                >
                  Explain my term sheet
                </PrimaryButton>
              </>
            ) : null
          }
        />
      </div>

      {/* All Documents */}
      <section className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="line-label">All Documents</p>
            <h2 className="mt-2 text-lg font-medium text-white">{displayDocuments.length} on file</h2>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={generalCategory}
              onChange={(event) => setGeneralCategory(event.target.value as WorkspaceUploadCategory)}
              className="h-9 rounded-full border border-white/12 bg-black/55 px-3 text-xs font-medium text-white outline-none transition focus:border-white/32"
            >
              {(["EOI", "Utility Bills", "Proposal", "Term Sheet"] as const).map((option) => (
                <option key={option} value={option} className="bg-zinc-950">
                  {option}
                </option>
              ))}
            </select>
            <input
              ref={generalInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleGeneralChange}
            />
            <GhostButton icon={Upload} onClick={() => generalInputRef.current?.click()}>
              Upload
            </GhostButton>
          </div>
        </header>

        <ul className="mt-4 divide-y divide-white/8">
          {displayDocuments.length === 0 ? (
            <li className="py-6 text-center text-sm text-white/56">No documents yet.</li>
          ) : (
            displayDocuments.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/70">
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{doc.title}</p>
                    <p className="text-[0.7rem] uppercase tracking-[0.18em] text-white/48">
                      {doc.category} · {doc.fileType} · {doc.size} · {doc.updatedAt}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill
                    tone={doc.status === "signed" || doc.status === "reviewed" ? "ok" : doc.status === "pending" ? "warn" : "neutral"}
                  >
                    {doc.status}
                  </StatusPill>
                  <GhostButton
                    icon={Download}
                    onClick={() =>
                      doc.leadDocumentId
                        ? void downloadLeadDocument(doc.leadDocumentId, `${doc.title}.${doc.fileType.toLowerCase()}`)
                        : undefined
                    }
                    disabled={!doc.leadDocumentId || isDownloading === doc.leadDocumentId}
                  >
                    {isDownloading === doc.leadDocumentId ? "Downloading" : "Download"}
                  </GhostButton>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

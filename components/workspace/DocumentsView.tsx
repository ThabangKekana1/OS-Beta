"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
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

export function DocumentsView() {
  const router = useRouter();
  const { activeCase, uploadFiles, sendMessage } = useWorkspace();
  const utilityInputRef = useRef<HTMLInputElement | null>(null);
  const generalInputRef = useRef<HTMLInputElement | null>(null);
  const [generalCategory, setGeneralCategory] = useState<WorkspaceUploadCategory>("EOI");

  const documents = activeCase?.documents ?? [];
  const utilityBillCount = useMemo(
    () => documents.filter(isUtilityBillDoc).length,
    [documents],
  );

  if (!activeCase) {
    return (
      <div className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-8 text-center text-white/64">
        Select a business from the left rail to view its documents.
      </div>
    );
  }

  const proposal = activeCase.proposal;
  const termSheet = activeCase.termSheet;
  const eoiSigned = documents.some(
    (doc) => doc.title.toLowerCase().includes("expression of interest") && doc.status === "signed",
  );

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

  const askAi = (mode: "Proposal Support" | "Term Sheet Support" | "Review Documents", prompt: string) => {
    sendMessage(activeCase.id, prompt, mode);
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
              ? "Thanks — we have your signed EOI on file. You can download a copy below."
              : "Sign your Expression of Interest to begin the migration. It takes about a minute."
          }
          actions={
            eoiSigned ? (
              <GhostButton icon={Download}>Download Signed EOI</GhostButton>
            ) : (
              <>
                <PrimaryButton
                  icon={FileSignature}
                  onClick={() => {
                    // Surface inside the workspace; admin issues the signing token,
                    // and the customer is currently directed to the secure signing page.
                    window.open("/eoi", "_self");
                  }}
                >
                  Sign EOI Now
                </PrimaryButton>
                <GhostButton
                  icon={MessageSquareText}
                  onClick={() =>
                    askAi(
                      "Review Documents",
                      "Please walk me through what the Expression of Interest commits me to before I sign it.",
                    )
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
                    askAi(
                      "Proposal Support",
                      "Can you explain my proposal to me in plain English — what it commits me to, the savings, and what I should look out for?",
                    )
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
                    askAi(
                      "Term Sheet Support",
                      "Please walk me through every clause of my term sheet — explain what each one means and what I am committing to.",
                    )
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
            <h2 className="mt-2 text-lg font-medium text-white">{documents.length} on file</h2>
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
          {documents.length === 0 ? (
            <li className="py-6 text-center text-sm text-white/56">No documents yet.</li>
          ) : (
            documents.map((doc) => (
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
                  <GhostButton icon={Download}>Download</GhostButton>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

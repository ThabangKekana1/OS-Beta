"use client";

import Link from "next/link";
import { Bot, Download, MessageSquareText, Sparkles, User } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminPrimitives";

export type TranscriptThread = {
  workspaceId: string;
  caseId: string | null;
  caseName: string | null;
  lastAt: string;
  turnCount: number;
  userTurnCount: number;
};

export type TranscriptTurn = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  mode: string | null;
  provider: string | null;
  latencyMs: number | null;
  context: string | null;
  sessionEmail: string | null;
  clientIp: string | null;
  createdAt: string;
};

export type MemoryEntry = {
  workspaceId: string;
  facts: string[];
  summary: string | null;
  updatedAt: string;
};

type Props = {
  threads: TranscriptThread[];
  activeWorkspaceId: string | null;
  activeCaseId: string | null;
  turns: TranscriptTurn[];
  memory: MemoryEntry | null;
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function buildExportUrl(threads: TranscriptThread[], workspaceId: string | null, caseId: string | null) {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspace", workspaceId);
  if (caseId) params.set("case", caseId);
  void threads;
  return `/api/admin/transcripts/export?${params.toString()}`;
}

export function TranscriptsView({ threads, activeWorkspaceId, activeCaseId, turns, memory }: Props) {
  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="Memory & Training"
        title="AI Transcripts"
        description="Every customer conversation, captured for review and training data."
        actions={
          <Link
            href={buildExportUrl(threads, activeWorkspaceId, activeCaseId)}
            className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.04] px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-white/82 transition hover:border-white/24 hover:bg-white/[0.06]"
          >
            <Download className="size-3.5" />
            Export {activeWorkspaceId ? "Thread" : "All"} (JSONL)
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        {/* Threads list */}
        <aside className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-3">
          <p className="line-label px-2 pb-2">Conversations · {threads.length}</p>
          <ul className="space-y-1">
            {threads.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm text-white/56">No conversations yet.</li>
            ) : (
              threads.map((thread) => {
                const href = `/admin/transcripts?workspace=${encodeURIComponent(thread.workspaceId)}${
                  thread.caseId ? `&case=${encodeURIComponent(thread.caseId)}` : ""
                }`;
                const active =
                  activeWorkspaceId === thread.workspaceId &&
                  (activeCaseId ?? null) === (thread.caseId ?? null);
                return (
                  <li key={`${thread.workspaceId}::${thread.caseId ?? ""}`}>
                    <Link
                      href={href}
                      className={`block rounded-[0.95rem] border px-3 py-2.5 transition ${
                        active
                          ? "border-white/20 bg-white/[0.06]"
                          : "border-transparent hover:border-white/10 hover:bg-white/[0.03]"
                      }`}
                    >
                      <p className="truncate text-sm text-white">
                        {thread.caseName ?? "Untitled case"}
                      </p>
                      <p className="truncate text-[0.65rem] uppercase tracking-[0.18em] text-white/48">
                        {thread.workspaceId}
                      </p>
                      <p className="mt-1 text-[0.65rem] text-white/52">
                        {thread.turnCount} turns · {formatTime(thread.lastAt)}
                      </p>
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        {/* Detail */}
        <section className="space-y-4">
          {!activeWorkspaceId ? (
            <div className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-8 text-center text-white/64">
              Select a conversation on the left to view turns and memory.
            </div>
          ) : (
            <>
              {memory ? (
                <div className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-3.5 text-white/68" />
                    <p className="line-label">Long-term memory · {formatTime(memory.updatedAt)}</p>
                  </div>
                  {memory.summary ? (
                    <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/82">
                      {memory.summary}
                    </pre>
                  ) : (
                    <p className="mt-3 text-sm text-white/56">No summary yet.</p>
                  )}
                  {memory.facts.length > 0 ? (
                    <div className="mt-4">
                      <p className="line-label mb-2">Durable facts ({memory.facts.length})</p>
                      <ul className="space-y-1.5">
                        {memory.facts.map((fact, idx) => (
                          <li
                            key={`${fact}-${idx}`}
                            className="rounded-[0.7rem] border border-white/8 bg-white/[0.02] px-3 py-1.5 text-sm text-white/82"
                          >
                            {fact}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-5">
                <p className="line-label">Turns · {turns.length}</p>
                {turns.length === 0 ? (
                  <p className="mt-3 text-sm text-white/56">No turns recorded for this thread.</p>
                ) : (
                  <ol className="mt-4 space-y-3">
                    {turns.map((turn) => (
                      <li
                        key={turn.id}
                        className={`rounded-[1.1rem] border px-4 py-3 ${
                          turn.role === "user"
                            ? "border-white/12 bg-white/[0.04]"
                            : turn.role === "assistant"
                              ? "border-emerald-400/14 bg-emerald-400/[0.04]"
                              : "border-white/10 bg-white/[0.02]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 text-[0.62rem] uppercase tracking-[0.2em] text-white/52">
                          <span className="inline-flex items-center gap-1.5">
                            {turn.role === "user" ? (
                              <User className="size-3" />
                            ) : turn.role === "assistant" ? (
                              <Bot className="size-3" />
                            ) : (
                              <MessageSquareText className="size-3" />
                            )}
                            {turn.role}
                            {turn.mode ? ` · ${turn.mode}` : ""}
                            {turn.provider ? ` · ${turn.provider}` : ""}
                            {typeof turn.latencyMs === "number" ? ` · ${turn.latencyMs}ms` : ""}
                          </span>
                          <span>{formatTime(turn.createdAt)}</span>
                        </div>
                        <pre className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white">
                          {turn.content}
                        </pre>
                        {turn.context ? (
                          <details className="mt-2 text-[0.7rem] text-white/52">
                            <summary className="cursor-pointer text-white/64">context</summary>
                            <pre className="mt-1 whitespace-pre-wrap">{turn.context}</pre>
                          </details>
                        ) : null}
                        {turn.sessionEmail || turn.clientIp ? (
                          <p className="mt-2 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">
                            {turn.sessionEmail ?? "anon"} · {turn.clientIp ?? "unknown ip"}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

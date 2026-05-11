"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox, MailOpen, RefreshCw } from "lucide-react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { cn } from "@/lib/utils";

type EmailDirection = "inbound" | "outbound";

type EmailThread = {
  id: string;
  subject: string | null;
  participants: string[];
  lastMessageAt: string;
  lastDirection: EmailDirection | null;
};

type EmailMessage = {
  id: string;
  direction: EmailDirection;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  bodyText: string | null;
  bodyHtml: string | null;
  subject: string | null;
  sentAt: string;
  attachments: Array<{
    id: string;
    filename: string;
    sizeBytes: number | null;
  }>;
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(new Date(iso));
}

function preview(message: { bodyText: string | null; bodyHtml: string | null; subject: string | null }) {
  const text = (message.bodyText ?? message.bodyHtml ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || message.subject || "(no preview)";
}

export function WorkspaceInboxView() {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<EmailThread | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const refreshThreads = useCallback(async () => {
    setLoadingThreads(true);
    setError(null);

    try {
      const response = await fetch("/api/email/threads", { cache: "no-store" });
      const payload = (await response.json()) as { threads?: EmailThread[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load inbox.");
      }

      const nextThreads = payload.threads ?? [];
      setThreads(nextThreads);
      setActiveThreadId((current) => current ?? nextThreads[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load inbox.");
      setThreads([]);
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  const loadThread = useCallback(async (threadId: string) => {
    setLoadingMessages(true);
    setError(null);

    try {
      const response = await fetch(`/api/email/threads/${threadId}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        thread?: EmailThread;
        messages?: EmailMessage[];
        error?: string;
      };

      if (!response.ok || !payload.thread) {
        throw new Error(payload.error ?? "Could not open this conversation.");
      }

      setActiveThread(payload.thread);
      setMessages(payload.messages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open this conversation.");
      setActiveThread(null);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  useEffect(() => {
    if (activeThreadId) void loadThread(activeThreadId);
  }, [activeThreadId, loadThread]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshThreads();
      if (activeThreadId) void loadThread(activeThreadId);
    }, 30_000);

    return () => clearInterval(interval);
  }, [activeThreadId, loadThread, refreshThreads]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="space-y-5 pb-8">
      <AdminHeader
        eyebrow="Inbox"
        title="Email conversations with the 1OS team."
        description="Messages linked to your 1OS account appear here so you can keep Dawn, documents, and human support in one place."
        actions={
          <button
            type="button"
            onClick={() => void refreshThreads()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/18 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
          >
            <RefreshCw className="size-4" />
            Refresh
          </button>
        }
      />

      {error ? (
        <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <aside className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[0.62rem] uppercase tracking-[0.26em] text-white/52">Threads</p>
            <AdminBadge label={`${threads.length} Total`} tone="muted" />
          </div>

          {loadingThreads ? (
            <div className="px-2 py-6 text-sm text-white/50">Loading…</div>
          ) : threads.length === 0 ? (
            <div className="space-y-4 px-2 py-6 text-sm leading-6 text-white/58">
              <div className="flex size-10 items-center justify-center rounded-full border border-white/12 bg-white/[0.04]">
                <Inbox className="size-4" />
              </div>
              <p>No conversations yet. Messages from support and your 1OS team will appear here.</p>
              <Link
                href="/support"
                className="inline-flex rounded-full border border-white/14 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-white/78 transition hover:bg-white/[0.05] hover:text-white"
              >
                Contact support
              </Link>
            </div>
          ) : (
            <ul className="space-y-1">
              {threads.map((thread) => {
                const active = thread.id === activeThreadId;

                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      onClick={() => setActiveThreadId(thread.id)}
                      className={cn(
                        "w-full rounded-xl border px-3 py-2.5 text-left transition",
                        active
                          ? "border-white/18 bg-white/[0.07]"
                          : "border-transparent hover:border-white/10 hover:bg-white/[0.03]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className={cn("truncate text-sm font-medium", active ? "text-white" : "text-white/82")}>
                          {thread.subject ?? "(no subject)"}
                        </p>
                        <span className="shrink-0 text-[0.66rem] text-white/46">
                          {formatRelative(thread.lastMessageAt)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-white/52">
                        {thread.participants.join(", ") || "—"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          {!activeThread ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center text-white/50">
              <MailOpen className="size-8 text-white/34" />
              <p className="text-sm">Select a thread to view the conversation.</p>
            </div>
          ) : (
            <div className="flex min-h-[60vh] flex-col">
              <header className="border-b border-white/8 pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="line-label">Conversation</p>
                    <h2 className="mt-2 text-lg font-medium tracking-[-0.02em] text-white">
                      {activeThread.subject ?? "(no subject)"}
                    </h2>
                    <p className="mt-1 text-xs text-white/52">
                      {activeThread.participants.join(", ")}
                    </p>
                  </div>
                  <AdminBadge
                    label={activeThread.lastDirection === "inbound" ? "Received" : "Sent by 1OS"}
                    tone="neutral"
                  />
                </div>
              </header>

              <div className="flex-1 space-y-4 overflow-y-auto py-4">
                {loadingMessages ? (
                  <p className="text-sm text-white/50">Loading…</p>
                ) : messages.length === 0 ? (
                  <p className="rounded-xl border border-white/8 bg-black/20 p-4 text-sm text-white/58">
                    No messages found in this thread.
                  </p>
                ) : (
                  messages.map((message) => (
                    <article
                      key={message.id}
                      className={cn(
                        "rounded-2xl border p-4",
                        message.direction === "inbound"
                          ? "border-white/8 bg-white/[0.04]"
                          : "border-emerald-300/30 bg-emerald-500/[0.06]",
                      )}
                    >
                      <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/55">
                        <div>
                          <span className="font-medium text-white/82">
                            {message.fromName ?? message.fromAddress}
                          </span>
                          <span className="ml-2 text-white/40">
                            to {message.toAddresses.join(", ") || "—"}
                          </span>
                        </div>
                        <span title={message.sentAt}>{formatRelative(message.sentAt)}</span>
                      </header>
                      <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/85">
                        {preview(message)}
                      </div>
                      {message.attachments.length > 0 ? (
                        <ul className="mt-3 flex flex-wrap gap-2">
                          {message.attachments.map((attachment) => (
                            <li
                              key={attachment.id}
                              className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/14 bg-white/[0.04] px-2.5 py-1 text-[0.7rem] text-white/78"
                            >
                              <span className="truncate">{attachment.filename}</span>
                              {attachment.sizeBytes ? (
                                <span className="shrink-0 text-white/40">
                                  {(attachment.sizeBytes / 1024).toFixed(0)} KB
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/58">
                Need to reply or ask for help? Use the Support tab and the request will go straight
                to 1OS support.
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
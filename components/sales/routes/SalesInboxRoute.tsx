"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { cn } from "@/lib/utils";

type EmailDirection = "inbound" | "outbound";

type EmailThread = {
  id: string;
  leadId: string | null;
  clientProfileId: string | null;
  subject: string | null;
  participants: string[];
  externalThreadId: string | null;
  lastMessageAt: string;
  lastDirection: EmailDirection | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
};

type EmailMessage = {
  id: string;
  threadId: string;
  direction: EmailDirection;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  referenceIds: string[];
  providerId: string | null;
  isRead: boolean;
  sentAt: string;
  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string | null;
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

function preview(message: { bodyText: string | null; bodyHtml: string | null; subject: string | null }): string {
  const text = (message.bodyText ?? message.bodyHtml ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length > 0) return text.slice(0, 140);
  return message.subject ?? "(no preview)";
}

type InitialCompose = {
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  leadId?: string | null;
};

export function SalesInboxRoute({
  initialThreadId,
  initialLeadFilter,
  initialCompose,
}: {
  initialThreadId: string | null;
  initialLeadFilter: string | null;
  initialCompose?: InitialCompose | null;
}) {
  const { leads } = useAdminPortal();
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId);
  const [activeMessages, setActiveMessages] = useState<EmailMessage[]>([]);
  const [activeThread, setActiveThread] = useState<EmailThread | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composeMode, setComposeMode] = useState<"new" | "reply">("new");
  const [error, setError] = useState<string | null>(null);

  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeLeadId, setComposeLeadId] = useState<string | null>(initialLeadFilter);
  const [composeAttachments, setComposeAttachments] = useState<
    Array<{ filename: string; content: string; contentType: string; size: number }>
  >([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const refreshThreads = useCallback(async () => {
    setLoadingList(true);
    try {
      const url = new URL("/api/email/threads", window.location.origin);
      if (initialLeadFilter) url.searchParams.set("leadId", initialLeadFilter);
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json()) as { threads?: EmailThread[]; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not load inbox");
        setThreads([]);
        return;
      }
      setThreads(json.threads ?? []);
    } catch {
      setError("Could not load inbox");
    } finally {
      setLoadingList(false);
    }
  }, [initialLeadFilter]);

  const loadThread = useCallback(async (id: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/email/threads/${id}`, { cache: "no-store" });
      const json = (await res.json()) as { thread?: EmailThread; messages?: EmailMessage[]; error?: string };
      if (!res.ok || !json.thread) {
        setError(json.error ?? "Could not open thread");
        return;
      }
      setActiveThread(json.thread);
      setActiveMessages(json.messages ?? []);
      // Mark this thread read locally
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unreadCount: 0 } : t)));
    } catch {
      setError("Could not open thread");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  // Pre-open composer if launched from another surface (e.g. lead profile "Email client" button).
  const composerPrimedRef = useRef(false);
  useEffect(() => {
    if (composerPrimedRef.current) return;
    if (!initialCompose) return;
    const hasAny =
      Boolean(initialCompose.to) ||
      Boolean(initialCompose.subject) ||
      Boolean(initialCompose.body) ||
      Boolean(initialCompose.leadId);
    if (!hasAny) return;
    composerPrimedRef.current = true;
    setComposeMode("new");
    setComposeTo(initialCompose.to ?? "");
    setComposeCc("");
    setComposeSubject(initialCompose.subject ?? "");
    setComposeBody(initialCompose.body ?? "");
    setComposeLeadId(initialCompose.leadId ?? null);
    setComposerOpen(true);
  }, [initialCompose]);

  useEffect(() => {
    if (activeThreadId) void loadThread(activeThreadId);
  }, [activeThreadId, loadThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages.length]);

  // Poll every 30s for new messages on the active thread + refresh list.
  useEffect(() => {
    const tick = setInterval(() => {
      void refreshThreads();
      if (activeThreadId) void loadThread(activeThreadId);
    }, 30_000);
    return () => clearInterval(tick);
  }, [activeThreadId, loadThread, refreshThreads]);

  const startReply = useCallback(() => {
    if (!activeThread || activeMessages.length === 0) return;
    const last = [...activeMessages].reverse()[0];
    const replyTo =
      last.direction === "inbound" ? last.fromAddress : last.toAddresses[0] ?? "";
    setComposeMode("reply");
    setComposeTo(replyTo);
    setComposeCc("");
    const subject = activeThread.subject ?? "";
    setComposeSubject(/^re:\s/i.test(subject) ? subject : `Re: ${subject}`);
    setComposeBody("");
    setComposeLeadId(activeThread.leadId ?? null);
    setComposeAttachments([]);
    setComposerOpen(true);
  }, [activeThread, activeMessages]);

  const startNew = useCallback(() => {
    setComposeMode("new");
    setComposeTo("");
    setComposeCc("");
    setComposeSubject("");
    setComposeBody("");
    setComposeLeadId(null);
    setComposeAttachments([]);
    setComposerOpen(true);
  }, []);

  const send = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const last = composeMode === "reply" && activeMessages.length > 0 ? activeMessages[activeMessages.length - 1] : null;
      const referenceIds = last
        ? [...(last.referenceIds ?? []), last.messageId].filter((v): v is string => Boolean(v))
        : [];
      const inReplyTo = last?.messageId ?? null;
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: composeTo,
          cc: composeCc,
          subject: composeSubject,
          body: composeBody,
          threadId: composeMode === "reply" ? activeThread?.id ?? null : null,
          leadId: composeLeadId,
          inReplyTo,
          referenceIds,
          attachments: composeAttachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
            size: a.size,
          })),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; thread?: EmailThread };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Send failed");
        return;
      }
      setComposerOpen(false);
      await refreshThreads();
      const newId = json.thread?.id ?? activeThread?.id ?? null;
      if (newId) {
        setActiveThreadId(newId);
        await loadThread(newId);
      }
    } catch {
      setError("Send failed");
    } finally {
      setSending(false);
    }
  }, [activeMessages, activeThread?.id, composeAttachments, composeBody, composeCc, composeLeadId, composeMode, composeSubject, composeTo, loadThread, refreshThreads]);

  const leadOptions = useMemo(() => leads.map((lead) => ({ id: lead.id, label: `${lead.company} · ${lead.contactName ?? "no contact"}`, email: lead.userProfile?.email ?? "" })), [leads]);

  return (
    <div className="space-y-5 pb-8">
      <AdminHeader
        eyebrow="Inbox"
        title="Email conversations with clients."
        description="Send and receive emails directly from 1OS. Replies are automatically threaded to the right lead."
        actions={
          <button
            type="button"
            onClick={startNew}
            className="inline-flex items-center justify-center rounded-xl border border-white/18 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
          >
            New email
          </button>
        }
      />

      {error ? (
        <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <aside className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[0.62rem] uppercase tracking-[0.26em] text-white/52">Threads</p>
            <span className="text-[0.62rem] text-white/40">{threads.length}</span>
          </div>
          {loadingList ? (
            <div className="px-2 py-6 text-sm text-white/50">Loading…</div>
          ) : threads.length === 0 ? (
            <div className="px-2 py-6 text-sm text-white/50">
              No conversations yet. Click <span className="font-medium text-white/80">New email</span> to send your first message.
            </div>
          ) : (
            <ul className="space-y-1">
              {threads.map((thread) => {
                const isActive = thread.id === activeThreadId;
                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      onClick={() => setActiveThreadId(thread.id)}
                      className={cn(
                        "w-full rounded-xl border px-3 py-2.5 text-left transition",
                        isActive
                          ? "border-white/18 bg-white/[0.07]"
                          : "border-transparent hover:border-white/10 hover:bg-white/[0.03]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className={cn("truncate text-sm font-medium", isActive ? "text-white" : "text-white/82")}>{thread.subject ?? "(no subject)"}</p>
                        <span className="shrink-0 text-[0.66rem] text-white/46">{formatRelative(thread.lastMessageAt)}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-white/52">{thread.participants.join(", ") || "—"}</p>
                      {thread.unreadCount > 0 ? (
                        <span className="mt-2 inline-flex items-center rounded-full border border-emerald-300/50 bg-emerald-500/15 px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-emerald-100">
                          {thread.unreadCount} new
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          {!activeThread ? (
            <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-2 text-center text-white/50">
              <p className="text-sm">Select a thread on the left, or start a new email.</p>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <header className="border-b border-white/8 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-medium tracking-[-0.02em] text-white">{activeThread.subject ?? "(no subject)"}</h2>
                    <p className="mt-1 text-xs text-white/52">{activeThread.participants.join(", ")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <AdminBadge label={activeThread.lastDirection === "inbound" ? "Awaiting reply" : "Outbound"} tone="neutral" />
                    <button
                      type="button"
                      onClick={startReply}
                      className="inline-flex items-center justify-center rounded-xl border border-white/18 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
                    >
                      Reply
                    </button>
                  </div>
                </div>
              </header>

              <div className="flex-1 space-y-4 overflow-y-auto py-4">
                {loadingMessages ? (
                  <p className="text-sm text-white/50">Loading…</p>
                ) : (
                  activeMessages.map((message) => (
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
                          <span className="font-medium text-white/82">{message.fromName ?? message.fromAddress}</span>
                          <span className="ml-2 text-white/40">to {message.toAddresses.join(", ")}</span>
                        </div>
                        <span title={message.sentAt}>{formatRelative(message.sentAt)}</span>
                      </header>
                      <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/85">
                        {message.bodyText ?? preview(message)}
                      </div>
                      {message.attachments?.length > 0 ? (
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
            </div>
          )}
        </section>
      </div>

      {composerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center">
          <div className="w-full max-w-2xl rounded-2xl border border-white/12 bg-[#0d0e10] p-5 shadow-2xl">
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-medium text-white">{composeMode === "reply" ? "Reply" : "New email"}</h3>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="rounded-lg border border-white/12 px-2.5 py-1 text-xs text-white/70 hover:bg-white/[0.06]"
              >
                Close
              </button>
            </header>

            {composeMode === "new" ? (
              <div className="mb-3">
                <label className="text-[0.62rem] uppercase tracking-[0.22em] text-white/52">Link to lead (optional)</label>
                <select
                  value={composeLeadId ?? ""}
                  onChange={(event) => {
                    const id = event.target.value || null;
                    setComposeLeadId(id);
                    if (id) {
                      const opt = leadOptions.find((o) => o.id === id);
                      if (opt?.email && !composeTo) setComposeTo(opt.email);
                    }
                  }}
                  className="mt-1 w-full rounded-xl border border-white/12 bg-black/40 px-3 py-2 text-sm text-white"
                >
                  <option value="">— No lead —</option>
                  {leadOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </div>
            ) : null}

            <label className="mt-2 block text-[0.62rem] uppercase tracking-[0.22em] text-white/52">To</label>
            <input
              type="text"
              value={composeTo}
              onChange={(event) => setComposeTo(event.target.value)}
              placeholder="client@example.com"
              className="mt-1 w-full rounded-xl border border-white/12 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30"
            />

            <label className="mt-3 block text-[0.62rem] uppercase tracking-[0.22em] text-white/52">CC</label>
            <input
              type="text"
              value={composeCc}
              onChange={(event) => setComposeCc(event.target.value)}
              placeholder="optional"
              className="mt-1 w-full rounded-xl border border-white/12 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30"
            />

            <label className="mt-3 block text-[0.62rem] uppercase tracking-[0.22em] text-white/52">Subject</label>
            <input
              type="text"
              value={composeSubject}
              onChange={(event) => setComposeSubject(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/12 bg-black/40 px-3 py-2 text-sm text-white"
            />

            <label className="mt-3 block text-[0.62rem] uppercase tracking-[0.22em] text-white/52">Message</label>
            <textarea
              value={composeBody}
              onChange={(event) => setComposeBody(event.target.value)}
              rows={8}
              className="mt-1 w-full rounded-xl border border-white/12 bg-black/40 px-3 py-2 text-sm leading-6 text-white"
            />

            <div className="mt-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[0.62rem] uppercase tracking-[0.22em] text-white/52">Attachments</span>
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={attachmentBusy}
                  className="rounded-lg border border-white/14 px-2.5 py-1 text-[0.66rem] uppercase tracking-[0.18em] text-white/78 transition hover:border-white/28 hover:text-white disabled:opacity-50"
                >
                  {attachmentBusy ? "Reading…" : "Add files"}
                </button>
              </div>
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                hidden
                onChange={async (event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  if (files.length === 0) return;
                  setAttachmentBusy(true);
                  try {
                    const encoded = await Promise.all(
                      files.map(
                        (file) =>
                          new Promise<{ filename: string; content: string; contentType: string; size: number }>(
                            (resolve, reject) => {
                              const reader = new FileReader();
                              reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
                              reader.onload = () => {
                                const result = reader.result;
                                if (typeof result !== "string") {
                                  reject(new Error(`Could not read ${file.name}`));
                                  return;
                                }
                                const base64 = result.includes(",") ? result.split(",")[1] : result;
                                resolve({
                                  filename: file.name,
                                  content: base64,
                                  contentType: file.type || "application/octet-stream",
                                  size: file.size,
                                });
                              };
                              reader.readAsDataURL(file);
                            },
                          ),
                      ),
                    );
                    setComposeAttachments((prev) => [...prev, ...encoded]);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not read files");
                  } finally {
                    setAttachmentBusy(false);
                  }
                }}
              />
              {composeAttachments.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {composeAttachments.map((att, index) => (
                    <li
                      key={`${att.filename}-${index}`}
                      className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.04] px-2.5 py-1 text-[0.7rem] text-white/78"
                    >
                      <span className="max-w-[16rem] truncate">{att.filename}</span>
                      <span className="text-white/40">{(att.size / 1024).toFixed(0)} KB</span>
                      <button
                        type="button"
                        onClick={() =>
                          setComposeAttachments((prev) => prev.filter((_, i) => i !== index))
                        }
                        className="text-white/50 transition hover:text-white"
                        aria-label={`Remove ${att.filename}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[0.7rem] text-white/40">Up to 3 MB total · send larger files via Drive/Dropbox link.</p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setComposerOpen(false);
                  setComposeAttachments([]);
                }}
                className="rounded-xl border border-white/12 px-3 py-2 text-sm text-white/74 hover:bg-white/[0.04]"
                disabled={sending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={send}
                disabled={sending || !composeTo || !composeSubject || !composeBody}
                className="rounded-xl border border-white/18 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

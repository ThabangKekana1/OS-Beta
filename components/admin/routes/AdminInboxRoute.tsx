"use client";

/* eslint-disable @next/next/no-img-element -- Email previews use raw image markup that mirrors sent email HTML. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { useOptionalAdminPortal } from "@/components/admin/AdminPortalProvider";
import {
  buildEmailHtmlWithFoundationBanner,
  buildFoundationOutreachBody,
  FOUNDATION_BROCHURE_FILENAME,
  FOUNDATION_BROCHURE_PATH,
  FOUNDATION_EMAIL_BANNER_PATH,
  FOUNDATION_OUTREACH_SUBJECT,
} from "@/lib/outreach-email-template";
import {
  splitSignatureForBanner,
  systemSignatureTextForSender,
} from "@/lib/email-signature-copy";
import { cn } from "@/lib/utils";

type EmailDirection = "inbound" | "outbound";

type EmailThread = {
  id: string;
  leadId: string | null;
  clientProfileId: string | null;
  mailboxOwnerUserId: string | null;
  mailboxAddress: string | null;
  mailboxRole: "admin" | "sales" | "partner" | null;
  subject: string | null;
  participants: string[];
  externalThreadId: string | null;
  lastMessageAt: string;
  lastDirection: EmailDirection | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
};

export type InboxLeadOption = {
  id: string;
  label: string;
  email: string;
  company?: string | null;
  contactName?: string | null;
};

export type InboxSenderOption = {
  label: string;
  email: string;
  value: string;
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

type ComposeAttachment = {
  filename: string;
  content: string;
  contentType: string;
  size: number;
  contentId?: string;
};

type ComposeLeadDetails = {
  id: string | null;
  label?: string | null;
  email?: string | null;
  company?: string | null;
  contactName?: string | null;
};

function buildOutreachBody(lead: ComposeLeadDetails | null): string {
  return buildFoundationOutreachBody(lead);
}

function buildOutreachHtml(body: string): string {
  return buildEmailHtmlWithFoundationBanner({ bodyText: body });
}

async function assetToAttachment(
  path: string,
  filename: string,
  contentType: string,
  contentId?: string,
): Promise<ComposeAttachment> {
  const res = await fetch(path, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Could not load ${filename}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(index, index + chunkSize)));
  }
  return {
    filename,
    content: btoa(binary),
    contentType,
    size: bytes.byteLength,
    contentId,
  };
}

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

function readableMessageBody(message: { bodyText: string | null; bodyHtml: string | null; subject: string | null }): string {
  const text = message.bodyText?.trim();
  if (text) return text;
  const htmlPreview = preview({ ...message, bodyText: null });
  if (htmlPreview && htmlPreview !== message.subject && htmlPreview !== "(no preview)") return htmlPreview;
  return "No readable email body was available for this message. The reply metadata was received, but the email body could not be loaded from the inbound provider.";
}

function mailboxSlug(option: InboxSenderOption) {
  return option.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || option.email;
}

type InitialCompose = {
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  leadId?: string | null;
  template?: string | null;
  company?: string | null;
  contactName?: string | null;
};

export function AdminInboxRoute({
  initialThreadId,
  initialLeadFilter,
  initialMailbox,
  initialCompose,
  viewerRole,
  viewerAgentId,
  viewerEmail,
  initialLeadOptions,
  senderOptions = [],
}: {
  initialThreadId: string | null;
  initialLeadFilter: string | null;
  initialMailbox?: string | null;
  initialCompose?: InitialCompose | null;
  viewerRole: "admin" | "sales" | "partner";
  viewerAgentId: string | null;
  viewerEmail?: string | null;
  initialLeadOptions?: InboxLeadOption[];
  senderOptions?: InboxSenderOption[];
}) {
  const adminPortal = useOptionalAdminPortal();
  const portalLeads = adminPortal?.leads;
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
  const initialMailboxOption =
    senderOptions.find((option) => mailboxSlug(option) === initialMailbox || option.email === initialMailbox) ??
    senderOptions[0] ??
    null;
  const [composeFrom, setComposeFrom] = useState(initialMailboxOption?.value ?? "");
  const [activeMailbox, setActiveMailbox] = useState(initialMailboxOption?.value ?? "");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeLeadId, setComposeLeadId] = useState<string | null>(initialLeadFilter);
  const [composeAttachments, setComposeAttachments] = useState<ComposeAttachment[]>([]);
  const [composeOutreachActive, setComposeOutreachActive] = useState(false);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadSearchOpen, setLeadSearchOpen] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [mailboxUnreadCounts, setMailboxUnreadCounts] = useState<Record<string, number>>({});
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(() => new Set());
  const toggleMessageExpanded = useCallback((messageId: string) => {
    setExpandedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);
  const expandAllMessages = useCallback(() => {
    setExpandedMessageIds(new Set(activeMessages.map((message) => message.id)));
  }, [activeMessages]);
  const collapseAllMessages = useCallback(() => {
    const latest = activeMessages[activeMessages.length - 1];
    setExpandedMessageIds(latest ? new Set([latest.id]) : new Set());
  }, [activeMessages]);
  const selectedSenderOption = useMemo(
    () => senderOptions.find((option) => option.value === composeFrom) ?? senderOptions[0] ?? null,
    [composeFrom, senderOptions],
  );
  const activeMailboxOption = useMemo(
    () => senderOptions.find((option) => option.value === activeMailbox) ?? senderOptions[0] ?? null,
    [activeMailbox, senderOptions],
  );
  const systemSignatureText = useMemo(
    () =>
      systemSignatureTextForSender({
        ownerEmail: selectedSenderOption?.email ?? viewerEmail,
        ownerRole: viewerRole,
      }),
    [selectedSenderOption?.email, viewerEmail, viewerRole],
  );
  const systemSignaturePreview = useMemo(
    () => (systemSignatureText ? splitSignatureForBanner(systemSignatureText) : null),
    [systemSignatureText],
  );

  const leadOptions = useMemo(() => {
    if (viewerRole === "partner") return initialLeadOptions ?? [];
    const leads = portalLeads ?? [];
    const visibleLeads = viewerRole === "sales"
      ? viewerAgentId
        ? leads.filter((lead) => lead.ownerId === viewerAgentId)
        : []
      : leads;
    return visibleLeads.map((lead) => ({
      id: lead.id,
      label: `${lead.company} · ${lead.contactName ?? "no contact"}`,
      email: lead.userProfile?.email ?? "",
      company: lead.company,
      contactName: lead.contactName,
    }));
  }, [initialLeadOptions, portalLeads, viewerAgentId, viewerRole]);

  const selectedComposeLead = useMemo<ComposeLeadDetails | null>(() => {
    if (composeLeadId) {
      const portalLead = portalLeads?.find((lead) => lead.id === composeLeadId);
      if (portalLead) {
        return {
          id: portalLead.id,
          label: `${portalLead.company} · ${portalLead.contactName ?? "no contact"}`,
          email: portalLead.userProfile?.email ?? "",
          company: portalLead.company,
          contactName: portalLead.contactName,
        };
      }

      const option = leadOptions.find((lead) => lead.id === composeLeadId);
      if (option) {
        return {
          id: option.id,
          label: option.label,
          email: option.email,
          company: option.company,
          contactName: option.contactName,
        };
      }
    }

    if (
      initialCompose &&
      (!composeLeadId || initialCompose.leadId === composeLeadId) &&
      (initialCompose.to || initialCompose.company || initialCompose.contactName)
    ) {
      return {
        id: initialCompose.leadId ?? composeLeadId,
        label:
          [initialCompose.company, initialCompose.contactName].filter(Boolean).join(" · ") ||
          initialCompose.to ||
          null,
        email: initialCompose.to ?? "",
        company: initialCompose.company ?? null,
        contactName: initialCompose.contactName ?? null,
      };
    }

    return null;
  }, [composeLeadId, initialCompose, leadOptions, portalLeads]);

  const filteredLeadOptions = useMemo(() => {
    const query = leadSearch.trim().toLowerCase();
    const matches = query
      ? leadOptions.filter((lead) =>
          [
            lead.label,
            lead.email,
            lead.company ?? "",
            lead.contactName ?? "",
          ].some((value) => value.toLowerCase().includes(query)),
        )
      : leadOptions;
    return matches.slice(0, 40);
  }, [leadOptions, leadSearch]);

  const selectComposeLead = useCallback(
    (lead: InboxLeadOption | null) => {
      const previousLeadEmail = selectedComposeLead?.email?.trim() ?? "";
      setComposeLeadId(lead?.id ?? null);
      setLeadSearch(lead?.label ?? "");
      setLeadSearchOpen(false);
      if (lead?.email && (!composeTo.trim() || composeTo.trim() === previousLeadEmail)) {
        setComposeTo(lead.email);
      }
    },
    [composeTo, selectedComposeLead?.email],
  );

  useEffect(() => {
    if (!composerOpen || leadSearchOpen) return;
    if (selectedComposeLead?.label) {
      setLeadSearch(selectedComposeLead.label);
      return;
    }
    if (!composeLeadId) setLeadSearch("");
  }, [composerOpen, composeLeadId, leadSearchOpen, selectedComposeLead?.label]);

  const refreshThreads = useCallback(async () => {
    setLoadingList(true);
    try {
      const url = new URL("/api/email/threads", window.location.origin);
      if (initialLeadFilter) url.searchParams.set("leadId", initialLeadFilter);
      if (viewerRole === "admin" && activeMailboxOption) {
        url.searchParams.set("mailbox", activeMailboxOption.email);
      }
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
  }, [activeMailboxOption, initialLeadFilter, viewerRole]);

  const switchMailbox = useCallback((option: InboxSenderOption) => {
    setActiveMailbox(option.value);
    setComposeFrom(option.value);
    setActiveThreadId(null);
    setActiveThread(null);
    setActiveMessages([]);
    setComposerOpen(false);
    setComposeOutreachActive(false);
    setLeadSearchOpen(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("mailbox", mailboxSlug(option));
      url.searchParams.delete("thread");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

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
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("oneos:notifications-changed"));
      }
    } catch {
      setError("Could not open thread");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  const applyOutreachTemplate = useCallback(async () => {
    setAttachmentBusy(true);
    setError(null);
    try {
      const brochureAttachment = await assetToAttachment(
        FOUNDATION_BROCHURE_PATH,
        FOUNDATION_BROCHURE_FILENAME,
        "application/pdf",
      );

      setComposeBody(buildOutreachBody(selectedComposeLead));
      setComposeOutreachActive(true);
      setComposeSubject(FOUNDATION_OUTREACH_SUBJECT);
      if (!composeTo.trim() && selectedComposeLead?.email) setComposeTo(selectedComposeLead.email);
      setComposeAttachments((prev) => [
        ...prev.filter((attachment) => attachment.filename !== FOUNDATION_BROCHURE_FILENAME),
        brochureAttachment,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load outreach brochure");
    } finally {
      setAttachmentBusy(false);
    }
  }, [composeTo, selectedComposeLead]);

  // Pre-open composer if launched from another surface (e.g. lead profile "Email client" button).
  const composerPrimedRef = useRef(false);
  useEffect(() => {
    if (composerPrimedRef.current) return;
    if (!initialCompose) return;
    const hasAny =
      Boolean(initialCompose.to) ||
      Boolean(initialCompose.subject) ||
      Boolean(initialCompose.body) ||
      Boolean(initialCompose.leadId) ||
      Boolean(initialCompose.template);
    if (!hasAny) return;
    composerPrimedRef.current = true;
    setComposeMode("new");
    setComposeFrom(activeMailboxOption?.value ?? senderOptions[0]?.value ?? "");
    setComposeTo(initialCompose.to ?? "");
    setComposeCc("");
    setComposeSubject(initialCompose.subject ?? "");
    setComposeBody(initialCompose.body ?? "");
    setComposeLeadId(initialCompose.leadId ?? null);
    setComposeOutreachActive(false);
    setComposeAttachments([]);
    setLeadSearch(
      [initialCompose.company, initialCompose.contactName].filter(Boolean).join(" · ") ||
        initialCompose.to ||
        "",
    );
    setLeadSearchOpen(false);
    setComposerOpen(true);
  }, [activeMailboxOption?.value, initialCompose, senderOptions]);

  const outreachPrimedRef = useRef(false);
  useEffect(() => {
    if (outreachPrimedRef.current) return;
    if (initialCompose?.template !== "outreach") return;
    if (!composerOpen) return;
    outreachPrimedRef.current = true;
    void applyOutreachTemplate();
  }, [applyOutreachTemplate, composerOpen, initialCompose?.template]);

  useEffect(() => {
    if (activeThreadId) void loadThread(activeThreadId);
  }, [activeThreadId, loadThread]);

  // Poll per-mailbox unread counts so the mailbox tabs (Karman / Sales / Support)
  // show numeric indicators when new mail arrives.
  useEffect(() => {
    if (viewerRole !== "admin") return;
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const res = await fetch("/api/notifications/summary", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { inboxCountsByMailbox?: Record<string, number> };
        if (!cancelled && json.inboxCountsByMailbox) {
          setMailboxUnreadCounts(json.inboxCountsByMailbox);
        }
      } catch {
        // ignore — tabs will fall back to no badge
      }
    };
    void fetchCounts();
    const interval = setInterval(() => void fetchCounts(), 30_000);
    const onChange = () => void fetchCounts();
    window.addEventListener("oneos:notifications-changed", onChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("oneos:notifications-changed", onChange);
    };
  }, [viewerRole]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages.length]);

  // When switching threads, collapse all but the latest message.
  // When new messages arrive on the current thread (poll/refresh), auto-expand them.
  const previousThreadIdRef = useRef<string | null>(null);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (activeMessages.length === 0) {
      knownMessageIdsRef.current = new Set();
      setExpandedMessageIds(new Set());
      previousThreadIdRef.current = activeThreadId;
      return;
    }

    const threadChanged = previousThreadIdRef.current !== activeThreadId;
    if (threadChanged) {
      const latest = activeMessages[activeMessages.length - 1];
      setExpandedMessageIds(latest ? new Set([latest.id]) : new Set());
      knownMessageIdsRef.current = new Set(activeMessages.map((message) => message.id));
      previousThreadIdRef.current = activeThreadId;
      return;
    }

    // Same thread: auto-expand any newly arrived messages.
    const known = knownMessageIdsRef.current;
    const newIds = activeMessages.filter((message) => !known.has(message.id)).map((m) => m.id);
    if (newIds.length > 0) {
      setExpandedMessageIds((prev) => {
        const next = new Set(prev);
        newIds.forEach((id) => next.add(id));
        return next;
      });
      knownMessageIdsRef.current = new Set(activeMessages.map((message) => message.id));
    }
  }, [activeMessages, activeThreadId]);

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
    const threadSender = senderOptions.find(
      (option) => option.email === activeThread.mailboxAddress,
    );
    setComposeFrom(threadSender?.value ?? senderOptions[0]?.value ?? "");
    setComposeTo(replyTo);
    setComposeCc("");
    const subject = activeThread.subject ?? "";
    setComposeSubject(/^re:\s/i.test(subject) ? subject : `Re: ${subject}`);
    setComposeBody("");
    setComposeLeadId(activeThread.leadId ?? null);
    setComposeAttachments([]);
    setComposeOutreachActive(false);
    setLeadSearch("");
    setLeadSearchOpen(false);
    setComposerOpen(true);
  }, [activeThread, activeMessages, senderOptions]);

  const startNew = useCallback(() => {
    setComposeMode("new");
    setComposeFrom(activeMailboxOption?.value ?? senderOptions[0]?.value ?? "");
    setComposeTo("");
    setComposeCc("");
    setComposeSubject("");
    setComposeBody("");
    setComposeLeadId(null);
    setComposeAttachments([]);
    setComposeOutreachActive(false);
    setLeadSearch("");
    setLeadSearchOpen(false);
    setComposerOpen(true);
  }, [activeMailboxOption?.value, senderOptions]);

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
          from: senderOptions.length > 0 ? composeFrom : undefined,
          body: composeBody,
          html: composeOutreachActive ? buildOutreachHtml(composeBody) : undefined,
          threadId: composeMode === "reply" ? activeThread?.id ?? null : null,
          leadId: composeLeadId,
          inReplyTo,
          referenceIds,
          attachments: composeAttachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
            contentId: a.contentId,
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
      setComposeOutreachActive(false);
      setLeadSearchOpen(false);
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
  }, [activeMessages, activeThread?.id, composeAttachments, composeBody, composeCc, composeFrom, composeLeadId, composeMode, composeOutreachActive, composeSubject, composeTo, loadThread, refreshThreads, senderOptions.length]);

  const inboxDescription = viewerRole === "partner"
    ? "Send and receive emails directly from 1OS. Replies are automatically threaded to your referred lead."
    : "Send and receive emails directly from 1OS. Replies are automatically threaded to the right lead.";
  const inboxTitle = viewerRole === "partner"
    ? "Email conversations with referred leads."
    : "Email conversations with clients.";

  return (
    <div className="space-y-5 pb-8">
      <AdminHeader
        eyebrow="Inbox"
        title={viewerRole === "admin" && activeMailboxOption ? `${activeMailboxOption.label} inbox` : inboxTitle}
        description={inboxDescription}
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

      {viewerRole === "admin" && senderOptions.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {senderOptions.map((option) => {
            const active = option.value === activeMailboxOption?.value;
            const unread = mailboxUnreadCounts[option.email] ?? 0;
            return (
              <button
                key={option.email}
                type="button"
                onClick={() => switchMailbox(option)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left transition",
                  active
                    ? "border-white/24 bg-white/[0.09] text-white"
                    : "border-white/8 bg-white/[0.025] text-white/64 hover:border-white/16 hover:text-white",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="block text-sm font-medium">{option.label}</span>
                  {unread > 0 ? (
                    <span className="inline-flex min-w-[1.4rem] items-center justify-center rounded-full border border-amber-300/30 bg-amber-300/[0.12] px-1.5 py-0.5 text-[0.62rem] font-semibold text-amber-100">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block truncate text-xs text-white/44">{option.email}</span>
              </button>
            );
          })}
        </div>
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
                    {activeMessages.length > 1 ? (
                      <button
                        type="button"
                        onClick={
                          expandedMessageIds.size >= activeMessages.length
                            ? collapseAllMessages
                            : expandAllMessages
                        }
                        className="rounded-lg border border-white/12 px-2.5 py-1.5 text-[0.68rem] uppercase tracking-[0.16em] text-white/65 transition hover:bg-white/[0.06] hover:text-white"
                      >
                        {expandedMessageIds.size >= activeMessages.length ? "Collapse all" : "Expand all"}
                      </button>
                    ) : null}
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

              <div className="flex-1 space-y-3 overflow-y-auto py-4">
                {loadingMessages ? (
                  <p className="text-sm text-white/50">Loading…</p>
                ) : (
                  activeMessages.map((message) => {
                    const isExpanded = expandedMessageIds.has(message.id);
                    const bodyText = readableMessageBody(message);
                    const snippet = preview(message);
                    return (
                      <article
                        key={message.id}
                        className={cn(
                          "rounded-2xl border transition",
                          message.direction === "inbound"
                            ? "border-white/8 bg-white/[0.04]"
                            : "border-emerald-300/30 bg-emerald-500/[0.06]",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggleMessageExpanded(message.id)}
                          aria-expanded={isExpanded}
                          className="flex w-full items-start justify-between gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-white/[0.03]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/55">
                              <span className="font-medium text-white/85">{message.fromName ?? message.fromAddress}</span>
                              <span className="text-white/40">to {message.toAddresses.join(", ")}</span>
                            </div>
                            {!isExpanded ? (
                              <p className="mt-1 truncate text-xs text-white/55">{snippet}</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-2 text-xs text-white/50">
                            <span title={message.sentAt}>{formatRelative(message.sentAt)}</span>
                            <svg
                              aria-hidden
                              viewBox="0 0 20 20"
                              className={cn(
                                "h-4 w-4 transition-transform",
                                isExpanded ? "rotate-180" : "rotate-0",
                              )}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.6"
                            >
                              <path d="M5 7.5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        </button>
                        {isExpanded ? (
                          <div className="border-t border-white/8 px-4 py-3">
                            <div className="whitespace-pre-wrap text-sm leading-7 text-white/85">
                              {bodyText}
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
                          </div>
                        ) : null}
                      </article>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </section>
      </div>

      {composerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center sm:p-4">
          <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0d0e10] shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
            <header className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4">
              <h3 className="text-base font-medium text-white">{composeMode === "reply" ? "Reply" : "New email"}</h3>
              <div className="flex items-center gap-2">
                {composeMode === "new" ? (
                  <button
                    type="button"
                    onClick={applyOutreachTemplate}
                    disabled={attachmentBusy}
                    className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Outreach
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setComposerOpen(false);
                    setLeadSearchOpen(false);
                  }}
                  className="rounded-lg border border-white/12 px-2.5 py-1 text-xs text-white/70 hover:bg-white/[0.06]"
                >
                  Close
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">

            {composeMode === "new" ? (
              <div className="mb-3">
                <label className="text-[0.62rem] uppercase tracking-[0.22em] text-white/52">Link to lead (optional)</label>
                <div className="relative mt-1">
                  <input
                    type="search"
                    value={leadSearch}
                    onFocus={() => setLeadSearchOpen(true)}
                    onBlur={() => window.setTimeout(() => setLeadSearchOpen(false), 120)}
                    onChange={(event) => {
                      setLeadSearch(event.target.value);
                      setLeadSearchOpen(true);
                      if (!event.target.value.trim()) setComposeLeadId(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setLeadSearchOpen(false);
                        return;
                      }
                      if (event.key === "Enter" && filteredLeadOptions[0]) {
                        event.preventDefault();
                        selectComposeLead(filteredLeadOptions[0]);
                      }
                    }}
                    placeholder="Search company, contact, or email"
                    className="w-full rounded-xl border border-white/12 bg-black/40 px-3 py-2 pr-20 text-sm text-white placeholder:text-white/30"
                  />
                  {composeLeadId ? (
                    <button
                      type="button"
                      onClick={() => selectComposeLead(null)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-white/12 px-2 py-1 text-[0.64rem] uppercase tracking-[0.16em] text-white/62 transition hover:bg-white/[0.05] hover:text-white"
                    >
                      Clear
                    </button>
                  ) : null}
                  {leadSearchOpen ? (
                    <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-56 overflow-y-auto rounded-xl border border-white/12 bg-[#090a0c] p-1 shadow-2xl">
                      {filteredLeadOptions.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-white/46">No matching leads.</p>
                      ) : (
                        filteredLeadOptions.map((lead) => (
                          <button
                            key={lead.id}
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              selectComposeLead(lead);
                            }}
                            className="block w-full rounded-lg px-3 py-2 text-left transition hover:bg-white/[0.06]"
                          >
                            <span className="block truncate text-sm font-medium text-white/86">{lead.label}</span>
                            <span className="mt-0.5 block truncate text-xs text-white/42">{lead.email || "No email on record"}</span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {viewerRole === "admin" && activeMailboxOption ? (
              <div className="mb-3">
                <label className="text-[0.62rem] uppercase tracking-[0.22em] text-white/52">From</label>
                <div className="mt-1 rounded-xl border border-white/12 bg-black/40 px-3 py-2 text-sm text-white">
                  {activeMailboxOption.label} - {activeMailboxOption.email}
                </div>
              </div>
            ) : senderOptions.length > 0 ? (
              <div className="mb-3">
                <label className="text-[0.62rem] uppercase tracking-[0.22em] text-white/52">From</label>
                <select
                  value={composeFrom}
                  onChange={(event) => setComposeFrom(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/12 bg-black/40 px-3 py-2 text-sm text-white"
                >
                  {senderOptions.map((option) => (
                    <option key={option.email} value={option.value}>
                      {option.label} - {option.email}
                    </option>
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
            {systemSignaturePreview ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-white/12 bg-black/35">
                <div className="border-b border-white/8 px-3 py-2">
                  <p className="text-[0.62rem] uppercase tracking-[0.22em] text-white/46">
                    Footer added to this email
                  </p>
                </div>
                <div className="space-y-3 p-3">
                  <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-5 text-white/72">
                    {systemSignaturePreview.beforeBanner}
                  </pre>
                  <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                    <img
                      src={FOUNDATION_EMAIL_BANNER_PATH}
                      alt="Foundation-1 email banner"
                      className="h-auto w-full object-cover"
                    />
                  </div>
                  {systemSignaturePreview.afterBanner ? (
                    <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-5 text-white/72">
                      {systemSignaturePreview.afterBanner}
                    </pre>
                  ) : null}
                </div>
              </div>
            ) : null}

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
                          new Promise<ComposeAttachment>(
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
                      {att.contentId ? <span className="text-white/40">Inline</span> : null}
                      <span className="text-white/40">{(att.size / 1024).toFixed(0)} KB</span>
                      <button
                        type="button"
                        onClick={() => {
                          setComposeAttachments((prev) => prev.filter((_, i) => i !== index));
                        }}
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
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/8 bg-[#0d0e10] px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setComposerOpen(false);
                  setComposeAttachments([]);
                  setComposeOutreachActive(false);
                  setLeadSearchOpen(false);
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

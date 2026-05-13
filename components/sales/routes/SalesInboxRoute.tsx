"use client";

/* eslint-disable @next/next/no-img-element -- Signature previews use user-selected data URLs. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { useOptionalAdminPortal } from "@/components/admin/AdminPortalProvider";
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

type EmailSignatureFooterImage = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
};

type EmailSignaturePayload = {
  signatureText: string;
  footerImage: EmailSignatureFooterImage | null;
};

type EmailSignatureResponse = {
  signature?: EmailSignaturePayload;
  error?: string;
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

const SIGNATURE_TEXT_MAX_LENGTH = 4000;
const SIGNATURE_IMAGE_MAX_BYTES = 512 * 1024;
const SIGNATURE_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const OUTREACH_BANNER_PATH = "/resources/email-banner-1-3.png";
const OUTREACH_BANNER_FILENAME = "Email Banner 1-3.png";
const OUTREACH_BANNER_CONTENT_ID = "foundation1-outreach-banner";
const OUTREACH_BROCHURE_PATH = "/resources/foundation-1-brochure.pdf";
const OUTREACH_BROCHURE_FILENAME = "foundation-1 Brochure.pdf";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(`Could not read ${file.name}`));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function firstName(value: string | null | undefined): string {
  return value?.trim().split(/\s+/)[0] ?? "";
}

function buildOutreachSubject(lead: ComposeLeadDetails | null): string {
  const company = lead?.company?.trim();
  return company ? `Foundation-1 - ${company}` : "Foundation-1 energy savings proposal";
}

function buildOutreachBody(lead: ComposeLeadDetails | null): string {
  const name = firstName(lead?.contactName) || "[Name]";
  const company = lead?.company?.trim() || "[Company Name]";

  return [
    `Good day ${name},`,
    "",
    "I hope you are well.",
    "",
    "My name is Karman from Foundation-1, an energy-as-a-service company based in Johannesburg.",
    "",
    "I am reaching out because we help South African businesses reduce electricity costs through zero-capex energy solutions, fully financed by Nedbank.",
    "",
    `For qualifying businesses, our Generocity solar solution can help ${company} save up to 35% on monthly electricity spend. This means there is no upfront payment for the solar panels, installation, maintenance, or insurance. There are also no separate monthly payments for the system. You only pay your new electricity tariff, which is structured to be lower than your current electricity cost.`,
    "",
    `The solar infrastructure remains owned by the development financier, Nedbank. In return, ${company} gets access to the system, full maintenance support, insurance cover, and reduced exposure to load shedding without carrying the capital cost of buying the system.`,
    "",
    "For larger electricity users, Foundation-1 also offers Lumen, backed by a 56 megawatt solar farm in the Free State. Through Lumen, qualifying businesses can enter into a power purchase agreement and save up to 50% on monthly electricity spend.",
    "",
    "To get a savings proposal, we would only need recent 6 month utility bill and a signed Expression of Interest. I have also attached a brochure for your attention below.",
    "",
    "Would you be open to a brief discussion?",
    "",
    "Regards,",
    "Karman Kekana",
    "Founder & Platform Engineer",
    "Foundation-1",
    "karman@foundation-1.co.za",
    "www.foundation-1.co.za",
    "No 17 Muswell Road, Wedgefield Office Park",
    "Regus Building Bryanston, Sandton",
    "Gauteng. 2191",
    "",
    "CONFIDENTIAL: This email and any files transmitted with it are confidential and intended solely for the use of the individual or entity to whom they are addressed. If you have received this email in error please notify the system manager. This message contains confidential information and is intended only for the individual named. If you are not the named addressee you should not disseminate, distribute or copy this email. Please notify the sender immediately by email if you have received this email by mistake and delete this email from your system. If you are not the intended recipient you are notified that disclosing, copying, distributing or taking any action in reliance on the contents of this information is strictly prohibited.",
  ].join("\n");
}

function buildOutreachHtml(body: string): string {
  return [
    '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">',
    `<div style="margin:0 0 18px 0;"><img src="cid:${OUTREACH_BANNER_CONTENT_ID}" alt="Foundation-1" style="display:block;max-width:764px;width:100%;height:auto;border:0;" /></div>`,
    textToHtml(body),
    "</div>",
  ].join("");
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

type InitialCompose = {
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  leadId?: string | null;
  template?: string | null;
  company?: string | null;
  contactName?: string | null;
};

export function SalesInboxRoute({
  initialThreadId,
  initialLeadFilter,
  initialCompose,
  viewerRole,
  viewerAgentId,
  initialLeadOptions,
  senderOptions = [],
}: {
  initialThreadId: string | null;
  initialLeadFilter: string | null;
  initialCompose?: InitialCompose | null;
  viewerRole: "admin" | "sales" | "partner";
  viewerAgentId: string | null;
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
  const [composeFrom, setComposeFrom] = useState(senderOptions[0]?.value ?? "");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeLeadId, setComposeLeadId] = useState<string | null>(initialLeadFilter);
  const [composeAttachments, setComposeAttachments] = useState<ComposeAttachment[]>([]);
  const [composeOutreachActive, setComposeOutreachActive] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [sending, setSending] = useState(false);

  const [signatureText, setSignatureText] = useState("");
  const [signatureFooterImage, setSignatureFooterImage] = useState<EmailSignatureFooterImage | null>(null);
  const [signatureLoading, setSignatureLoading] = useState(true);
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [signatureDirty, setSignatureDirty] = useState(false);
  const [signatureStatus, setSignatureStatus] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const signatureImageInputRef = useRef<HTMLInputElement | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
        email: initialCompose.to ?? "",
        company: initialCompose.company ?? null,
        contactName: initialCompose.contactName ?? null,
      };
    }

    return null;
  }, [composeLeadId, initialCompose, leadOptions, portalLeads]);

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

  useEffect(() => {
    let cancelled = false;

    async function loadSignature() {
      setSignatureLoading(true);
      setSignatureError(null);
      try {
        const res = await fetch("/api/email/signature", { cache: "no-store" });
        const json = (await res.json()) as EmailSignatureResponse;
        if (cancelled) return;
        if (!res.ok || !json.signature) {
          setSignatureError(json.error ?? "Could not load email signature");
          return;
        }
        setSignatureText(json.signature.signatureText ?? "");
        setSignatureFooterImage(json.signature.footerImage ?? null);
        setSignatureDirty(false);
      } catch {
        if (!cancelled) setSignatureError("Could not load email signature");
      } finally {
        if (!cancelled) setSignatureLoading(false);
      }
    }

    void loadSignature();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveSignature = useCallback(async () => {
    setSignatureSaving(true);
    setSignatureError(null);
    setSignatureStatus(null);
    try {
      const res = await fetch("/api/email/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatureText,
          footerImage: signatureFooterImage,
        }),
      });
      const json = (await res.json()) as EmailSignatureResponse;
      if (!res.ok || !json.signature) {
        setSignatureError(json.error ?? "Could not save email signature");
        return;
      }
      setSignatureText(json.signature.signatureText ?? "");
      setSignatureFooterImage(json.signature.footerImage ?? null);
      setSignatureDirty(false);
      setSignatureStatus("Signature saved");
    } catch {
      setSignatureError("Could not save email signature");
    } finally {
      setSignatureSaving(false);
    }
  }, [signatureFooterImage, signatureText]);

  const handleSignatureImageFile = useCallback(async (file: File) => {
    setSignatureError(null);
    setSignatureStatus(null);
    if (!SIGNATURE_IMAGE_MIME_TYPES.has(file.type)) {
      setSignatureError("Footer image must be PNG, JPG, WEBP, or GIF");
      return;
    }
    if (file.size > SIGNATURE_IMAGE_MAX_BYTES) {
      setSignatureError("Footer image must be 512 KB or smaller");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setSignatureFooterImage({
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        dataUrl,
      });
      setSignatureDirty(true);
    } catch (err) {
      setSignatureError(err instanceof Error ? err.message : "Could not read footer image");
    }
  }, []);

  const applyOutreachTemplate = useCallback(async () => {
    setAttachmentBusy(true);
    setError(null);
    try {
      const [bannerAttachment, brochureAttachment] = await Promise.all([
        assetToAttachment(
          OUTREACH_BANNER_PATH,
          OUTREACH_BANNER_FILENAME,
          "image/png",
          OUTREACH_BANNER_CONTENT_ID,
        ),
        assetToAttachment(
          OUTREACH_BROCHURE_PATH,
          OUTREACH_BROCHURE_FILENAME,
          "application/pdf",
        ),
      ]);

      setComposeBody(buildOutreachBody(selectedComposeLead));
      setComposeOutreachActive(true);
      if (!composeSubject.trim()) setComposeSubject(buildOutreachSubject(selectedComposeLead));
      if (!composeTo.trim() && selectedComposeLead?.email) setComposeTo(selectedComposeLead.email);
      setComposeAttachments((prev) => [
        ...prev.filter(
          (attachment) =>
            attachment.contentId !== OUTREACH_BANNER_CONTENT_ID &&
            attachment.filename !== OUTREACH_BROCHURE_FILENAME,
        ),
        bannerAttachment,
        brochureAttachment,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load outreach template assets");
    } finally {
      setAttachmentBusy(false);
    }
  }, [composeSubject, composeTo, selectedComposeLead]);

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
    setComposeFrom(senderOptions[0]?.value ?? "");
    setComposeTo(initialCompose.to ?? "");
    setComposeCc("");
    setComposeSubject(initialCompose.subject ?? "");
    setComposeBody(initialCompose.body ?? "");
    setComposeLeadId(initialCompose.leadId ?? null);
    setComposeOutreachActive(false);
    setComposeAttachments([]);
    setComposerOpen(true);
  }, [initialCompose, senderOptions]);

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
    setComposerOpen(true);
  }, [activeThread, activeMessages, senderOptions]);

  const startNew = useCallback(() => {
    setComposeMode("new");
    setComposeFrom(senderOptions[0]?.value ?? "");
    setComposeTo("");
    setComposeCc("");
    setComposeSubject("");
    setComposeBody("");
    setComposeLeadId(null);
    setComposeAttachments([]);
    setComposeOutreachActive(false);
    setComposerOpen(true);
  }, [senderOptions]);

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
        title={inboxTitle}
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

      <section className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[0.62rem] uppercase tracking-[0.26em] text-white/52">Email signature</p>
                <h2 className="mt-1 text-base font-medium text-white">Signature and footer image</h2>
                <p className="mt-1 text-sm leading-6 text-white/52">
                  This signature is appended to every email you send from this inbox. Add an optional footer image for banners, logos, or compliance artwork.
                </p>
              </div>
              <button
                type="button"
                onClick={saveSignature}
                disabled={signatureLoading || signatureSaving || !signatureDirty}
                className="rounded-xl border border-white/18 bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {signatureSaving ? "Saving…" : signatureDirty ? "Save signature" : "Saved"}
              </button>
            </div>

            <label className="mt-4 block text-[0.62rem] uppercase tracking-[0.22em] text-white/52">Signature text</label>
            <textarea
              value={signatureText}
              onChange={(event) => {
                setSignatureText(event.target.value);
                setSignatureDirty(true);
                setSignatureStatus(null);
                setSignatureError(null);
              }}
              maxLength={SIGNATURE_TEXT_MAX_LENGTH}
              rows={4}
              disabled={signatureLoading}
              placeholder={signatureLoading ? "Loading signature…" : "Name, title, contact details, disclaimer…"}
              className="mt-1 w-full rounded-xl border border-white/12 bg-black/40 px-3 py-2 text-sm leading-6 text-white placeholder:text-white/30 disabled:opacity-60"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.7rem] text-white/40">
              <span>{signatureText.length}/{SIGNATURE_TEXT_MAX_LENGTH} characters</span>
              <span>Footer images are embedded inline with sent emails.</span>
            </div>

            <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[0.62rem] uppercase tracking-[0.22em] text-white/52">Footer image</p>
                  <p className="mt-1 text-xs text-white/45">PNG, JPG, WEBP, or GIF · max {formatFileSize(SIGNATURE_IMAGE_MAX_BYTES)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {signatureFooterImage ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSignatureFooterImage(null);
                        setSignatureDirty(true);
                        setSignatureStatus(null);
                        setSignatureError(null);
                      }}
                      className="rounded-lg border border-white/12 px-2.5 py-1 text-[0.66rem] uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.05] hover:text-white"
                    >
                      Remove
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => signatureImageInputRef.current?.click()}
                    disabled={signatureLoading}
                    className="rounded-lg border border-white/14 px-2.5 py-1 text-[0.66rem] uppercase tracking-[0.18em] text-white/78 transition hover:border-white/28 hover:text-white disabled:opacity-50"
                  >
                    Upload image
                  </button>
                </div>
              </div>
              <input
                ref={signatureImageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  await handleSignatureImageFile(file);
                }}
              />
              {signatureFooterImage ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <img
                    src={signatureFooterImage.dataUrl}
                    alt="Email footer preview"
                    className="max-h-36 max-w-full rounded-lg object-contain"
                  />
                  <p className="mt-2 truncate text-xs text-white/50">
                    {signatureFooterImage.filename} · {formatFileSize(signatureFooterImage.sizeBytes)}
                  </p>
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-white/12 px-3 py-4 text-sm text-white/42">
                  No footer image uploaded.
                </p>
              )}
            </div>

            {signatureError ? (
              <p className="mt-3 text-sm text-rose-200">{signatureError}</p>
            ) : signatureStatus ? (
              <p className="mt-3 text-sm text-emerald-200">{signatureStatus}</p>
            ) : null}
          </div>

          <aside className="rounded-2xl border border-white/8 bg-black/25 p-4">
            <p className="text-[0.62rem] uppercase tracking-[0.26em] text-white/52">Preview</p>
            <div className="mt-3 rounded-xl border border-white/10 bg-white px-4 py-4 text-sm leading-6 text-zinc-900">
              <p>Message body appears here.</p>
              {(signatureText.trim() || signatureFooterImage) ? (
                <div className="mt-5 border-t border-zinc-200 pt-4">
                  {signatureText.trim() ? (
                    <p className="whitespace-pre-wrap">{signatureText.trim()}</p>
                  ) : null}
                  {signatureFooterImage ? (
                    <img
                      src={signatureFooterImage.dataUrl}
                      alt="Email footer preview"
                      className="mt-3 max-h-28 max-w-full object-contain"
                    />
                  ) : null}
                </div>
              ) : (
                <p className="mt-5 border-t border-zinc-200 pt-4 text-zinc-400">No saved signature yet.</p>
              )}
            </div>
          </aside>
        </div>
      </section>

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
                  onClick={() => setComposerOpen(false)}
                  className="rounded-lg border border-white/12 px-2.5 py-1 text-xs text-white/70 hover:bg-white/[0.06]"
                >
                  Close
                </button>
              </div>
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

            {senderOptions.length > 0 ? (
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

            {composeOutreachActive ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-white/12 bg-white/[0.03]">
                <img
                  src={OUTREACH_BANNER_PATH}
                  alt="Foundation-1 outreach banner"
                  className="h-auto w-full object-cover"
                />
              </div>
            ) : null}

            <label className="mt-3 block text-[0.62rem] uppercase tracking-[0.22em] text-white/52">Message</label>
            <textarea
              value={composeBody}
              onChange={(event) => setComposeBody(event.target.value)}
              rows={8}
              className="mt-1 w-full rounded-xl border border-white/12 bg-black/40 px-3 py-2 text-sm leading-6 text-white"
            />
            <p className="mt-1 text-[0.7rem] text-white/40">
              Your saved email signature and footer image are appended automatically when you send.
            </p>

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
                          if (att.contentId === OUTREACH_BANNER_CONTENT_ID) setComposeOutreachActive(false);
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

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setComposerOpen(false);
                  setComposeAttachments([]);
                  setComposeOutreachActive(false);
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

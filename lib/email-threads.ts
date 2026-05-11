/**
 * Data layer for the in-app email inbox (Resend outbound + inbound webhook).
 * All access uses the service-role Supabase client; gate callers in routes.
 */

import { getSupabaseAdminClient } from "./supabase-admin";

export type EmailDirection = "inbound" | "outbound";

export type EmailMessage = {
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
  sentByUserId: string | null;
  isRead: boolean;
  sentAt: string;
  createdAt: string;
  attachments: EmailAttachment[];
};

export type EmailAttachment = {
  id: string;
  messageId: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storagePath: string | null;
  createdAt: string;
};

export type EmailThread = {
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

type DbThreadRow = {
  id: string;
  lead_id: string | null;
  client_profile_id: string | null;
  mailbox_owner_user_id: string | null;
  mailbox_address: string | null;
  mailbox_role: "admin" | "sales" | "partner" | null;
  subject: string | null;
  participants: string[] | null;
  external_thread_id: string | null;
  last_message_at: string;
  last_direction: EmailDirection | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
};

type DbMessageRow = {
  id: string;
  thread_id: string;
  direction: EmailDirection;
  from_address: string;
  from_name: string | null;
  to_addresses: string[] | null;
  cc_addresses: string[] | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  reference_ids: string[] | null;
  provider_id: string | null;
  sent_by_user_id: string | null;
  is_read: boolean;
  sent_at: string;
  created_at: string;
};

type DbAttachmentRow = {
  id: string;
  message_id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  created_at: string;
};

function rowToThread(row: DbThreadRow): EmailThread {
  return {
    id: row.id,
    leadId: row.lead_id,
    clientProfileId: row.client_profile_id,
    mailboxOwnerUserId: row.mailbox_owner_user_id,
    mailboxAddress: row.mailbox_address,
    mailboxRole: row.mailbox_role,
    subject: row.subject,
    participants: row.participants ?? [],
    externalThreadId: row.external_thread_id,
    lastMessageAt: row.last_message_at,
    lastDirection: row.last_direction,
    unreadCount: row.unread_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToAttachment(row: DbAttachmentRow): EmailAttachment {
  return {
    id: row.id,
    messageId: row.message_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
    createdAt: row.created_at,
  };
}

function rowToMessage(row: DbMessageRow, attachments: EmailAttachment[] = []): EmailMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    direction: row.direction,
    fromAddress: row.from_address,
    fromName: row.from_name,
    toAddresses: row.to_addresses ?? [],
    ccAddresses: row.cc_addresses ?? [],
    subject: row.subject,
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    messageId: row.message_id,
    inReplyTo: row.in_reply_to,
    referenceIds: row.reference_ids ?? [],
    providerId: row.provider_id,
    sentByUserId: row.sent_by_user_id,
    isRead: row.is_read,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    attachments,
  };
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean)));
}

function normaliseSubject(subject: string | null | undefined): string {
  if (!subject) return "";
  return subject.replace(/^\s*(?:re|fwd?):\s*/i, "").trim().toLowerCase();
}

export type ListThreadsArgs = {
  leadId?: string | null;
  mailboxOwnerUserId?: string | null;
  mailboxAddress?: string | null;
  participantEmail?: string | null;
  limit?: number;
  search?: string | null;
};

export async function listThreads(args: ListThreadsArgs = {}): Promise<EmailThread[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  let query = supabase
    .from("oneos_email_threads")
    .select("*")
    .order("last_message_at", { ascending: false })
    .limit(args.limit ?? 100);

  if (args.leadId) query = query.eq("lead_id", args.leadId);
  if (args.mailboxOwnerUserId) {
    query = query.eq("mailbox_owner_user_id", args.mailboxOwnerUserId);
  } else if (args.mailboxAddress) {
    query = query.eq("mailbox_address", args.mailboxAddress.trim().toLowerCase());
  }
  if (args.participantEmail) {
    query = query.contains("participants", [args.participantEmail.trim().toLowerCase()]);
  }
  if (args.search) query = query.ilike("subject", `%${args.search}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[email-threads] list failed", error);
    return [];
  }
  return (data ?? []).map((row) => rowToThread(row as DbThreadRow));
}

export async function getUnreadThreadCount(args: ListThreadsArgs = {}): Promise<number> {
  const threads = await listThreads(args);
  return threads.reduce((total, thread) => total + Math.max(0, thread.unreadCount), 0);
}

export async function getThread(threadId: string): Promise<EmailThread | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("oneos_email_threads")
    .select("*")
    .eq("id", threadId)
    .maybeSingle();
  if (error || !data) return null;
  return rowToThread(data as DbThreadRow);
}

export async function listMessages(threadId: string): Promise<EmailMessage[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("oneos_email_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("sent_at", { ascending: true });
  if (error) {
    console.error("[email-threads] listMessages failed", error);
    return [];
  }
  const rows = (data ?? []) as DbMessageRow[];
  if (rows.length === 0) return [];

  const messageIds = rows.map((row) => row.id);
  const { data: attachmentRows, error: attachmentError } = await supabase
    .from("oneos_email_attachments")
    .select("*")
    .in("message_id", messageIds)
    .order("created_at", { ascending: true });
  if (attachmentError) {
    console.error("[email-threads] listAttachments failed", attachmentError);
  }

  const attachmentsByMessage = new Map<string, EmailAttachment[]>();
  for (const attachment of (attachmentRows ?? []) as DbAttachmentRow[]) {
    const next = attachmentsByMessage.get(attachment.message_id) ?? [];
    next.push(rowToAttachment(attachment));
    attachmentsByMessage.set(attachment.message_id, next);
  }

  return rows.map((row) => rowToMessage(row, attachmentsByMessage.get(row.id) ?? []));
}

export async function markThreadRead(threadId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  await supabase.from("oneos_email_messages").update({ is_read: true }).eq("thread_id", threadId).eq("is_read", false);
  await supabase.from("oneos_email_threads").update({ unread_count: 0 }).eq("id", threadId);
}

type FindThreadArgs = {
  inReplyTo?: string | null;
  references?: string[] | null;
  externalThreadId?: string | null;
  subject?: string | null;
  participantHint?: string | null;
};

export async function findThread(args: FindThreadArgs): Promise<EmailThread | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  // 1. Match by Message-ID of any message in our DB.
  const candidates: string[] = [];
  if (args.inReplyTo) candidates.push(args.inReplyTo);
  for (const ref of args.references ?? []) candidates.push(ref);
  if (candidates.length > 0) {
    const { data } = await supabase
      .from("oneos_email_messages")
      .select("thread_id")
      .in("message_id", candidates)
      .limit(1);
    const threadId = (data?.[0] as { thread_id?: string } | undefined)?.thread_id;
    if (threadId) return getThread(threadId);
  }

  // 2. Match by stored external thread id.
  if (args.externalThreadId) {
    const { data } = await supabase
      .from("oneos_email_threads")
      .select("*")
      .eq("external_thread_id", args.externalThreadId)
      .maybeSingle();
    if (data) return rowToThread(data as DbThreadRow);
  }

  // 3. Soft-match by participant + normalised subject (last 30 days).
  if (args.subject && args.participantHint) {
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
    const { data } = await supabase
      .from("oneos_email_threads")
      .select("*")
      .gte("last_message_at", since)
      .contains("participants", [args.participantHint.toLowerCase()])
      .order("last_message_at", { ascending: false })
      .limit(20);
    const wanted = normaliseSubject(args.subject);
    const hit = (data ?? []).find((row) => normaliseSubject((row as DbThreadRow).subject) === wanted);
    if (hit) return rowToThread(hit as DbThreadRow);
  }

  return null;
}

export type RecordMessageArgs = {
  threadId?: string | null;
  leadId?: string | null;
  clientProfileId?: string | null;
  direction: EmailDirection;
  mailboxOwnerUserId?: string | null;
  mailboxAddress?: string | null;
  mailboxRole?: "admin" | "sales" | "partner" | null;
  fromAddress: string;
  fromName?: string | null;
  toAddresses: string[];
  ccAddresses?: string[];
  subject?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  referenceIds?: string[];
  providerId?: string | null;
  sentByUserId?: string | null;
  externalThreadId?: string | null;
  sentAt?: string;
};

export type RecordMessageResult = { thread: EmailThread; message: EmailMessage; created: boolean };

export async function recordMessage(args: RecordMessageArgs): Promise<RecordMessageResult | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const existingCandidates: DbMessageRow[] = [];
  if (args.providerId) {
    const { data } = await supabase
      .from("oneos_email_messages")
      .select("*")
      .eq("provider_id", args.providerId)
      .limit(1);
    if (data?.[0]) existingCandidates.push(data[0] as DbMessageRow);
  }
  if (args.messageId) {
    const { data } = await supabase
      .from("oneos_email_messages")
      .select("*")
      .eq("message_id", args.messageId)
      .limit(1);
    if (data?.[0]) existingCandidates.push(data[0] as DbMessageRow);
  }
  const existingMessage = existingCandidates[0];
  if (existingMessage) {
    const thread = await getThread(existingMessage.thread_id);
    if (!thread) return null;
    return { thread, message: rowToMessage(existingMessage), created: false };
  }

  const sentAt = args.sentAt ?? new Date().toISOString();
  const participants = dedupe([args.fromAddress, ...args.toAddresses, ...(args.ccAddresses ?? [])]);
  let threadId = args.threadId ?? null;

  if (!threadId) {
    // Try to attach to an existing thread.
    const matched = await findThread({
      inReplyTo: args.inReplyTo,
      references: args.referenceIds,
      externalThreadId: args.externalThreadId,
      subject: args.subject,
      participantHint: args.direction === "inbound" ? args.fromAddress : args.toAddresses[0] ?? null,
    });
    if (matched) threadId = matched.id;
  }

  if (!threadId) {
    const { data: created, error: createErr } = await supabase
      .from("oneos_email_threads")
      .insert({
        lead_id: args.leadId ?? null,
        client_profile_id: args.clientProfileId ?? null,
        mailbox_owner_user_id: args.mailboxOwnerUserId ?? null,
        mailbox_address: args.mailboxAddress?.trim().toLowerCase() ?? null,
        mailbox_role: args.mailboxRole ?? null,
        subject: args.subject ?? null,
        participants,
        external_thread_id: args.externalThreadId ?? null,
        last_message_at: sentAt,
        last_direction: args.direction,
        unread_count: args.direction === "inbound" ? 1 : 0,
      })
      .select("*")
      .single();
    if (createErr || !created) {
      console.error("[email-threads] thread insert failed", createErr);
      return null;
    }
    threadId = (created as DbThreadRow).id;
  } else {
    // Merge participants + bump metadata.
    const { data: existing } = await supabase
      .from("oneos_email_threads")
      .select("participants, unread_count, lead_id, client_profile_id, mailbox_owner_user_id, mailbox_address, mailbox_role")
      .eq("id", threadId)
      .maybeSingle();
    const existingRow = existing as Pick<
      DbThreadRow,
      "participants" | "unread_count" | "lead_id" | "client_profile_id" | "mailbox_owner_user_id" | "mailbox_address" | "mailbox_role"
    > | null;
    const mergedParticipants = dedupe([...(existingRow?.participants ?? []), ...participants]);
    const nextUnread = args.direction === "inbound" ? (existingRow?.unread_count ?? 0) + 1 : (existingRow?.unread_count ?? 0);
    await supabase
      .from("oneos_email_threads")
      .update({
        participants: mergedParticipants,
        last_message_at: sentAt,
        last_direction: args.direction,
        unread_count: nextUnread,
        updated_at: sentAt,
        lead_id: existingRow?.lead_id ?? args.leadId ?? null,
        client_profile_id: existingRow?.client_profile_id ?? args.clientProfileId ?? null,
        mailbox_owner_user_id: existingRow?.mailbox_owner_user_id ?? args.mailboxOwnerUserId ?? null,
        mailbox_address: existingRow?.mailbox_address ?? args.mailboxAddress?.trim().toLowerCase() ?? null,
        mailbox_role: existingRow?.mailbox_role ?? args.mailboxRole ?? null,
      })
      .eq("id", threadId);
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("oneos_email_messages")
    .insert({
      thread_id: threadId,
      direction: args.direction,
      from_address: args.fromAddress.toLowerCase(),
      from_name: args.fromName ?? null,
      to_addresses: args.toAddresses.map((v) => v.toLowerCase()),
      cc_addresses: (args.ccAddresses ?? []).map((v) => v.toLowerCase()),
      subject: args.subject ?? null,
      body_text: args.bodyText ?? null,
      body_html: args.bodyHtml ?? null,
      message_id: args.messageId ?? null,
      in_reply_to: args.inReplyTo ?? null,
      reference_ids: args.referenceIds ?? [],
      provider_id: args.providerId ?? null,
      sent_by_user_id: args.sentByUserId ?? null,
      is_read: args.direction === "outbound",
      sent_at: sentAt,
    })
    .select("*")
    .single();
  if (insertErr || !inserted) {
    console.error("[email-threads] message insert failed", insertErr);
    return null;
  }

  const thread = await getThread(threadId);
  if (!thread) return null;
  return { thread, message: rowToMessage(inserted as DbMessageRow), created: true };
}

import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email";

export type NotificationAudience = "admin" | "sales" | "customer";

export type NotificationKind =
  | "eoi_signed"
  | "customer_uploaded_document"
  | "admin_uploaded_document"
  | "system";

export type NotificationRecord = {
  id: string;
  audience: NotificationAudience;
  recipientEmail: string | null;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  emailedAt: string | null;
  createdAt: string;
};

const TABLE = "oneos_notifications";

function normalizeEnv(value?: string) {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "");
}

function adminNotifyEmail(): string | null {
  return normalizeEnv(process.env.ADMIN_NOTIFY_EMAIL) || null;
}

function appBaseUrl(): string {
  return normalizeEnv(process.env.APP_BASE_URL) || "http://localhost:3000";
}

export type CreateNotificationInput = {
  audience: NotificationAudience;
  recipientEmail?: string | null;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
  metadata?: Record<string, unknown>;
  /** When true (default), also send an email if the recipient + provider are configured. */
  email?: boolean;
};

export async function createNotification(
  input: CreateNotificationInput,
): Promise<NotificationRecord | null> {
  const client = getSupabaseAdminClient();
  if (!client) return null;

  const recipient =
    input.recipientEmail ??
    (input.audience === "admin" ? adminNotifyEmail() : null);

  const { data, error } = await client
    .from(TABLE)
    .insert({
      audience: input.audience,
      recipient_email: recipient,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      metadata: input.metadata ?? {},
    })
    .select()
    .single();

  if (error || !data) return null;

  let emailedAt: string | null = null;
  if (input.email !== false && recipient) {
    const link = input.link ? `${appBaseUrl()}${input.link.startsWith("/") ? input.link : `/${input.link}`}` : null;
    const text = [
      input.title,
      "",
      input.body ?? "",
      link ? `\nOpen in 1OS: ${link}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await sendEmail({
      to: recipient,
      subject: `[1OS] ${input.title}`,
      text,
    });
    if (result.ok) {
      emailedAt = new Date().toISOString();
      await client.from(TABLE).update({ emailed_at: emailedAt }).eq("id", data.id);
    }
  }

  return mapRow({ ...data, emailed_at: emailedAt ?? data.emailed_at });
}

export async function listNotifications(opts: {
  audience?: NotificationAudience;
  recipientEmail?: string;
  limit?: number;
}): Promise<NotificationRecord[]> {
  const client = getSupabaseAdminClient();
  if (!client) return [];

  let query = client
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.audience) query = query.eq("audience", opts.audience);
  if (opts.recipientEmail) query = query.eq("recipient_email", opts.recipientEmail.trim().toLowerCase());

  const { data } = await query;
  return (data ?? []).map(mapRow);
}

export async function markNotificationRead(id: string): Promise<void> {
  const client = getSupabaseAdminClient();
  if (!client) return;
  await client
    .from(TABLE)
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
}

export async function markNotificationsRead(
  ids: string[],
  opts: { audience?: NotificationAudience; recipientEmail?: string | null } = {},
): Promise<void> {
  const client = getSupabaseAdminClient();
  if (!client || ids.length === 0) return;

  let query = client
    .from(TABLE)
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .is("read_at", null);

  if (opts.audience) query = query.eq("audience", opts.audience);
  if (opts.recipientEmail !== undefined) {
    const email = opts.recipientEmail?.trim().toLowerCase();
    query = email ? query.eq("recipient_email", email) : query.is("recipient_email", null);
  }

  await query;
}

function mapRow(row: Record<string, unknown>): NotificationRecord {
  return {
    id: String(row.id),
    audience: row.audience as NotificationAudience,
    recipientEmail: row.recipient_email ? String(row.recipient_email) : null,
    kind: row.kind as NotificationKind,
    title: String(row.title),
    body: row.body ? String(row.body) : null,
    link: row.link ? String(row.link) : null,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    readAt: row.read_at ? String(row.read_at) : null,
    emailedAt: row.emailed_at ? String(row.emailed_at) : null,
    createdAt: String(row.created_at),
  };
}

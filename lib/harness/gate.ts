/**
 * HARNESS — the approval gate (doc 20 invariant #1).
 *
 * Every outward-facing artifact is a draft in foundation1_send_queue first.
 * Nothing leaves the platform without a founder approval on record, and no
 * code path anywhere may write `sent` over an unapproved row. The database
 * carries its own CHECK as a backstop; this module enforces it in code so
 * violations fail loudly in tests instead of silently in production.
 *
 * Volume caps are doc 15 decisions, enforced here in one place:
 *   - max 20 approved sends per calendar day, platform-wide
 *   - max 1 send per prospect per rolling 7 days (one follow-up cadence)
 */
import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const SEND_DAILY_CAP = 20;
export const FOLLOWUP_ROLLING_DAYS = 7;

export type SendQueueStatus = "draft" | "approved" | "rejected" | "sent";

/**
 * Outreach is a letter from a person, so it leaves from that person's warmed
 * mailbox and replies come back to him. The noreply address is transactional
 * chrome for lifecycle mail and must never carry a first touch: a director who
 * wants to answer has nowhere to send it, and the signature would not match the
 * envelope.
 */
export function outreachSender(): { from: string; replyTo: string } {
  // Send from the warmed mailbox, take replies on the founder's direct address.
  const address = (process.env.OUTREACH_FROM_ADDRESS || "karman@1os.foundation-1.co.za").trim();
  const replyTo = (process.env.OUTREACH_REPLY_TO || "karman@foundation-1.co.za").trim();
  const name = (process.env.OUTREACH_FROM_NAME || "Karman Kekana").trim();
  return { from: `${name} <${address}>`, replyTo };
}

export type SendChannel = "email";

export type SendQueueDraftInput = {
  agent: string;
  prospectKey: string;
  channel?: SendChannel;
  templateKey?: string | null;
  toAddress?: string | null;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  payload?: Record<string, unknown>;
};

export type SendQueueRow = {
  id: string;
  agent: string;
  channel: SendChannel;
  prospectKey: string;
  templateKey: string | null;
  toAddress: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  payload: Record<string, unknown>;
  status: SendQueueStatus;
  createdAt: string;
};

function client() {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin configuration is unavailable.");
  return admin;
}

function mapRow(row: Record<string, unknown>): SendQueueRow {
  return {
    id: row.id as string,
    agent: row.agent as string,
    channel: (row.channel ?? "email") as SendChannel,
    prospectKey: row.prospect_key as string,
    templateKey: (row.template_key ?? null) as string | null,
    toAddress: (row.to_address ?? null) as string | null,
    subject: row.subject as string,
    bodyText: row.body_text as string,
    bodyHtml: (row.body_html ?? null) as string | null,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    status: row.status as SendQueueStatus,
    createdAt: row.created_at as string,
  };
}

/** Queue a draft. Drafts never reach anyone; they wait for the founder. */
export async function queueSendDraft(input: SendQueueDraftInput): Promise<SendQueueRow> {
  if (!input.agent.trim()) throw new Error("The sending agent must be named.");
  if (!input.prospectKey.trim()) throw new Error("A prospect key is required for cadence control.");
  if (!input.subject.trim()) throw new Error("Draft subject is required.");
  if (!input.bodyText.trim()) throw new Error("Draft body is required.");

  const { data, error } = await client()
    .from("foundation1_send_queue")
    .insert({
      id: randomUUID(),
      agent: input.agent.trim(),
      channel: input.channel ?? "email",
      prospect_key: input.prospectKey.trim(),
      template_key: input.templateKey ?? null,
      to_address: input.toAddress ?? null,
      subject: input.subject.trim(),
      body_text: input.bodyText,
      body_html: input.bodyHtml ?? null,
      payload: input.payload ?? {},
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

/** Founder approval. This is the only door between draft and sendable. */
export async function approveSend(id: string, approver: string): Promise<SendQueueRow> {
  if (!approver.trim()) throw new Error("An approval must name its approver.");
  const { data, error } = await client()
    .from("foundation1_send_queue")
    .update({ status: "approved", approved_by: approver.trim(), approved_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["draft"])
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Only a pending draft can be approved (${id}).`);
  return mapRow(data);
}

/** Founder rejection, with a reason that becomes a learning signal downstream. */
export async function rejectSend(id: string, reason: string): Promise<SendQueueRow> {
  if (!reason.trim()) throw new Error("A rejection must carry its reason.");
  const { data, error } = await client()
    .from("foundation1_send_queue")
    .update({ status: "rejected", rejected_reason: reason.trim(), rejected_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["draft", "approved"])
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Only a draft or an approved send can be rejected (${id}).`);
  return mapRow(data);
}

/**
 * Mark an APPROVED row as sent. This is the exact boundary of the platform.
 * The guard below plus the table CHECK make the unapproved path impossible
 * rather than merely discouraged.
 */
export async function markSent(id: string): Promise<SendQueueRow> {
  const { data, error } = await client()
    .from("foundation1_send_queue")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "approved")
    .not("approved_at", "is", null)
    .not("approved_by", "is", null)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      `Send blocked by the approval gate: only an approved draft can be marked sent (${id}).`,
    );
  }
  return mapRow(data);
}

// ---------------------------------------------------------------------------
// Caps and cadence — pure functions so the rules are testable without Supabase.
// ---------------------------------------------------------------------------

export type CapContext = {
  /** ISO timestamps of sends already made today, platform-wide. */
  sentTodayIso: string[];
  /** ISO timestamps of this prospect's sends inside the rolling window. */
  prospectSendsIso: string[];
};

export function withinDailyCap(sentTodayIso: string[], cap = SEND_DAILY_CAP): boolean {
  return sentTodayIso.length < cap;
}

export function outsideFollowupWindow(prospectSendsIso: string[], nowIso: string): boolean {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new Error("Cadence check needs a valid timestamp.");
  const windowStart = now - FOLLOWUP_ROLLING_DAYS * 24 * 60 * 60 * 1000;
  return !prospectSendsIso.some((iso) => {
    const at = Date.parse(iso);
    return Number.isFinite(at) && at >= windowStart && at <= now;
  });
}

/** True when the founder-approved batch may go out right now, caps respected. */
export function canDispatch(row: Pick<SendQueueRow, "status" | "prospectKey">, caps: CapContext, nowIso: string): boolean {
  return (
    row.status === "approved"
    && withinDailyCap(caps.sentTodayIso)
    && outsideFollowupWindow(caps.prospectSendsIso, nowIso)
  );
}

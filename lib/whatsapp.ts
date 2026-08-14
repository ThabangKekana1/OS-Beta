import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * WhatsApp Business Cloud API rail.
 *
 * Env:
 *   WHATSAPP_TOKEN            - permanent access token (Meta app -> WhatsApp -> API setup)
 *   WHATSAPP_PHONE_NUMBER_ID  - the Cloud API phone-number id (NOT the msisdn)
 *   WHATSAPP_VERIFY_TOKEN     - webhook verification token (any secret string, mirrored in the Meta app)
 *   WHATSAPP_AGENT_SECRET     - shared secret for the agent bridge endpoints
 *   WHATSAPP_ALLOWED_NUMBERS  - comma-separated msisdns allowed to converse (e.g. "27698117112")
 *
 * Inbox storage: Supabase Storage bucket (ONEOS_SUPABASE_BUCKET), keys:
 *   whatsapp/inbox/<ts>-<id>.json     - awaiting the agent
 *   whatsapp/handled/<ts>-<id>.json   - archived after reply
 */

const GRAPH = "https://graph.facebook.com/v21.0";

function accessToken() {
  return process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.WHATSAPP_TOKEN ?? null;
}

export function whatsappConfigured() {
  return Boolean(accessToken() && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export function normalizeMsisdn(value: string) {
  return value.replace(/[^0-9]/g, "");
}

export function isAllowedNumber(msisdn: string) {
  const raw = process.env.WHATSAPP_ALLOWED_NUMBERS ?? "";
  const allowed = raw.split(",").map((entry) => normalizeMsisdn(entry)).filter(Boolean);
  if (allowed.length === 0) return false;
  return allowed.includes(normalizeMsisdn(msisdn));
}

export async function sendWhatsAppText(to: string, body: string) {
  if (!whatsappConfigured()) {
    return { ok: false as const, reason: "WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not configured" };
  }
  const response = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizeMsisdn(to),
      type: "text",
      text: { preview_url: true, body },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false as const, reason: `graph ${response.status}: ${JSON.stringify(payload).slice(0, 300)}` };
  }
  return { ok: true as const, id: payload?.messages?.[0]?.id ?? null };
}

export type StoredWhatsAppMessage = {
  id: string;
  from: string;
  name: string | null;
  body: string;
  type: string;
  timestamp: string;
  storedAt: string;
  key?: string;
};

function bucket() {
  return process.env.ONEOS_SUPABASE_BUCKET ?? "oneos";
}

export async function storeInboundMessage(message: Omit<StoredWhatsAppMessage, "storedAt" | "key">) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false as const, reason: "supabase not configured" };
  const stored: StoredWhatsAppMessage = { ...message, storedAt: new Date().toISOString() };
  const key = `whatsapp/inbox/${Date.now()}-${message.id.replace(/[^A-Za-z0-9._-]/g, "").slice(-24)}.json`;
  const { error } = await supabase.storage
    .from(bucket())
    .upload(key, JSON.stringify(stored, null, 2), { contentType: "application/json", upsert: true });
  if (error) return { ok: false as const, reason: error.message };
  return { ok: true as const, key };
}

export async function listPendingMessages(): Promise<StoredWhatsAppMessage[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase.storage.from(bucket()).list("whatsapp/inbox", {
    limit: 50,
    sortBy: { column: "name", order: "asc" },
  });
  if (error || !data) return [];
  const messages: StoredWhatsAppMessage[] = [];
  for (const entry of data) {
    if (!entry.name.endsWith(".json")) continue;
    const key = `whatsapp/inbox/${entry.name}`;
    const { data: blob } = await supabase.storage.from(bucket()).download(key);
    if (!blob) continue;
    try {
      const parsed = JSON.parse(await blob.text()) as StoredWhatsAppMessage;
      parsed.key = key;
      messages.push(parsed);
    } catch {
      // skip malformed entries
    }
  }
  return messages;
}

export async function archiveMessage(key: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false as const, reason: "supabase not configured" };
  const target = key.replace("whatsapp/inbox/", "whatsapp/handled/");
  const { error } = await supabase.storage.from(bucket()).move(key, target);
  if (error) return { ok: false as const, reason: error.message };
  return { ok: true as const };
}

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { recordDeliveryEvent } from "@/lib/harness/gate";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Delivery sync — the API-polling half of delivery truth.
 *
 * Resend's webhook dispatch has been silent (enabled endpoint, zero events),
 * so the ledger cannot wait on it. Resend's per-email API answers reliably
 * with last_event, so this sync polls every sent letter that carries a resend
 * id and no confirmed outcome yet, and records delivered / bounced /
 * complained into foundation1_outcomes through the same correlation the
 * webhook uses. Idempotent: a resend id is polled once, then never again.
 */
const KINDS: Record<string, "delivered" | "bounced" | "complained"> = {
  delivered: "delivered",
  bounced: "bounced",
  complained: "complained",
};

export async function GET(request: NextRequest) {
  const configured = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!configured || supplied !== configured) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Store unavailable." }, { status: 503 });
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Resend key not configured." }, { status: 503 });
  }

  const sent = await admin
    .from("foundation1_outcomes")
    .select("meta,prospect_key")
    .eq("event", "sent")
    .not("meta->>resend_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(200);
  const confirmed = await admin
    .from("foundation1_outcomes")
    .select("meta")
    .in("event", ["delivered", "bounced", "complained"]);
  const done = new Set((confirmed.data ?? []).map((row) => (row.meta as { resend_id?: string })?.resend_id).filter(Boolean));

  let checked = 0;
  let recorded = 0;
  const results: Array<{ resendId: string; kind?: string; recorded: boolean }> = [];

  for (const row of sent.data ?? []) {
    const resendId = (row.meta as { resend_id?: string })?.resend_id;
    if (!resendId || done.has(resendId)) continue;
    checked += 1;
    if (checked > 50) break; // bound the run; the next tick continues
    const res = await fetch(`https://api.resend.com/emails/${resendId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) continue;
    const body = (await res.json()) as { last_event?: string; created_at?: string };
    const kind = KINDS[body.last_event ?? ""];
    if (!kind) continue;
    const result = await recordDeliveryEvent({ resendId, kind, occurredAt: body.created_at });
    recorded += result.recorded ? 1 : 0;
    results.push({ resendId, kind, recorded: result.recorded });
  }

  return NextResponse.json({ ok: true, checked, recorded, results });
}

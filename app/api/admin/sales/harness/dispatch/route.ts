/**
 * Dispatch: send APPROVED queue rows via Resend, caps enforced.
 * Rejection at the gate is impossible to bypass; the daily cap and rolling
 * cadence window are checked here per candidate before the wire call.
 */
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { markSent, SEND_DAILY_CAP, canDispatch } from "@/lib/harness/gate";
import { say } from "@/lib/harness/voice";
import { sendEmail } from "@/lib/email";

export async function POST() {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const approver = session.email ?? session.name ?? "admin";
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Store unavailable." }, { status: 503 });
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const [approvedRes, sentTodayRes] = await Promise.all([
    admin
      .from("foundation1_send_queue")
      .select("*")
      .eq("status", "approved")
      .not("approved_at", "is", null)
      .order("approved_at", { ascending: true })
      .limit(50),
    admin
      .from("foundation1_send_queue")
      .select("prospect_key,sent_at")
      .gte("sent_at", dayStart.toISOString()),
  ]);
  if (approvedRes.error || sentTodayRes.error) {
    return NextResponse.json(
      { ok: false, error: approvedRes.error?.message ?? sentTodayRes.error?.message ?? "Dispatch query failed." },
      { status: 500 },
    );
  }

  const nowIso = new Date().toISOString();
  const sentByProspect = new Map<string, string[]>();
  let sentTodayCount = (sentTodayRes.data ?? []).length;

  const results: Array<{ id: string; prospectKey: string; ok: boolean; detail?: string }> = [];
  for (const row of approvedRes.data ?? []) {
    if (results.filter((r) => r.ok).length >= SEND_DAILY_CAP - sentTodayCount) break;
    const prospectKey = row.prospect_key as string;

    // Pull this prospect's sends inside the rolling cadence window.
    const { data: prospectSends } = await admin
      .from("foundation1_send_queue")
      .select("sent_at")
      .eq("prospect_key", prospectKey)
      .gte("sent_at", new Date(Date.parse(nowIso) - 7 * 24 * 60 * 60 * 1000).toISOString());
    const prospectSendsIso = (prospectSends ?? [])
      .map((r) => r.sent_at as string)
      .filter(Boolean);
    void sentByProspect;

    const allowed = canDispatch(
      { status: "approved", prospectKey },
      { sentTodayIso: new Array(Math.max(0, sentTodayCount)), prospectSendsIso },
      nowIso,
    );
    if (!allowed) {
      results.push({ id: row.id, prospectKey, ok: false, detail: "blocked by cap or cadence" });
      continue;
    }

    const outcome = await sendEmail({
      to: row.to_address as string,
      subject: row.subject as string,
      text: row.body_text as string,
      html: (row.body_html as string | null) ?? undefined,
    });

    if (!outcome.ok) {
      results.push({
        id: row.id,
        prospectKey,
        ok: false,
        detail: "skipped" in outcome && outcome.skipped ? outcome.reason : "send failed",
      });
      continue;
    }

    await markSent(row.id as string);
    await admin.from("foundation1_outcomes").insert({
      send_queue_id: row.id,
      prospect_key: prospectKey,
      event: "sent",
      meta: { template_key: row.template_key, dispatched_by: approver }
    });
    sentTodayCount += 1;
    results.push({ id: row.id, prospectKey, ok: true });
  }

  const dispatched = results.filter((r) => r.ok).length;
  if (dispatched > 0) {
    say(`Dispatched ${dispatched} approved send(s). ${results.filter((r) => !r.ok).length} blocked by caps/cadence.`, { kind: "dispatch", dispatched });
  }
  return NextResponse.json({ ok: true, dispatched, results });
}

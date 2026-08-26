/**
 * The Deck API (doc 21) — the decision-first founder surface.
 *
 * GET  → the whole deck in one payload: ordered Today Queue, receipts,
 *        funnel + deal-book brief, and the latest improvement decisions.
 * POST → batch verdicts { verdicts: [{ id, action, reason }] } routed
 *        STRICTLY through lib/harness/gate. No other write exists here.
 */
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { computeDealBook } from "@/lib/harness/dealbook";
import { approveSend, rejectSend } from "@/lib/harness/gate";
import { orderQueueForFounder, takeReceipts, type QueueItem } from "@/lib/harness/deck";

async function requireAdmin() {
  const session = await getServerAuthSession();
  return session && session.role === "admin" ? session : null;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Store unavailable." }, { status: 503 });
  }

  const [queueRes, decisionsRes] = await Promise.all([
    admin
      .from("foundation1_send_queue")
      .select("*")
      .in("status", ["draft", "approved", "sent", "rejected"])
      .order("created_at", { ascending: false })
      .limit(150),
    admin
      .from("foundation1_improvement_decisions")
      .select("id,summary,reason,created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  if (queueRes.error) {
    return NextResponse.json({ ok: false, error: queueRes.error.message }, { status: 500 });
  }
  // Decisions are optional layer; tolerate lagging migrations.
  const decisions = queueRes.error ? [] : (decisionsRes.data ?? []).map((row) => ({
    id: row.id as string,
    summary: row.summary as string | null,
    reason: row.reason as string | null,
    createdAt: row.created_at as string,
  }));

  const ordered = orderQueueForFounder(
    (queueRes.data ?? []).map((row): QueueItem => ({
      id: row.id,
      prospectKey: row.prospect_key,
      toAddress: row.to_address,
      subject: row.subject,
      bodyText: row.body_text,
      status: row.status,
      createdAt: row.created_at,
      approvedBy: row.approved_by ?? null,
      sentAt: row.sent_at ?? null,
      rejectedReason: row.rejected_reason ?? null,
      payload: (row.payload ?? {}) as QueueItem["payload"],
    })),
  );
  const drafts = ordered.filter((item) => item.status === "draft");
  const approvedRows = ordered.filter((item) => item.status === "approved");
  const { receipts, hiddenCount } = takeReceipts(ordered);

  const brief = await buildBriefSafe();

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    drafts,
    approvedCount: approvedRows.length,
    receipts,
    receiptsHidden: hiddenCount,
    decisions,
    brief,
  });
}

type Verdict = { id?: string; action?: "approve" | "reject"; reason?: string };

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  let body: { verdicts?: Verdict[] };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const verdicts = Array.isArray(body.verdicts) ? body.verdicts.slice(0, 100) : [];
  if (!verdicts.length) {
    return NextResponse.json({ ok: false, error: "No verdicts supplied." }, { status: 400 });
  }

  const approver = session.email ?? session.name ?? "admin";
  const results: Array<{ id: string; action: string; ok: boolean; detail?: string }> = [];
  for (const verdict of verdicts) {
    const id = typeof verdict.id === "string" ? verdict.id : "";
    if (!id) continue;
    try {
      if (verdict.action === "approve") {
        await approveSend(id, approver);
        results.push({ id, action: "approve", ok: true });
      } else if (verdict.action === "reject") {
        await rejectSend(id, verdict.reason?.trim() || "Rejected from the deck");
        results.push({ id, action: "reject", ok: true });
      } else {
        results.push({ id, action: String(verdict.action), ok: false, detail: "unsupported action" });
      }
    } catch (error) {
      results.push({
        id,
        action: String(verdict.action),
        ok: false,
        detail: error instanceof Error ? error.message : "gate failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    applied: results.filter((r) => r.ok).length,
    results,
  });
}

async function buildBriefSafe() {
  try {
    const dealBook = await computeDealBook();
    const { readFunnelSlices } = await import("@/lib/harness/outcomes");
    const slices = await readFunnelSlices();
    return {
      dealBook,
      funnels: slices.filter((slice) => slice.sliceKey === "_all"),
    };
  } catch (error) {
    return {
      dealBook: null,
      funnels: [],
      error: error instanceof Error ? error.message : "brief unavailable",
    };
  }
}

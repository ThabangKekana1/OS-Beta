/**
 * Sales harness console API (admin only).
 *
 * GET  → the Monday view: pipeline summary, top-ranked unqueued leads, the
 *        send queue by status, and the term-sheet-gated deal book.
 * POST → { action: "generate", count } assembles first-touch drafts for the
 *        top unqueued book rows. Drafts only; nothing sends from here.
 */
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { computeDealBook } from "@/lib/harness/dealbook";
import { queueSendDraft, type SendQueueStatus } from "@/lib/harness/gate";
import { buildFirstTouchDraft } from "@/lib/harness/outreach";
import { activePlaybookStamp } from "@/lib/harness/reflect";
import { searchSalesBook } from "@/lib/harness/tools";

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

  const [queueRes] = await Promise.all([
    admin
      .from("foundation1_send_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (queueRes.error) {
    return NextResponse.json({ ok: false, error: queueRes.error.message }, { status: 500 });
  }

  const queuedProspects = new Set((queueRes.data ?? []).map((row) => row.prospect_key as string));
  const leads = await searchSalesBook({ limit: 12 });
  const openLeads = leads.filter((lead) => !queuedProspects.has(lead.bookId));

  const [pipeline, dealBook] = await Promise.all([
    readPipelineSafe(),
    computeDealBookSafe(),
  ]);

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    pipeline,
    leads: openLeads,
    queue: (queueRes.data ?? []).map((row) => ({
      id: row.id,
      prospectKey: row.prospect_key,
      toAddress: row.to_address,
      subject: row.subject,
      bodyText: row.body_text,
      status: row.status as SendQueueStatus,
      approvedBy: row.approved_by,
      sentAt: row.sent_at,
      rejectedReason: row.rejected_reason,
      createdAt: row.created_at,
      templateKey: row.template_key,
      payload: row.payload ?? {},
    })),
    dealBook,
  });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  let body: { action?: string; count?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (body.action !== "generate") {
    return NextResponse.json({ ok: false, error: "Unsupported action." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Store unavailable." }, { status: 503 });
  }
  const existing = await admin.from("foundation1_send_queue").select("prospect_key");
  if (existing.error) {
    return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 });
  }
  const queued = new Set((existing.data ?? []).map((row) => row.prospect_key as string));

  const wanted = Math.min(Math.max(body.count ?? 10, 1), 20);
  const all = await searchSalesBook({ limit: 200 });
  const targets = all.filter((lead) => !queued.has(lead.bookId));

  // Every draft carries the playbook versions that shaped it, so each version
  // can be scored against its own outcomes later (lib/harness/reflect).
  const stamp = await activePlaybookStamp("sales-harness").catch(() => ({}));

  let created = 0;
  for (const lead of targets) {
    if (created >= wanted) break;
    const draft = buildFirstTouchDraft(lead);
    if (!draft) continue;
    await queueSendDraft({
      ...draft,
      payload: { ...(draft.payload ?? {}), playbook: stamp },
    });
    created += 1;
  }
  return NextResponse.json({ ok: true, created });
}

async function readPipelineSafe() {
  try {
    const { readPipelineSummary } = await import("@/lib/harness/tools");
    return await readPipelineSummary();
  } catch {
    return { stageCounts: [] as Array<{ stage: string; count: number }>, totalCases: 0 };
  }
}

async function computeDealBookSafe() {
  try {
    return await computeDealBook();
  } catch (error) {
    return {
      gatedValueZar: 0,
      gatedCount: 0,
      weightedPipelineZar: 0,
      goalZar: 100_000_000,
      asOf: new Date().toISOString(),
      error: error instanceof Error ? error.message : "deal book unavailable",
    };
  }
}

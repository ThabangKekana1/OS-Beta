/**
 * HARNESS — MI's founder-facing toolset (doc 21, man-machine protocol).
 *
 * The founder converses; MI acts through these tools and nothing else.
 * Same iron rule as every agent surface: reads are free, writes go through
 * the approval gate. "Kill sends" is a founder verdict relayed by MI —
 * implemented as gate rejections with an audit reason, not a bypass.
 */
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { HarnessToolMap } from "./tools";
import { computeDealBook } from "./dealbook";
import { buildConversionInsights, readFunnelSlices, FUNNEL_STAGES } from "./outcomes";
import { queueSendDraft } from "./gate";
import { appendDeckMessage } from "./voice";
import { draftFirstTouchWithModel } from "./outreach";
import { searchProspects, searchSalesBook, readPipelineSummary } from "./tools";
import { scoreLead } from "./score";

export const MI_AGENT = "mi";

export function miSystemPrompt(): string {
  return [
    "You are MI, Foundation-1's chief-of-staff agent inside 1-MI. You serve ONE founder (Karman).",
    "Mission: a R100 million term-sheet-gated deal book. You prepare everything; he decides in seconds.",
    "",
    "How you behave:",
    "- Answer fast and short. Lead with the number or the action.",
    "- Real data only, from your tools. Never invent figures, names or stages. If you don't know, say so and fetch.",
    "- You may propose at most one next action per reply. He approves drafts in the Today queue; when he says do it, batch the drafts via the tool so they land there.",
    "- He can kill work verbally ('kill pending sends'). Relay it through act.killPendingSends - rejections carry his authority as the reason.",
    "- When he asks for more outreach - 'new batch', 'more leads', 'fill the queue', 'add targets' - that is act.queueDraftBatch with {count}. It drafts from the named-lead book under the guard and the drafts land on his Today stack for approval. Never say you cannot source targets: the book holds hundreds. Call the tool, then report the queued count and the sectors it drew from.",
    "- You keep the plan via act.setPlan whenever strategy shifts; it renders on the Deck until replaced.",
    "- When he changes the pitch, rewrite the work already in front of him: act.redraftQueue with {all:true}",
    "  rewrites every pending draft against the current template, or {match:'astral'} rewrites one company's",
    "  draft. Never tell him you cannot change a draft: redraft it and show him the new one.",
    "- Speak like a chief of staff, not a chatbot: status, risk, ask. No filler, no apologies, no em dashes.",
    "- When he asks a question, ANSWER it in the reply with the actual names and numbers your tools returned.",
    "- 'Check Today' or a pointer to a surface is only a valid reply when you actually queued or changed something there.",
    "",
    "Reply with ONE JSON object: {\"done\":false,\"calls\":[{\"tool\":\"<name>\",\"input\":{}}]} to act,",
    "or {\"done\":true,\"reply\":\"<your answer>\"} to speak.",
  ].join("\n");
}

type FounderToolName =
  | "read.status"
  | "read.brief"
  | "read.book"
  | "read.queue"
  | "act.queueDraftBatch"
  | "act.redraftQueue"
  | "act.killPendingSends"
  | "act.setPlan";

export async function killPendingSends(input: { reason?: string }): Promise<{ killed: number }> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin configuration is unavailable.");
  const reason = input.reason?.trim() || "killed by founder via MI";
  const { data, error } = await admin
    .from("foundation1_send_queue")
    .update({ status: "rejected", rejected_reason: reason, rejected_at: new Date().toISOString() })
    .in("status", ["draft", "approved"])
    .select("id");
  if (error) throw new Error(error.message);
  return { killed: (data ?? []).length };
}

async function setPlan(input: { plan: string }): Promise<{ plan: string }> {
  await appendDeckMessage("harness", `PLAN UPDATED\n${input.plan}`, { kind: "plan" });
  await appendMemoryPlan(input.plan);
  return { plan: input.plan };
}

async function appendMemoryPlan(plan: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin configuration is unavailable.");
  await admin.from("foundation1_agent_memory").insert({
    agent: MI_AGENT,
    kind: "plan",
    scope_key: "deck",
    content: { plan },
  });
}

export async function currentPlan(): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("foundation1_agent_memory")
    .select("content,created_at")
    .eq("agent", MI_AGENT)
    .eq("kind", "plan")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return String(((data.content ?? {}) as Record<string, unknown>).plan ?? "");
}

/**
 * MI writes with the same rail the console uses: the named lead book first, and
 * the model drafter under the guard. The old hardcoded template here addressed
 * nobody by name, asked for six months of bills in a first touch and carried the
 * generic subject line the learned playbook had already rejected twice.
 */
export async function queueDraftBatchFromBook(sector: string, count: number): Promise<{ queued: number; guarded: number }> {
  const wanted = Math.min(Math.max(count, 1), 20);
  const admin = getSupabaseAdminClient();
  const existing = admin ? await admin.from("foundation1_send_queue").select("prospect_key") : { data: [] as Array<{ prospect_key: string }> };
  const already = new Set((existing.data ?? []).map((row) => row.prospect_key as string));
  const rows = await searchProspects({ limit: 200 });
  const pool = sector
    ? rows.filter((row) => `${row.sector} ${row.subSector ?? ""}`.toLowerCase().includes(sector.toLowerCase()))
    : rows;
  let queued = 0;
  let guarded = 0;
  for (const row of pool) {
    if (queued >= wanted) break;
    if (already.has(row.bookId)) continue;
    const draft = await draftFirstTouchWithModel(row, { timeoutMs: 45_000 }).catch(() => null);
    if (!draft) { guarded += 1; continue; }
    await queueSendDraft({ ...draft, payload: { ...(draft.payload ?? {}), via: "mi-chat" } });
    queued += 1;
  }
  return { queued, guarded };
}

/**
 * Rewrite work already in the queue against the CURRENT template. The founder
 * changes the pitch in conversation, and the batch in front of him has to be
 * able to change with it, without him approving anything he has not re-read.
 */
export async function redraftQueue(input: { match?: string; all?: boolean }): Promise<{ redrafted: number; skipped: number; failed: number }> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Store unavailable.");
  const { data, error } = await admin
    .from("foundation1_send_queue")
    .select("id,prospect_key,to_address,payload,status")
    .eq("status", "draft");
  if (error) throw new Error(error.message);
  const needle = (input.match ?? "").trim().toLowerCase();
  const rows = (data ?? []).filter((row) => {
    if (input.all || !needle) return true;
    const payload = (row.payload ?? {}) as { companyName?: string; contactName?: string };
    return `${row.to_address ?? ""} ${payload.companyName ?? ""} ${payload.contactName ?? ""}`.toLowerCase().includes(needle);
  });
  const book = await searchProspects({ limit: 500 });
  const byId = new Map(book.map((row) => [row.bookId, row]));
  let redrafted = 0, skipped = 0, failed = 0;
  for (const row of rows) {
    const lead = byId.get(row.prospect_key as string);
    if (!lead) { skipped += 1; continue; }
    const draft = await draftFirstTouchWithModel(lead, { timeoutMs: 45_000 }).catch(() => null);
    if (!draft) { failed += 1; continue; }
    const { error: updateError } = await admin
      .from("foundation1_send_queue")
      .update({ subject: draft.subject, body_text: draft.bodyText, body_html: draft.bodyHtml ?? null, payload: { ...(draft.payload ?? {}), via: "mi-redraft" } })
      .eq("id", row.id)
      .eq("status", "draft");
    if (updateError) { failed += 1; continue; }
    redrafted += 1;
  }
  return { redrafted, skipped, failed };
}

/** Read-only brief used by read.status/read.brief. */
export async function briefFacts(): Promise<string> {
  const [book, pipeline, funnels] = await Promise.all([
    computeDealBook(),
    readPipelineSummary().catch(() => ({ stageCounts: [], totalCases: 0 })),
    readFunnelSlices().catch(() => []),
  ]);
  const all = funnels.find((slice) => slice.sliceKey === "_all")?.counts
    ?? Object.fromEntries(FUNNEL_STAGES.map((stage) => [stage, 0]));
  const insights = await buildConversionInsights(funnels, [{ from: "sent", to: "reply" }, { from: "reply", to: "bills_in" }], 3);
  const lines = [
    `DEAL BOOK: R${(book.gatedValueZar / 1_000_000).toFixed(2)}m gated across ${book.gatedCount} deal(s); goal R100m.`,
    `Weighted pipeline (not counted): R${(book.weightedPipelineZar / 1_000_000).toFixed(2)}m.`,
    `PIPELINE: ${pipeline.totalCases} cases.`,
    `FUNNEL: sent ${all.sent ?? 0}, replied ${all.reply ?? 0}, bills-in ${all.bills_in ?? 0}, EOI ${all.eoi_signed ?? 0}, term sheets ${all.term_sheet ?? 0}.`,
  ];
  for (const insight of insights) lines.push(`RATE: ${insight.fact}`);
  return lines.join("\n");
}

/** Registry handed to runHarness when the founder speaks. */
type AsyncTool<I> = (input: I) => Promise<unknown>;

export function buildFounderTools(): HarnessToolMap {
  const tools: Record<string, AsyncTool<any>> = {
    "read.status": () => readStatus(),
    "read.brief": () => briefFacts().then((brief) => ({ brief })),
    "read.pipeline": () => readPipelineSummary(),
    "read.book": (input) => readBook((input ?? {}) as BookQuery),
    "read.queue": () => readQueue(),
    "act.queueDraftBatch": (input) => queueDraftBatchFromBook(String((input as { sector?: unknown })?.sector ?? ""), Number((input as { count?: unknown })?.count ?? 20)),
    "act.redraftQueue": (input) => redraftQueue((input ?? {}) as { match?: string; all?: boolean }),
    "act.killPendingSends": (input) => killPendingSends((input ?? {}) as { reason?: string }),
    "act.setPlan": (input) => setPlan((input ?? {}) as { plan: string }),
  };
  return tools;
}

type BookQuery = { query?: string; sector?: string };

async function readStatus() {
  return { brief: await briefFacts(), plan: await currentPlan() };
}

async function readBook(input: BookQuery) {
  const admin = getSupabaseAdminClient();
  const rows = await searchSalesBook({ query: input.query ?? "", sector: input.sector, limit: 8 });
  // The agent must know the size of its world, not just the slice it can see.
  let totalInBook: number | null = null;
  let matching: number | null = null;
  if (admin) {
    const all = await admin
      .from("foundation1_sales_book")
      .select("book_id", { count: "exact", head: true });
    totalInBook = all.count ?? null;
    if (input.sector) {
      const sectorCount = await admin
        .from("foundation1_sales_book")
        .select("book_id", { count: "exact", head: true })
        .eq("sector", input.sector);
      matching = sectorCount.count ?? null;
    }
  }
  return {
    totalInBook,
    matchingFilter: matching,
    showing: rows.length,
    note: "showing the top-ranked slice only; totalInBook is the full book size",
    rows,
  };
}

async function readQueue() {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Store unavailable.");
  const { data, error } = await admin
    .from("foundation1_send_queue")
    .select("prospect_key,status,payload,created_at")
    .in("status", ["draft", "approved"])
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  // Rejected and sent rows are not actionable, but the counts are context the
  // founder asks for, so the agent carries the whole picture.
  const { data: allStatuses } = await admin.from("foundation1_send_queue").select("status").limit(500);
  const counts: Record<string, number> = {};
  for (const row of allStatuses ?? []) {
    const status = row.status as string;
    counts[status] = (counts[status] ?? 0) + 1;
  }
  const actionable = (data ?? []).map((row) => ({
    prospectKey: row.prospect_key,
    company: ((row.payload ?? {}) as { companyName?: string }).companyName,
    sector: ((row.payload ?? {}) as { sector?: string }).sector,
    score: ((row.payload ?? {}) as { score?: number }).score,
    status: row.status,
  }));
  return { countsByStatus: counts, actionable };
}

export function founderToolNames(): FounderToolName[] {
  return ["read.status", "read.brief", "read.book", "read.queue", "act.queueDraftBatch", "act.redraftQueue", "act.killPendingSends", "act.setPlan"];
}

// Keep the scorer referenced for book ranking parity with the deck lead list.
void scoreLead;

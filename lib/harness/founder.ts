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
import { searchSalesBook, readPipelineSummary } from "./tools";
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
    "- You keep the plan via act.setPlan whenever strategy shifts; it renders on the Deck until replaced.",
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

export async function queueDraftBatchFromBook(sector: string, count: number): Promise<{ queued: number }> {
  const rows = await searchSalesBook({ sector: sector || undefined, limit: Math.min(Math.max(count, 1), 20) * 3 });
  const withAddress = rows.filter((row) => row.contactChannel?.includes("@"));
  let queued = 0;
  for (const row of withAddress) {
    if (queued >= count) break;
    const fitLine = row.scaleSignal ?? row.electricityRationale ?? "";
    const body = [
      "Good day,", "",
      `${fitLine.slice(0, 220)}.`,
      "",
      "Foundation-1 helps South African agribusinesses cut electricity costs through funded solar-and-storage or wheeled clean energy: no capital outlay, you buy only the energy you use.",
      "",
      "The first step is a free forensic bill audit: send six months of utility bills and we return what you actually pay per unit, reconciled to the cent, and what two migration pathways would change.",
      "",
      "Worth a look for your site?", "", "Karman Kekana", "Foundation-1",
    ].join("\n");
    // Extract first email address only; POPIA business-channels rule.
    const email = row.contactChannel?.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
    if (!email) continue;
    await queueSendDraft({
      agent: "sales-harness",
      prospectKey: row.bookId,
      templateKey: "direct_first_touch_v2_mi",
      toAddress: email,
      subject: `${row.companyName}: zero-capex energy migration worth a look?`,
      bodyText: body,
      payload: {
        bookId: row.bookId,
        sector: row.sector,
        companyName: row.companyName,
        score: row.score,
        scoreReasons: row.reasons,
        via: "mi-chat",
      },
    });
    queued += 1;
  }
  return { queued };
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
    "act.queueDraftBatch": (input) => queueDraftBatchFromBook(String((input as { sector?: unknown })?.sector ?? ""), Number((input as { count?: unknown })?.count ?? 10)),
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
  return searchSalesBook({ query: input.query ?? "", sector: input.sector, limit: 8 });
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
  return (data ?? []).map((row) => ({
    prospectKey: row.prospect_key,
    company: ((row.payload ?? {}) as { companyName?: string }).companyName,
    sector: ((row.payload ?? {}) as { sector?: string }).sector,
    score: ((row.payload ?? {}) as { score?: number }).score,
    status: row.status,
  }));
}

export function founderToolNames(): FounderToolName[] {
  return ["read.status", "read.brief", "read.book", "read.queue", "act.queueDraftBatch", "act.killPendingSends", "act.setPlan"];
}

// Keep the scorer referenced for book ranking parity with the deck lead list.
void scoreLead;

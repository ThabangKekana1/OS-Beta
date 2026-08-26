/**
 * HARNESS — the data-only tool registry (doc 20 invariant: tools can never
 * send). Two namespaces only:
 *   read.*  pure reads over platform data the agent is working on
 *   queue.* writes that go through the approval gate as drafts
 * Anything else — sends, mutation of cases, deletion — simply does not exist
 * here, so an agent cannot call what is not registered.
 */
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { queueSendDraft, type SendQueueDraftInput } from "./gate";
import { scoreLead } from "./score";

export type ToolDefinition = {
  name: string;
  description: string;
};

export type ToolHandler<I = unknown> = (input: I) => Promise<unknown>;

export type HarnessToolMap = Record<string, ToolHandler>;

export const HARNESS_TOOLS: ToolDefinition[] = [
  { name: "read.salesBook", description: "Search the ranked direct book by sector/town/name; returns scored lead rows with their inputs." },
  { name: "read.pipeline", description: "Summarise migration case pipeline stages and next actions." },
  { name: "queue.outreachDraft", description: "Queue a personalised outreach EMAIL DRAFT for founder approval. Nothing is sent." },
];

function client() {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin configuration is unavailable.");
  return admin;
}

// --- read.salesBook ---------------------------------------------------------

export type BookRowScored = {
  bookId: string;
  companyName: string;
  sector: string;
  subSector: string | null;
  siteType: string | null;
  province: string | null;
  town: string | null;
  scaleSignal: string | null;
  electricityRationale: string | null;
  estSpendBand: string | null;
  contactChannel: string | null;
  verification: string | null;
  status: string;
  score: number;
  reasons: string[];
};

export async function searchSalesBook(input: {
  sector?: string | null;
  query?: string | null;
  limit?: number;
}): Promise<BookRowScored[]> {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
  let query = client()
    .from("foundation1_sales_book")
    .select("*")
    .neq("status", "suppressed")
    .limit(limit * 4);

  if (input.sector) query = query.eq("sector", input.sector);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const needle = input.query?.trim().toLowerCase();
  const rows = (data ?? [])
    .filter((row) =>
      !needle
      || String(row.company_name ?? "").toLowerCase().includes(needle)
      || String(row.town ?? "").toLowerCase().includes(needle)
      || String(row.sub_sector ?? "").toLowerCase().includes(needle))
    .map((row): BookRowScored => {
      const scored = scoreLead({
        sector: row.sector,
        estSpendBand: row.est_spend_band,
        contactChannel: row.contact_channel,
        website: row.website,
        verification: row.verification,
      });
      return {
        bookId: row.book_id,
        companyName: row.company_name,
        sector: row.sector,
        subSector: row.sub_sector,
        siteType: row.site_type,
        province: row.province,
        town: row.town,
        scaleSignal: row.scale_signal,
        electricityRationale: row.electricity_rationale,
        estSpendBand: row.est_spend_band,
        contactChannel: row.contact_channel,
        verification: row.verification,
        status: row.status,
        score: scored.score,
        reasons: scored.breakdown.reasons,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return rows;
}

// --- read.pipeline ----------------------------------------------------------

export type PipelineSummary = {
  stageCounts: Array<{ stage: string; count: number }>;
  totalCases: number;
};

export async function readPipelineSummary(): Promise<PipelineSummary> {
  const { data, error } = await client()
    .from("migration_cases")
    .select("stage", { count: "exact" })
    .order("stage");
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.stage as string, (counts.get(row.stage as string) ?? 0) + 1);
  }
  return {
    stageCounts: [...counts.entries()].map(([stage, count]) => ({ stage, count })),
    totalCases: data?.length ?? 0,
  };
}

// --- queue.outreachDraft ----------------------------------------------------

/** The only write exposed. It lands in the send queue as a DRAFT. */
export async function queueOutreachDraftTool(input: unknown): Promise<{ queued: true; status: "draft" }> {
  const draft = input as SendQueueDraftInput;
  await queueSendDraft({
    agent: typeof draft.agent === "string" && draft.agent.trim() ? draft.agent : "sales-harness",
    prospectKey: String(draft.prospectKey ?? ""),
    templateKey: draft.templateKey ?? null,
    toAddress: draft.toAddress ?? null,
    subject: String(draft.subject ?? ""),
    bodyText: String(draft.bodyText ?? ""),
    bodyHtml: draft.bodyHtml ?? null,
    payload: draft.payload ?? {},
    channel: "email",
  });
  return { queued: true, status: "draft" };
}

// --- registry ---------------------------------------------------------------

export function buildSalesHarnessTools(): HarnessToolMap {
  return {
    "read.salesBook": (input) => searchSalesBook(input as Parameters<typeof searchSalesBook>[0]),
    "read.pipeline": () => readPipelineSummary(),
    "queue.outreachDraft": (input) => queueOutreachDraftTool(input),
  };
}

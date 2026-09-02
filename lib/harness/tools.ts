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
  /** Named decision maker, when the source carries one. Register rows do not. */
  contactFirstName?: string | null;
  contactSurname?: string | null;
  contactRole?: string | null;
  monthlySpendEstimateZar?: number | null;
  source?: "register" | "named";
};

export async function searchSalesBook(input: {
  sector?: string | null;
  query?: string | null;
  limit?: number;
}): Promise<BookRowScored[]> {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 200);
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

// --- read.namedLeads --------------------------------------------------------

/**
 * The named lead book. `oneos_admin_leads` carries a real decision maker per
 * row: first name, surname, job title and a personal work address, plus the
 * company, city, industry and a monthly electricity spend estimate. The
 * register book (`foundation1_sales_book`) carries none of that, which is why
 * every draft written from it could only ever address "the team". Outreach
 * reads this source first and falls back to the register only where no named
 * contact exists.
 *
 * Scope is the agribusiness value chain, per the founder's instruction: food,
 * beverage, agro-processing and food manufacturing, plus the immediately
 * adjacent cold storage and food packaging operations.
 */
const VALUE_CHAIN_CORE =
  /food|beverage|agro|farming|dairy|meat|winer|wine|brewer|poultry|milling|feed|fish|aqua|bakery|produce|fruit|grain|sugar|abattoir/i;
const VALUE_CHAIN_ADJACENT = /cold storage|packaging|containers|plastics\/packaging/i;
/** Primary industries that are never the client, whatever tags follow them. */
const VALUE_CHAIN_EXCLUDE =
  /machinery|metals|engineering|automotive|mining|chemicals|pharmaceutic|textile|apparel|electrical|electronic|consumer goods|real estate|construction|building materials|printing|paper|sporting|hospitality|consulting|financial|insurance|telecom|software/i;

/**
 * Industry tags on the imported book are noisy and multi valued, e.g.
 * "Machinery | agro-processing | metals/engineering" is a pump maker, not an
 * agribusiness. The FIRST segment is the operation's own primary industry, and
 * that is what the letter will describe, so the primary segment decides. A
 * later agri tag only means they sell into the chain.
 */
export function inAgriValueChain(industry: string | null | undefined): boolean {
  const value = (industry ?? "").trim();
  if (!value) return false;
  const primary = value.split("|")[0]!.trim();
  if (VALUE_CHAIN_EXCLUDE.test(primary)) return false;
  return VALUE_CHAIN_CORE.test(primary) || VALUE_CHAIN_ADJACENT.test(primary);
}

/** Foreign sites cannot be migrated onto a South African tariff. */
const SA_PROVINCES = /gauteng|western cape|kwazulu|eastern cape|northern cape|free state|mpumalanga|limpopo|north west|south africa/i;
const FOREIGN_CITY = /bjerringbro|london|amsterdam|dubai|nairobi|mumbai|shanghai|sydney|singapore|frankfurt|paris|madrid|lisbon|dublin|england/i;

export function isSouthAfricanSite(city: string | null, province: string | null): boolean {
  if (city && FOREIGN_CITY.test(city)) return false;
  if (!province) return true;
  return SA_PROVINCES.test(province);
}

function spendBandFor(estimate: number | null | undefined): string {
  const value = Number(estimate ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "unknown";
  if (value >= 250_000) return "250k+";
  if (value >= 50_000) return "50k-250k";
  if (value >= 10_000) return "10k-50k";
  return "unknown";
}

export async function searchNamedLeads(input: { limit?: number } = {}): Promise<BookRowScored[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 500);
  const rows: BookRowScored[] = [];
  const pageSize = 1000;

  for (let from = 0; from < 6000; from += pageSize) {
    const { data, error } = await client()
      .from("oneos_admin_leads")
      .select("id,company,contact_name,contact_email,priority,readiness_score,payload")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];

    for (const row of page) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const industry = typeof payload.industry === "string" ? payload.industry : null;
      if (!inAgriValueChain(industry)) continue;
      const cityRaw = String(payload.city ?? "").trim() || null;
      const provinceRaw = String(payload.province ?? "").trim() || null;
      if (!isSouthAfricanSite(cityRaw, provinceRaw)) continue;

      const email = String(row.contact_email ?? "").trim();
      if (!email.includes("@")) continue;

      const first = String(payload.contactFirstName ?? "").trim()
        || String(row.contact_name ?? "").trim().split(/\s+/)[0]
        || "";
      if (!first) continue;

      const surname = String(payload.contactSurname ?? "").trim() || null;
      const role = String(payload.contactPosition ?? "").trim() || null;
      const city = cityRaw;
      const province = provinceRaw;
      const spend = Number(payload.monthlyElectricitySpendEstimateZar ?? 0) || null;
      const band = spendBandFor(spend);

      const scored = scoreLead({
        sector: "other",
        estSpendBand: band,
        contactChannel: email,
        website: null,
        verification: "V",
      });

      rows.push({
        bookId: String(row.id),
        companyName: String(row.company ?? "").trim() || "your business",
        sector: industry ?? "agri value chain",
        subSector: industry,
        siteType: null,
        province,
        town: city,
        scaleSignal: role && city ? `${role} at ${String(row.company ?? "").trim()} in ${city}` : role,
        electricityRationale: spend
          ? `Recorded monthly electricity spend estimate of R${spend.toLocaleString("en-ZA")}`
          : null,
        estSpendBand: band,
        contactChannel: email,
        verification: "V",
        status: String(row.priority ?? "Standard"),
        score: scored.score + (row.priority === "Priority" ? 6 : 0),
        reasons: [
          ...scored.breakdown.reasons,
          "named decision maker on file",
          ...(row.priority === "Priority" ? ["marked priority on the dashboard"] : []),
        ],
        contactFirstName: first,
        contactSurname: surname,
        contactRole: role,
        monthlySpendEstimateZar: spend,
        source: "named",
      });
    }
    if (page.length < pageSize) break;
  }

  // One first touch per company. Two letters landing at the same business on the
  // same morning reads as a mailshot, which is exactly what this is not.
  const seenCompany = new Set<string>();
  const deduped: BookRowScored[] = [];
  for (const row of rows.sort((a, b) => b.score - a.score)) {
    const key = row.companyName.trim().toLowerCase();
    if (seenCompany.has(key)) continue;
    seenCompany.add(key);
    deduped.push(row);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

/**
 * One prospect stream for the outreach engine: named people first, register
 * rows only to fill the tail. Nothing addressed to "the team" goes out while a
 * named contact is still unworked.
 */
export async function searchProspects(input: { limit?: number } = {}): Promise<BookRowScored[]> {
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 500);
  const named = await searchNamedLeads({ limit }).catch(() => [] as BookRowScored[]);
  if (named.length >= limit) return named.slice(0, limit);
  const register = await searchSalesBook({ limit: limit - named.length }).catch(() => [] as BookRowScored[]);
  return [...named, ...register.map((row) => ({ ...row, source: "register" as const }))];
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

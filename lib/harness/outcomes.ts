/**
 * HARNESS — the outcome join (doc 20, Phase 4).
 *
 * The funnel is a join over foundation1_outcomes: sent → reply → bills_in →
 * assessment_out → meeting → eoi_signed → proposal_accepted → mandate_signed
 * → term_sheet. Weekly conversion rates per sector / template become the
 * facts the learning loop reasons over; they replace doc 06's planning
 * assumptions with measured reality. No model invents these numbers.
 */
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const FUNNEL_STAGES = [
  "sent",
  "reply",
  "bills_in",
  "assessment_out",
  "meeting",
  "eoi_signed",
  "proposal_accepted",
  "mandate_signed",
  "term_sheet",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export type FunnelSlice = {
  /** Grouping: template_key + prospect sector, or "_all". */
  sliceKey: string;
  counts: Record<FunnelStage, number>;
};

export type OutcomeInsight = {
  kind: "conversion";
  sliceKey: string;
  fact: string;
  /** Stage-pair conversion this fact measures. */
  measure: { from: FunnelStage; to: FunnelStage; rate: number; denominator: number };
};

export async function readFunnelSlices(sinceIso?: string): Promise<FunnelSlice[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin configuration is unavailable.");

  let query = admin
    .from("foundation1_outcomes")
    .select("event,prospect_key,meta,occurred_at")
    .order("occurred_at", { ascending: true })
    .limit(5000);
  if (sinceIso) query = query.gte("occurred_at", sinceIso);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return rollUpOutcomes(
    (data ?? []).map((row) => ({
      event: row.event as FunnelStage,
      prospectKey: String(row.prospect_key ?? "_"),
      sector: typeof ((row.meta ?? {}) as Record<string, unknown>).sector === "string"
        ? String(((row.meta ?? {}) as Record<string, unknown>).sector)
        : "unknown",
      templateKey: typeof ((row.meta ?? {}) as Record<string, unknown>).template_key === "string"
        ? String(((row.meta ?? {}) as Record<string, unknown>).template_key)
        : "unknown",
    })),
  );
}

export type OutcomeRowForRollup = {
  event: string;
  prospectKey: string;
  sector: string;
  templateKey: string;
};

/** Pure roll-up with cumulative reach: a prospect counts toward every stage they reached, so conversions are plain ratios. */
export function rollUpOutcomes(rows: OutcomeRowForRollup[]): FunnelSlice[] {
  const best = new Map<string, { stageIndex: number; slice: string }>();
  for (const row of rows) {
    const stageIndex = FUNNEL_STAGES.indexOf(row.event as FunnelStage);
    if (stageIndex < 0) continue;
    const slice = `${row.templateKey}/${row.sector}`;
    const key = row.prospectKey;
    const current = best.get(key);
    if (!current || stageIndex > current.stageIndex) {
      best.set(key, { stageIndex, slice });
    }
  }

  const slices = new Map<string, FunnelSlice>();
  const ensure = (sliceKey: string): FunnelSlice => {
    let slice = slices.get(sliceKey);
    if (!slice) {
      slice = {
        sliceKey,
        counts: FUNNEL_STAGES.reduce((acc, stage) => ({ ...acc, [stage]: 0 }), {} as Record<FunnelStage, number>),
      };
      slices.set(sliceKey, slice);
    }
    return slice;
  };
  ensure("_all");

  for (const entry of best.values()) {
    // Cumulative: reaching eoi_signed also means reaching sent, reply, etc.
    for (let index = 0; index <= entry.stageIndex; index += 1) {
      const stage = FUNNEL_STAGES[index];
      ensure("_all").counts[stage] += 1;
      ensure(entry.slice).counts[stage] += 1;
    }
  }
  return [...slices.values()];
}

export async function buildConversionInsights(
  slices: FunnelSlice[],
  pairs: Array<{ from: FunnelStage; to: FunnelStage }> = [
    { from: "sent", to: "reply" },
    { from: "reply", to: "bills_in" },
    { from: "bills_in", to: "eoi_signed" },
    { from: "eoi_signed", to: "term_sheet" },
  ],
  minDenominator = 5,
): Promise<OutcomeInsight[]> {
  const insights: OutcomeInsight[] = [];
  for (const slice of slices) {
    for (const pair of pairs) {
      const denominator = slice.counts[pair.from];
      if (denominator < minDenominator) continue;
      const rate = denominator === 0 ? 0 : slice.counts[pair.to] / denominator;
      insights.push({
        kind: "conversion",
        sliceKey: slice.sliceKey,
        fact:
          `${slice.sliceKey}: ${slice.counts[pair.to]}/${denominator} prospects converted `
          + `${pair.from} → ${pair.to} (${(rate * 100).toFixed(0)}%).`,
        measure: { from: pair.from, to: pair.to, rate, denominator },
      });
    }
  }
  return insights;
}

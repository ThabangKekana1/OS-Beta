/**
 * HARNESS — the R100m deal-book maths (doc 06 definition, honest by construction).
 *
 * A deal counts ONLY at term sheet: Eden/Nightshade turnkey capex incl VAT,
 * or Awaken contracted value at F1 wheeling term sheet. Everything earlier is
 * weighted pipeline, tracked separately and never counted toward the goal.
 */
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/** A proposal without its term sheet is worth a conservative fraction of itself. */
export const WEIGHTED_PIPELINE_FACTOR = 0.15;

export type DealBookSnapshot = {
  gatedValueZar: number;
  gatedCount: number;
  weightedPipelineZar: number;
  goalZar: number;
  asOf: string;
};

export async function computeDealBook(goalZar = 100_000_000): Promise<DealBookSnapshot> {
  const admin = getSupabaseAdminClient();
  const empty = (): DealBookSnapshot => ({
    gatedValueZar: 0,
    gatedCount: 0,
    weightedPipelineZar: 0,
    goalZar,
    asOf: new Date().toISOString(),
  });
  if (!admin) return empty();

  const [proposalsRes, sheetsRes] = await Promise.all([
    admin
      .from("migration_case_proposals")
      .select("case_id,turnkey_capex_zar,capex_total_zar,payload")
      .not("case_id", "is", null),
    admin.from("migration_case_term_sheets").select("case_id,status"),
  ]);
  if (proposalsRes.error || sheetsRes.error) {
    throw new Error(proposalsRes.error?.message ?? sheetsRes.error?.message ?? "Deal book query failed.");
  }

  const sheetedCases = new Set<string>((sheetsRes.data ?? []).map((row) => String(row.case_id)));

  const capexOf = (row: Record<string, unknown>): number => {
    for (const candidate of [row.turnkey_capex_zar, row.capex_total_zar]) {
      if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    }
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    if (typeof payload.turnkeyCapexZar === "number") return payload.turnkeyCapexZar;
    return 0;
  };

  let gatedValueZar = 0;
  let gatedCount = 0;
  let weightedPipelineZar = 0;
  for (const row of proposalsRes.data ?? []) {
    const capex = capexOf(row as Record<string, unknown>);
    if (!capex) continue;
    if (sheetedCases.has(String(row.case_id))) {
      gatedValueZar += capex;
      gatedCount += 1;
    } else {
      weightedPipelineZar += capex * WEIGHTED_PIPELINE_FACTOR;
    }
  }

  return {
    gatedValueZar,
    gatedCount,
    weightedPipelineZar,
    goalZar,
    asOf: new Date().toISOString(),
  };
}

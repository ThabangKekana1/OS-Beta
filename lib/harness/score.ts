/**
 * HARNESS — deterministic scoring v0 (doc 20 invariant #4).
 *
 * Every score is a weighted blend of named inputs and the full breakdown is
 * persisted beside the number. A score that cannot show its inputs is treated
 * as fabricated. Model-judged adjustments arrive only through Phase 4
 * calibration; v0 is deliberately explainable arithmetic.
 *
 * Lead score   = fit × reachability × timing (0..100)
 * Deal health  = stage velocity + evidence completeness + engagement (0..100)
 * Message score = observed conversion performance per template (starts uniform,
 *                 updated weekly from foundation1_outcomes — Phase 4).
 */
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const SCORER_VERSION = "harness-v0.1";

/** Doc 15 locked sectors lead the book until measured rates say otherwise. */
const SECTOR_FIT: Record<string, number> = {
  poultry: 1.0,
  dairy: 0.9,
  milling: 0.8,
  feed: 0.7,
  other: 0.4,
};

/** Bigger, more continuous loads clear the programme minimums more safely. */
const SPEND_BAND_WEIGHTS: Record<string, number> = {
  "250k+": 1.0,
  "50k-250k": 0.8,
  "10k-50k": 0.5,
  unknown: 0.25,
};

export type BookRowLike = {
  bookId?: string;
  sector: string;
  estSpendBand?: string | null;
  contactChannel?: string | null;
  website?: string | null;
  verification?: string | null;
};

export type ScoreBreakdown = {
  fit: number;
  reachability: number;
  timing: number;
  weights: Record<string, number>;
  reasons: string[];
};

export type ScoredLead = {
  score: number;
  breakdown: ScoreBreakdown;
  scorerVersion: string;
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

/**
 * Fit: locked-sector priority. Reachability: can we lawfully make first
 * contact (business channels only, per POPIA rule)? Timing: spend-band proxy
 * for how fast a qualifying load can surface.
 */
export function scoreLead(row: BookRowLike): ScoredLead {
  const sectorKey = row.sector in SECTOR_FIT ? row.sector : "other";
  const fit = SECTOR_FIT[sectorKey];

  const hasChannel = Boolean(row.contactChannel?.trim());
  const hasWebsite = Boolean(row.website?.trim());
  const reachabilityBase = hasChannel ? 0.9 : hasWebsite ? 0.55 : 0.2;
  const verificationBonus = row.verification === "V" ? 0.1 : 0;
  const reachability = clamp01(reachabilityBase + verificationBonus);

  const band = row.estSpendBand ?? "unknown";
  const timing = SPEND_BAND_WEIGHTS[band] ?? SPEND_BAND_WEIGHTS.unknown;

  const score = Math.round(100 * (0.45 * fit + 0.3 * reachability + 0.25 * timing));

  return {
    score,
    breakdown: {
      fit,
      reachability,
      timing,
      weights: { fit: 0.45, reachability: 0.3, timing: 0.25 },
      reasons: [
        `sector ${sectorKey} (locked priority list)`,
        reachability >= 0.9 ? "direct business contact channel on file" : "contact channel unverified",
        `${band} R/month spend band`,
        row.verification === "V" ? "[V] verified source" : "[I] inferred source",
      ],
    },
    scorerVersion: SCORER_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Deal health — pure function over a typed case summary.
// ---------------------------------------------------------------------------

export type CaseHealthInput = {
  stage: string;
  /** ISO timestamp of the last stage promotion. */
  stageChangedAt: string;
  nowIso: string;
  /** Number of utility billing periods received out of the required six. */
  billsReceived: number;
  billsRequired: number;
  eoiSigned: boolean;
  daysSinceLastClientEngagement: number | null;
};

export type HealthBreakdown = {
  velocity: number;
  evidence: number;
  engagement: number;
  staleDays: number;
  reasons: string[];
};

export type ScoredHealth = {
  score: number;
  breakdown: HealthBreakdown;
  scorerVersion: string;
};

/** Doc 15 cadence: a healthy stage turn is inside two weeks. */
const HEALTHY_STAGE_DAYS = 14;

export function scoreDealHealth(input: CaseHealthInput): ScoredHealth {
  const ageMs = Date.parse(input.nowIso) - Date.parse(input.stageChangedAt);
  if (!Number.isFinite(ageMs)) throw new Error("Deal health needs valid timestamps.");
  const staleDays = Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)));

  const velocity = clamp01(1 - staleDays / (HEALTHY_STAGE_DAYS * 2));
  const evidence = input.billsRequired > 0
    ? clamp01((input.billsReceived / input.billsRequired) * (input.eoiSigned ? 1 : 0.7))
    : 0.5;
  const engagement = input.daysSinceLastClientEngagement === null
    ? 0.5
    : clamp01(1 - input.daysSinceLastClientEngagement / 30);

  const score = Math.round(100 * (0.35 * velocity + 0.4 * evidence + 0.25 * engagement));

  return {
    score,
    breakdown: {
      velocity,
      evidence,
      engagement,
      staleDays,
      reasons: [
        `${staleDays} day(s) in ${input.stage}`,
        `${input.billsReceived}/${input.billsRequired} billing periods`,
        input.eoiSigned ? "EOI signed" : "EOI outstanding",
        input.daysSinceLastClientEngagement === null
          ? "no client engagement recorded"
          : `last client touch ${input.daysSinceLastClientEngagement} day(s) ago`,
      ],
    },
    scorerVersion: SCORER_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Persistence. Degrades silently in non-production when Supabase is unset.
// ---------------------------------------------------------------------------

async function persistScore(entityType: "lead" | "case" | "message", entityId: string, scoreKind: string, scored: { score: number; breakdown: object; scorerVersion: string }) {
  const admin = getSupabaseAdminClient();
  if (!admin) return { persisted: false };
  const { error } = await admin.from("foundation1_scores").insert({
    entity_type: entityType,
    entity_id: entityId,
    score_kind: scoreKind,
    score: scored.score,
    breakdown: scored.breakdown as Record<string, unknown>,
    scorer_version: scored.scorerVersion,
  });
  if (error) throw new Error(error.message);
  return { persisted: true };
}

export function persistLeadScore(bookId: string, scored: ScoredLead) {
  return persistScore("lead", bookId, "lead_score", scored);
}

export function persistCaseHealth(caseId: string, scored: ScoredHealth) {
  return persistScore("case", caseId, "deal_health", scored);
}

import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * The conversion funnel, computed from named events.
 *
 * Before funnel_events existed the platform could not answer "how many saw a
 * report and never opened a case" — behaviour telemetry held generic clicks and
 * scrolls, and the case tables only knew about people who had already
 * converted. The drop-off happened where nothing was looking.
 */

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  /** Conversion from the previous step, 0-1. Null for the first step. */
  conversion: number | null;
};

export type FunnelSummary = {
  days: number;
  steps: FunnelStep[];
  belowThreshold: number;
  capturedEmails: number;
  generatedAt: string;
};

const STEPS: { key: string; label: string }[] = [
  { key: "report_generated", label: "Reports generated" },
  { key: "case_opened", label: "Cases opened" },
  { key: "bills_added", label: "Started uploading bills" },
  { key: "bill_pack_audited", label: "Bill packs audited" },
  { key: "proposal_ready", label: "Proposals completed" },
  { key: "eoi_signed", label: "EOIs signed" },
];

export async function readFunnelSummary(days = 30): Promise<FunnelSummary | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("funnel_events")
    .select("event, email_normalised")
    .gte("created_at", since)
    .limit(20_000);
  if (error) return null;

  const rows = (data ?? []) as { event: string; email_normalised: string | null }[];

  // Count distinct businesses per step where we can identify them, so a client
  // who uploads bills four times counts once.
  const byStep = new Map<string, Set<string>>();
  let anonymousReports = 0;
  for (const row of rows) {
    if (!byStep.has(row.event)) byStep.set(row.event, new Set());
    if (row.email_normalised) {
      byStep.get(row.event)!.add(row.email_normalised);
    } else if (row.event === "report_generated") {
      anonymousReports += 1;
    }
  }

  const steps: FunnelStep[] = STEPS.map((step, index) => {
    const identified = byStep.get(step.key)?.size ?? 0;
    const count = step.key === "report_generated" ? identified + anonymousReports : identified;
    return { key: step.key, label: step.label, count, conversion: index === 0 ? null : 0 };
  });

  for (let index = 1; index < steps.length; index += 1) {
    const previous = steps[index - 1].count;
    steps[index].conversion = previous > 0 ? steps[index].count / previous : null;
  }

  const { count: belowThreshold } = await supabase
    .from("report_captures")
    .select("id", { count: "exact", head: true })
    .eq("below_threshold", true)
    .gte("created_at", since);

  const { count: capturedEmails } = await supabase
    .from("report_captures")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  return {
    days,
    steps,
    belowThreshold: belowThreshold ?? 0,
    capturedEmails: capturedEmails ?? 0,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * HARNESS — the reflection pass (recursive self-improvement, doc 20 + doc 19).
 *
 * The loop, closed:
 *   OBSERVE   every send, approval, rejection, reply and client reaction lands
 *             in the platform as evidence.
 *   REFLECT   this module reads that evidence and asks the model what the agent
 *             should do differently, in the agent's own playbook vocabulary.
 *   REWRITE   accepted proposals become the next playbook version, which every
 *             later run loads automatically. Yesterday changes tomorrow.
 *   MEASURE   each version carries its own outcomes, so a version that performs
 *             worse than its predecessor is flagged for retirement.
 *
 * The founder stays sovereign: every self-change is inspectable with its reason
 * and evidence, and revertible in one action. Nothing here can send anything.
 */
import { completeChat, parseJsonObject } from "@/lib/model/client";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { applyPlaybookUpdate, loadPlaybook, type PlaybookEntry } from "./memory";

export type ReflectAgent = "sales-harness" | "dawn";

/** Bounded vocabulary: the agent may only rewrite these parts of itself. */
export const REFLECT_PLAYBOOK_KEYS: Record<ReflectAgent, readonly string[]> = {
  "sales-harness": [
    "first_touch_opening",
    "subject_line",
    "evidence_use",
    "call_to_action",
    "sector_language",
    "follow_up_timing",
  ],
  dawn: [
    "tone",
    "objection_handling",
    "explaining_savings",
    "next_step_framing",
    "trust_building",
    "capability_matching",
  ],
};

const MAX_PROPOSALS_PER_PASS = 2;

function client() {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin configuration is unavailable.");
  return admin;
}

export type ReflectionEvidence = {
  label: string;
  detail: string;
  weight: "high" | "normal";
};

/**
 * Founder rejections are the highest-signal teacher in the system: his own
 * words about why something was not good enough.
 */
async function salesEvidence(): Promise<ReflectionEvidence[]> {
  const admin = client();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const evidence: ReflectionEvidence[] = [];

  const { data: queue } = await admin
    .from("foundation1_send_queue")
    .select("status,subject,body_text,rejected_reason,prospect_key,created_at,sent_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(120);

  for (const row of queue ?? []) {
    const status = row.status as string;
    if (status === "rejected" && row.rejected_reason) {
      evidence.push({
        label: "Founder rejected a draft",
        detail: `Subject "${row.subject}" rejected because: ${row.rejected_reason}`,
        weight: "high",
      });
    }
    if (status === "approved" || status === "sent") {
      evidence.push({
        label: "Founder approved a draft",
        detail: `Subject "${row.subject}" passed his review.`,
        weight: "normal",
      });
    }
  }

  const { data: outcomes } = await admin
    .from("foundation1_outcomes")
    .select("event,prospect_key,occurred_at,meta")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(120);
  for (const row of outcomes ?? []) {
    evidence.push({
      label: `Outcome: ${row.event}`,
      detail: `Prospect ${row.prospect_key}: ${JSON.stringify(row.meta ?? {}).slice(0, 220)}`,
      weight: row.event === "replied" || row.event === "meeting" ? "high" : "normal",
    });
  }
  return evidence;
}

/**
 * Dawn already learns per turn. This batch pass looks across conversations for
 * patterns a single exchange cannot show: repeated dislikes, recurring stalls.
 */
async function dawnEvidence(): Promise<ReflectionEvidence[]> {
  const admin = client();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const evidence: ReflectionEvidence[] = [];

  const { data: feedback } = await admin
    .from("foundation1_dawn_feedback")
    .select("rating,comment,message_id,created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(60);
  const messageIds = (feedback ?? []).map((row) => row.message_id as string).filter(Boolean);
  const replyById = new Map<string, string>();
  if (messageIds.length) {
    const { data: messages } = await admin
      .from("foundation1_dawn_messages")
      .select("id,content")
      .in("id", messageIds);
    for (const row of messages ?? []) replyById.set(row.id as string, row.content as string);
  }
  for (const row of feedback ?? []) {
    evidence.push({
      label: row.rating === "dislike" ? "Client disliked a reply" : "Client liked a reply",
      detail: `${(row.comment as string | null) ?? "(no comment)"} | reply: ${(replyById.get(row.message_id as string) ?? "").slice(0, 200)}`,
      weight: row.rating === "dislike" ? "high" : "normal",
    });
  }

  const { data: insights } = await admin
    .from("foundation1_improvement_insights")
    .select("kind,headline,evidence,recommendation,severity,created_at")
    .gte("created_at", since)
    .in("kind", ["repeated_question", "trust_concern", "stuck_pattern", "reflection"])
    .order("created_at", { ascending: false })
    .limit(60);
  for (const row of insights ?? []) {
    evidence.push({
      label: `Pattern: ${row.kind}`,
      detail: `${row.headline}. ${row.evidence}`,
      weight: (row.severity as string) === "high" || (row.severity as string) === "medium" ? "high" : "normal",
    });
  }
  return evidence;
}

export async function collectReflectionEvidence(agent: ReflectAgent): Promise<ReflectionEvidence[]> {
  return agent === "dawn" ? dawnEvidence() : salesEvidence();
}

export type ReflectionProposal = {
  key: string;
  content: string;
  reason: string;
};

export type ReflectionResult = {
  agent: ReflectAgent;
  evidenceCount: number;
  proposals: ReflectionProposal[];
  applied: Array<{ key: string; version: number }>;
  skipped: string | null;
};

/**
 * One reflection cycle. `dryRun` proposes without rewriting, which is how the
 * founder surface previews a change before it is live.
 */
export async function runReflectionPass(input: {
  agent: ReflectAgent;
  dryRun?: boolean;
}): Promise<ReflectionResult> {
  const { agent } = input;
  const evidence = await collectReflectionEvidence(agent);
  const base: ReflectionResult = {
    agent,
    evidenceCount: evidence.length,
    proposals: [],
    applied: [],
    skipped: null,
  };
  if (evidence.length < 3) {
    return { ...base, skipped: "Not enough evidence yet; reflection needs at least three observations." };
  }

  const current = await loadPlaybook(agent);
  const keys = REFLECT_PLAYBOOK_KEYS[agent];

  const completion = await completeChat({
    role: "draft",
    json: true,
    model: process.env.MODEL_HARNESS?.trim() || undefined,
    thinking: "disabled",
    messages: [
      {
        role: "system",
        content: [
          `You improve the ${agent} agent inside Foundation-1's 1-MI platform by rewriting its playbook.`,
          "You are given real evidence from the last 30 days and the agent's current playbook.",
          "Propose changes ONLY where the evidence shows the agent should behave differently.",
          `Allowed keys: ${keys.join(", ")}.`,
          "Rules for content: imperative guidance to the agent, at most 3 sentences, general",
          "(never about one prospect or client), never invented facts or numbers, never a",
          "partner or bank name, never an em dash.",
          `Return strict JSON: {"proposals":[{"key":"<allowed key>","content":"...","reason":"<the evidence that forced this>"}]}`,
          `At most ${MAX_PROPOSALS_PER_PASS} proposals. Return {"proposals":[]} when the evidence supports no change.`,
        ].join(" "),
      },
      {
        role: "user",
        content: [
          "CURRENT PLAYBOOK:",
          current.length
            ? current.map((entry) => `[${entry.key}] v${entry.version}: ${entry.content}`).join("\n")
            : "(empty)",
          "",
          "EVIDENCE (high weight first):",
          ...evidence
            .sort((a, b) => (a.weight === b.weight ? 0 : a.weight === "high" ? -1 : 1))
            .slice(0, 60)
            .map((item, index) => `${index + 1}. [${item.weight}] ${item.label}: ${item.detail}`),
        ].join("\n"),
      },
    ],
  });

  if (!completion.ok) {
    const why = "error" in completion && completion.error
      ? completion.error
      : "reason" in completion && completion.reason
        ? completion.reason
        : "unknown";
    return { ...base, skipped: `Model unavailable for reflection: ${String(why).slice(0, 200)}` };
  }
  const parsed = parseJsonObject(completion.text) as { proposals?: ReflectionProposal[] } | null;
  const raw = Array.isArray(parsed?.proposals) ? parsed!.proposals : [];
  const proposals = raw
    .filter((p) => p && typeof p.key === "string" && keys.includes(p.key))
    .filter((p) => typeof p.content === "string" && p.content.trim().length > 0)
    .filter((p) => typeof p.reason === "string" && p.reason.trim().length > 0)
    .map((p) => ({
      key: p.key,
      content: p.content.replace(/\u2014/g, ", ").trim(),
      reason: p.reason.trim(),
    }))
    .slice(0, MAX_PROPOSALS_PER_PASS);

  if (input.dryRun) {
    return { ...base, proposals };
  }

  const applied: Array<{ key: string; version: number }> = [];
  for (const proposal of proposals) {
    const entry = await applyPlaybookUpdate({
      agent,
      key: proposal.key,
      content: proposal.content,
      reason: proposal.reason,
    });
    applied.push({ key: entry.key, version: entry.version });
  }
  return { ...base, proposals, applied };
}

// ---------------------------------------------------------------- attribution

export type VersionScore = {
  key: string;
  version: number;
  content: string;
  reason: string;
  updatedAt: string;
  drafted: number;
  approved: number;
  rejected: number;
  sent: number;
  replied: number;
  approvalRate: number | null;
  replyRate: number | null;
};

/**
 * Outcome attribution: every draft carries the playbook versions that shaped
 * it, so each version answers for itself. This is what makes the loop
 * self-correcting rather than merely self-modifying.
 */
export async function scorePlaybookVersions(agent: ReflectAgent): Promise<VersionScore[]> {
  const admin = client();
  const { data: versions } = await admin
    .from("foundation1_agent_playbooks")
    .select("key,version,content,reason,updated_at")
    .eq("agent", agent)
    .order("version", { ascending: false })
    .limit(60);
  if (!versions?.length) return [];

  const { data: queue } = await admin
    .from("foundation1_send_queue")
    .select("status,payload,prospect_key")
    .eq("agent", agent)
    .limit(400);

  const { data: outcomes } = await admin
    .from("foundation1_outcomes")
    .select("event,prospect_key")
    .limit(400);
  const repliedProspects = new Set(
    (outcomes ?? []).filter((row) => row.event === "replied").map((row) => row.prospect_key as string),
  );

  return versions.map((row) => {
    const key = row.key as string;
    const version = row.version as number;
    let drafted = 0;
    let approved = 0;
    let rejected = 0;
    let sent = 0;
    let replied = 0;
    for (const q of queue ?? []) {
      const stamp = ((q.payload ?? {}) as Record<string, unknown>).playbook as
        | Record<string, number>
        | undefined;
      if (!stamp || stamp[key] !== version) continue;
      drafted += 1;
      const status = q.status as string;
      if (status === "approved" || status === "sent") approved += 1;
      if (status === "rejected") rejected += 1;
      if (status === "sent") {
        sent += 1;
        if (repliedProspects.has(q.prospect_key as string)) replied += 1;
      }
    }
    const decided = approved + rejected;
    return {
      key,
      version,
      content: row.content as string,
      reason: row.reason as string,
      updatedAt: row.updated_at as string,
      drafted,
      approved,
      rejected,
      sent,
      replied,
      approvalRate: decided > 0 ? Math.round((approved / decided) * 100) : null,
      replyRate: sent > 0 ? Math.round((replied / sent) * 100) : null,
    };
  });
}

/** Versions that measurably underperform the version they replaced. */
export async function flagRegressions(agent: ReflectAgent): Promise<
  Array<{ key: string; version: number; previousVersion: number; approvalRate: number; previousApprovalRate: number }>
> {
  const scores = await scorePlaybookVersions(agent);
  const byKey = new Map<string, VersionScore[]>();
  for (const score of scores) {
    const list = byKey.get(score.key) ?? [];
    list.push(score);
    byKey.set(score.key, list);
  }
  const flags: Array<{ key: string; version: number; previousVersion: number; approvalRate: number; previousApprovalRate: number }> = [];
  for (const [key, list] of byKey) {
    const ordered = list.sort((a, b) => b.version - a.version);
    const [latest, previous] = ordered;
    if (!latest || !previous) continue;
    const MIN_SAMPLE = 5;
    if (latest.drafted < MIN_SAMPLE || previous.drafted < MIN_SAMPLE) continue;
    if (latest.approvalRate === null || previous.approvalRate === null) continue;
    if (latest.approvalRate < previous.approvalRate) {
      flags.push({
        key,
        version: latest.version,
        previousVersion: previous.version,
        approvalRate: latest.approvalRate,
        previousApprovalRate: previous.approvalRate,
      });
    }
  }
  return flags;
}

/** Founder sovereignty: restore an earlier version as the newest one. */
export async function revertPlaybookKey(input: {
  agent: ReflectAgent;
  key: string;
  toVersion: number;
  actor: string;
}): Promise<PlaybookEntry> {
  const { data, error } = await client()
    .from("foundation1_agent_playbooks")
    .select("content")
    .eq("agent", input.agent)
    .eq("key", input.key)
    .eq("version", input.toVersion)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That playbook version does not exist.");
  return applyPlaybookUpdate({
    agent: input.agent,
    key: input.key,
    content: data.content as string,
    reason: `Reverted to v${input.toVersion} by ${input.actor}.`,
  });
}

/** The stamp written onto every artefact an agent produces. */
export async function activePlaybookStamp(agent: ReflectAgent): Promise<Record<string, number>> {
  const entries = await loadPlaybook(agent);
  const stamp: Record<string, number> = {};
  for (const entry of entries) stamp[entry.key] = entry.version;
  return stamp;
}

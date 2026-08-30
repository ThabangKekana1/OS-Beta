/**
 * HARNESS — outreach draft assembly.
 *
 * Discipline (doc 15): investor-outreach style — one specific fit line, the
 * offer, one ask. The fit line is built ONLY from the book row's own evidence
 * fields (scale_signal / electricity_rationale), each row source-traceable per
 * POPIA rules. No savings claims are asserted: numbers belong to the audited
 * report, not the first touch. Everything this module produces is a DRAFT for
 * founder approval (lib/harness/gate).
 */
import { buildFoundationOutreachBody } from "@/lib/outreach-email-template";
import type { SendQueueDraftInput } from "./gate";
import { scoreLead } from "./score";
import type { BookRowScored } from "./tools";

export const SALES_AGENT = "sales-harness";

/** Extract one evidence-anchored sentence from the row's own fields. */
export function firstFitLine(row: Pick<BookRowScored, "companyName" | "scaleSignal" | "electricityRationale" | "subSector" | "siteType">): string {
  const anchor = (row.scaleSignal ?? "").trim() || (row.electricityRationale ?? "").trim();
  if (!anchor) {
    return `${row.companyName}'s ${row.siteType ?? row.subSector ?? "operation"} is exactly the load profile Foundation-1 works with.`;
  }
  // Quote or paraphrase honestly; cap length so it reads like a human line.
  const clean = anchor.replace(/\s+/g, " ").trim();
  const firstSentence = clean.split(/(?<=[.;])\s/)[0] ?? clean;
  return firstSentence.length > 220 ? `${firstSentence.slice(0, 217).trimEnd()}...` : firstSentence;
}

export function buildFirstTouchDraft(row: BookRowScored, senderAddress?: string | null): SendQueueDraftInput | null {
  if (!row.contactChannel) return null;
  const email = extractEmail(row.contactChannel);
  if (!email) return null;

  const body = [
    "Good day,", "", `${firstFitLine(row)}.`,
    "",
    "Foundation-1 helps South African agribusinesses cut electricity costs through funded solar-and-storage or wheeled clean energy: no capital outlay, you buy only the energy you use.",
    "",
    "The first step is a free forensic bill audit: send six months of utility bills and we return what you actually pay per unit, reconciled to the cent, and what two migration pathways would change.",
    "",
    "Worth a look for your site?",
    "",
    "Karman Kekana",
    "Foundation-1",
  ].join("\n");

  return {
    agent: SALES_AGENT,
    prospectKey: row.bookId,
    templateKey: "direct_first_touch_v1",
    toAddress: email,
    subject: `${row.companyName}: zero-capex energy migration worth a look?`,
    bodyText: buildFoundationOutreachBody({ company: row.companyName }) !== "" ? body : body,
    payload: {
      bookId: row.bookId,
      sector: row.sector,
      score: row.score,
      scoreReasons: row.reasons,
      fitLineSource: row.scaleSignal ? "scale_signal" : row.electricityRationale ? "electricity_rationale" : "site_type",
    },
    channel: "email",
  };
}

function extractEmail(channel: string): string | null {
  const match = channel.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return match ? match[0].toLowerCase() : null;
}

/** Score + sort a raw set of rows the same way read.salesBook does. */
export function rankRows<T extends { sector: string; estSpendBand?: string | null; contactChannel?: string | null; website?: string | null; verification?: string | null }>(
  rows: T[],
): Array<T & { score: number }> {
  return rows
    .map((row) => ({ ...row, score: scoreLead(row).score }))
    .sort((a, b) => b.score - a.score);
}

// -----------------------------------------------------------------------------
// Model-written first touches. The deterministic template above is the shape
// fallback for tests; nothing it writes reaches the queue anymore. The model
// writes like a person, under the learned playbook, and a deterministic guard
// rejects anything off-standard rather than queueing it.
// -----------------------------------------------------------------------------
import { completeChat, parseJsonObject } from "@/lib/model/client";
import { loadPlaybookText } from "./memory";

const BANNED_IN_OUTREACH = [/\bnedbank\b/i, /\bufms\b/i, /\bgreen\s?share\b/i, /\beqstra\b/i, /\u2014/];

export type ModelDraft = { subject: string; body: string };

export function outreachGuard(draft: ModelDraft, companyName: string): string | null {
  if (!draft.subject?.trim() || !draft.body?.trim()) return "empty subject or body";
  if (draft.subject.length > 78) return "subject too long";
  const words = draft.body.trim().split(/\s+/).length;
  if (words > 150) return "body too long";
  for (const pattern of BANNED_IN_OUTREACH) {
    if (pattern.test(draft.subject) || pattern.test(draft.body)) return `banned content: ${pattern}`;
  }
  const firstName = companyName.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (firstName && !draft.body.toLowerCase().includes(firstName) && !draft.subject.toLowerCase().includes(firstName)) {
    return "does not address the business by name";
  }
  if (/registration number|register \(/i.test(draft.body.split("\n").slice(0, 3).join(" "))) {
    return "opens with raw register metadata";
  }
  return null;
}

export async function draftFirstTouchWithModel(
  row: BookRowScored,
  options: { timeoutMs?: number } = {},
): Promise<SendQueueDraftInput | null> {
  if (!row.contactChannel) return null;
  const email = extractEmail(row.contactChannel);
  if (!email) return null;

  const playbook = await loadPlaybookText(SALES_AGENT).catch(() => "");
  const evidence = [
    row.scaleSignal ? `Scale evidence: ${row.scaleSignal}` : null,
    row.electricityRationale ? `Electricity rationale: ${row.electricityRationale}` : null,
    `Sector: ${row.sector}${row.subSector ? ` (${row.subSector})` : ""}`,
    row.siteType ? `Site type: ${row.siteType}` : null,
    row.town || row.province ? `Location: ${[row.town, row.province].filter(Boolean).join(", ")}` : null,
  ].filter(Boolean).join("\n");

  const completion = await completeChat({
    role: "draft",
    json: true,
    thinking: "disabled",
    signal: AbortSignal.timeout(options.timeoutMs ?? 25_000),
    messages: [
      {
        role: "system",
        content: [
          "You write a first-touch email from Karman Kekana, founder of Foundation-1, to a South African",
          "agribusiness about cutting electricity costs. You write like a busy founder to a peer: warm,",
          "direct, specific, zero marketing gloss.",
          "",
          "HARD RULES:",
          "- Address the business by its name in the greeting (e.g. 'Good day to the Alzu team,').",
          "- The opening line must show we did our homework, written as a natural human sentence.",
          "  NEVER paste registry text, registration numbers, dates in brackets, or database fields.",
          "  Translate the evidence into what it means: their operation runs heavy, always-on load.",
          "- One line on what Foundation-1 does: funded solar and storage or wheeled clean energy,",
          "  no capital outlay, they buy only the energy they use.",
          "- ONE small ask. Never request bills or documents in the first touch.",
          "- No savings percentages, no invented numbers, no partner or bank names, no em dashes.",
          "- Under 110 words. Sign off exactly: Karman Kekana, Foundation-1 (on two lines).",
          "- Subject: under 60 characters, specific to their operation, no generic offer phrasing.",
          "",
          playbook && !playbook.startsWith("No learned") ? `LEARNED PLAYBOOK (obey it):\n${playbook}` : "",
          "",
          'Return strict JSON: {"subject": "...", "body": "..."}',
        ].join("\n"),
      },
      { role: "user", content: `Write the first touch for:\nCompany: ${row.companyName}\n${evidence}` },
    ],
  });
  if (!completion.ok) return null;
  const parsed = parseJsonObject(completion.text) as ModelDraft | null;
  if (!parsed) return null;
  const draft: ModelDraft = {
    subject: String(parsed.subject ?? "").replace(/\u2014/g, ", ").trim(),
    body: String(parsed.body ?? "").replace(/\u2014/g, ", ").trim(),
  };
  const rejected = outreachGuard(draft, row.companyName);
  if (rejected) return null;

  return {
    agent: SALES_AGENT,
    prospectKey: row.bookId,
    templateKey: "direct_first_touch_v2_model",
    toAddress: email,
    subject: draft.subject,
    bodyText: draft.body,
    payload: {
      bookId: row.bookId,
      sector: row.sector,
      score: row.score,
      scoreReasons: row.reasons,
      drafter: "model",
    },
    channel: "email",
  };
}

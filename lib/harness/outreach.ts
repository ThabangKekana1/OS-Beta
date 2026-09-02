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

/**
 * The first touch exists to move them into the system, not into a meeting. The
 * site takes their own numbers and returns their own answer in about a minute,
 * and the campaign tag lets the case be traced back to this letter.
 */
function publicWebsiteOrigin(): string {
  const configured = (process.env.NEXT_PUBLIC_WEBSITE_ORIGIN || "").trim().replace(/\/+$/, "");
  // A local origin must never reach a client letter. Drafts are written against
  // the production database from local runs too, so this cannot be trusted blindly.
  if (!configured || !/^https:\/\//i.test(configured) || /localhost|127\.0\.0\.1|\.local\b/i.test(configured)) {
    return "https://foundation-1.co.za";
  }
  return configured;
}

export const ASSESSMENT_URL = `${publicWebsiteOrigin()}/start`;

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

/**
 * American sales register. This market reads it as pressure, and pressure reads
 * as weakness, so the guard rejects the draft rather than sending it.
 */
const BANNED_REGISTER = [
  /\breach out\b/i,
  /\bcircle back\b/i,
  /\bquick question\b/i,
  /\bhope this (email )?finds you\b/i,
  /\bgame.?changer\b/i,
  /\bsynerg/i,
  /\bleverage\b/i,
  /\bunlock\b/i,
  /\bexciting opportunity\b/i,
  /\blet me know if\b.*\binterested\b/i,
  /!/,
];

export type ModelDraft = { subject: string; body: string };

export function outreachGuard(
  draft: ModelDraft,
  companyName: string,
  contactFirstName?: string | null,
): string | null {
  if (!draft.subject?.trim() || !draft.body?.trim()) return "empty subject or body";
  if (draft.subject.length > 78) return "subject too long";
  const words = draft.body.trim().split(/\s+/).length;
  if (words > 190) return "body too long";
  if (words < 70) return "body too thin for a first touch";
  for (const pattern of BANNED_IN_OUTREACH) {
    if (pattern.test(draft.subject) || pattern.test(draft.body)) return `banned content: ${pattern}`;
  }
  for (const pattern of BANNED_REGISTER) {
    if (pattern.test(draft.subject) || pattern.test(draft.body)) return `american sales register: ${pattern}`;
  }
  if (!/kind regards/i.test(draft.body)) return "no courteous close";
  if (!draft.body.includes(ASSESSMENT_URL)) return "missing or altered the route into the system";
  if (/utm_/i.test(draft.body)) return "raw tracking parameters in the letter";
  if (/\b(brief call|quick call|short call|meeting|catch up)\b/i.test(draft.body)) return "asks for a meeting instead of sending them to the system";
  const firstName = companyName.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (firstName && !draft.body.toLowerCase().includes(firstName) && !draft.subject.toLowerCase().includes(firstName)) {
    return "does not address the business by name";
  }
  if (/registration number|register \(/i.test(draft.body.split("\n").slice(0, 3).join(" "))) {
    return "opens with raw register metadata";
  }
  // Personalisation is enforced here, not hoped for in the prompt. When the
  // source carries a named decision maker, the letter must use that name and
  // may not fall back to addressing the business collectively.
  const first = (contactFirstName ?? "").trim();
  if (first) {
    const opening = draft.body.split("\n").slice(0, 2).join(" ");
    if (!opening.toLowerCase().includes(first.toLowerCase())) {
      return `does not greet the named contact (${first})`;
    }
    if (/\bteam\b/i.test(opening)) {
      return "addresses the team while a named contact exists";
    }
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
  const firstName = (row.contactFirstName ?? "").trim();
  const fullName = [firstName, (row.contactSurname ?? "").trim()].filter(Boolean).join(" ");
  const evidence = [
    fullName ? `Recipient: ${fullName}${row.contactRole ? `, ${row.contactRole}` : ""}` : null,
    firstName ? `Greet them by first name: ${firstName}` : null,
    row.scaleSignal ? `Scale evidence: ${row.scaleSignal}` : null,
    row.electricityRationale ? `Electricity rationale (OUR ESTIMATE, never quote it as their figure): ${row.electricityRationale}` : null,
    `Sector: ${row.sector}${row.subSector && row.subSector !== row.sector ? ` (${row.subSector})` : ""}`,
    row.siteType ? `Site type: ${row.siteType}` : null,
    row.town || row.province ? `Location: ${[row.town, row.province].filter(Boolean).join(", ")}` : null,
    `The one link to send them, copy it exactly, on its own line: ${ASSESSMENT_URL}`,
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
          "You are Karman Kekana, founder of Foundation-1, writing one first email to a named person",
          "who runs a South African agribusiness. You are not a salesman and you are not a robot. You are",
          "a founder writing to a peer who is older, busier and more established than you, in a country",
          "where courtesy is not optional and where a hard sell is read as weakness.",
          "",
          "THE REAL PROBLEM you are writing about, understand it before you write:",
          "Electricity is the one input cost that compounds faster than the price they can charge. The grid",
          "path runs at 13 percent a year. Their selling price does not. So every year they hold the same",
          "operation, the margin quietly shrinks, and it compounds. They already know this. Do not explain",
          "their own business to them and never lecture them about it.",
          "The reason they have not acted is not ignorance. It is that capital is committed to production,",
          "a solar decision is a ten year capital decision, and the technical and credit risk normally sits",
          "on their balance sheet. Most of them have looked at solar once, been sold a system rather than a",
          "price, and walked away. Your email exists to remove the reason they said no last time.",
          "",
          "THE REAL GAIN, in their language:",
          "Not savings. Margin protected for ten years and longer, on a cost line they currently cannot",
          "control, with no capital, no asset on their balance sheet and no credit exposure. The audit is",
          "done on their own bills, not a brochure.",
          "",
          "HOW TO MAKE ENGAGING THE OBVIOUS MOVE, this is the whole craft:",
          "- Cost them nothing to say yes. The first step must be smaller than the effort of saying no.",
          "- Give before you ask. You hold the tariff engines, they hold the bills. Offer them their own",
          "  number, computed from their own site, at no cost and with nothing owed.",
          "- Make the reversibility explicit. Nothing is signed, nothing is owed, they can stop at any point.",
          "- Signal, do not claim. R0 until the switch is a costly signal: it says Foundation-1 carries the",
          "  work and only earns when the client is live. State it as a fact, never as a boast.",
          "- Peers move markets in this sector. If the evidence carries momentum, say plainly and truthfully",
          "  that operations in their sector are already in conversation, that organised industry bodies are",
          "  engaging, and that provincial and district government are talking to Foundation-1 about",
          "  programmes for agribusiness. Never name a client. Never claim a signed agreement.",
          "- No pressure, no deadline, no scarcity, no percentages promised. Pressure reads as desperation",
          "  and kills the deal in this market.",
          "",
          "SOUTH AFRICAN REGISTER, not American:",
          "- Full sentences. Never clipped openers like Saw you run or Quick question or Hope this finds.",
          "- Greet by first name after Good day. A short courteous line is welcome, not filler.",
          "- Understated. No hype words, no exclamation marks, no emoji, no jargon such as leverage,",
          "  solution, synergies, unlock, game changer, reach out or circle back.",
          "- Offer to be redirected: if this sits with someone else in the business, ask to be pointed there.",
          "- Close with Kind regards and the full signature block.",
          "",
          "STRUCTURE, in this order, nothing extra:",
          "1. Good day <first name>,",
          "2. One sentence that proves you know their specific operation, from the evidence given. Their site,",
          "   their town, what they actually run. Never registry text, never a database field.",
          "3. One or two sentences on the compounding cost, stated as arithmetic and consequence, not doom.",
          "4. One sentence on what Foundation-1 does, in plain words, carrying the R0 until live fact.",
          "5. One short sentence of honest momentum, only if the evidence supports it.",
          "6. ONE ask, and it is a link, not a favour. Do not offer to send them anything and do not ask",
          "   for a call, a meeting, bills or documents. The machine does the work, not you. Invite them to",
          "   put their own numbers in and see their own answer, in about a minute, at the exact URL you are",
          "   given in the evidence. Write the URL in full on its own line. Say plainly what happens when",
          "   they do: they see their own number, nothing is signed, nothing is owed, and they can stop at",
          "   any point. Never claim you have their bills or their figures.",
          "7. Kind regards, then Karman Kekana, then Foundation-1, on three lines.",
          "",
          "HARD RULES:",
          "- Greeting: when the evidence carries a Recipient, greet that person by first name and nothing",
          "  else. Never write the team when a person is named. Only when no Recipient is given, address",
          "  the business by name. Never invent a person\'s name.",
          "- When a job title is given, write to that person\'s actual concern: an operations manager cares",
          "  about uptime and continuity, a finance director about the cost line and the balance sheet, an",
          "  owner about the next ten years. Do not name their title back at them, use it to choose what you say.",
          "- No savings percentages, no invented numbers, no partner or bank names, no em dashes.",
          "- NEVER quote a rand figure for their electricity spend. Any spend figure you are given is",
          "  Foundation-1\'s own estimate, not their bill, and stating it back as fact is both wrong and",
          "  intrusive. Refer to the scale of the operation in words instead.",
          "- Write rand amounts with spaces and never commas, for example R1 250 000.",
          "- Describe the client\'s own sector accurately from the evidence. Never call an operation an",
          "  agribusiness if the evidence says otherwise, and never describe a sector you were not given.",
          "- Between 90 and 150 words. Subject under 60 characters, specific to their operation, never a",
          "  generic offer phrase.",
          "- Break the body into short paragraphs of one or two sentences, separated by a blank line. Never",
          "  send a single dense block of text, it does not get read.",
          "- Say the R0 until live fact once. Repeating it sounds like a pitch.",
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
  const rejected = outreachGuard(draft, row.companyName, row.contactFirstName);
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
      source: row.source ?? "register",
      contactName: fullName || null,
      contactRole: row.contactRole ?? null,
      monthlySpendEstimateZar: row.monthlySpendEstimateZar ?? null,
    },
    channel: "email",
  };
}

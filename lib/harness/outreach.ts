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

/**
 * Partners are disclosed with pride now, not hidden. Nedbank Corporate and
 * Investment Banking owns, installs, maintains and insures the on site
 * infrastructure, and saying so is the single strongest trust signal in a cold
 * letter to a finance director. The product and vehicle names stay out.
 */
const BANNED_IN_OUTREACH = [/\bufms\b/i, /\beqstra\b/i, /\u2014/, /\u2013/];

/**
 * American sales register. This market reads it as pressure, and pressure reads
 * as weakness, so the guard rejects the draft rather than sending it.
 */
const BANNED_REGISTER = [
  /\breach out\b(?! directly)/i,
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
  // The signature block is fixed and does not compete with the letter, so the
  // length rule measures the letter, not the block.
  const bodyWithoutSignature = draft.body.split(/\n\s*Karman Kekana\s*\n\s*Founder, Foundation-1/i)[0] ?? draft.body;
  const letterWords = bodyWithoutSignature.trim().split(/\s+/).length;
  if (letterWords > 290) return "body too long";
  if (letterWords < 70) return "body too thin for a first touch";
  for (const pattern of BANNED_IN_OUTREACH) {
    if (pattern.test(draft.subject) || pattern.test(draft.body)) return `banned content: ${pattern}`;
  }
  for (const pattern of BANNED_REGISTER) {
    if (pattern.test(draft.subject) || pattern.test(draft.body)) return `american sales register: ${pattern}`;
  }
  if (!/Founder, Foundation-1/i.test(draft.body)) return "signature block is not the founder's";
  if (/kind regards/i.test(draft.body)) return "carries a sign off the founder does not use";
  // The offer is the point of the letter. A first touch that does not say we
  // fund it, and does not name what they can save, is a wasted send.
  if (!/\b35\b/.test(draft.body) || !/\b58\b/.test(draft.body)) return "does not carry both savings ceilings";
  if (!/nedbank/i.test(draft.body)) return "does not name the bank that owns and insures the infrastructure";
  // A letter that apologises twice reads as nervous. One acknowledgement only.
  const unannounced = (draft.body.match(/unannounced|without introduction|out of the blue/gi) ?? []).length;
  if (unannounced > 1) return "acknowledges the cold approach more than once";
  const firstThird = draft.body.slice(0, Math.floor(draft.body.length / 3));
  if (/on site infrastructure|the system|the pathways/i.test(firstThird) && !/foundation-1 (moves|helps|builds|puts)/i.test(firstThird)) {
    return "refers to the offer before saying what Foundation-1 does";
  }
  if (!/(own|install|maintain|insur|financ)/i.test(draft.body)) return "does not say who carries the infrastructure";
  if (!/(zero capex|no capital|nothing on your balance sheet|pays? nothing|only once it|only once power)/i.test(draft.body)) return "does not make the zero capital position explicit";
  if (!/linkedin\.com\/in\/karman-kekana/i.test(draft.body)) return "signature is missing the LinkedIn profile";
  if (!/karman@foundation-1\.co\.za/i.test(draft.body)) return "signature is missing the direct email address";
  if (!/\+27 69 811 7112/.test(draft.body)) return "the letter is missing the WhatsApp number";
  if (!/\bEden\b/.test(draft.body) || !/\bLumen\b/.test(draft.body)) return "does not name both pathways (Eden and Lumen)";
  if (!/based in Bryanston/i.test(draft.body)) return "missing the founder's home line (based in Bryanston)";
  if (/good day|dear /i.test(draft.body.split("\n")[0] ?? "")) return "opens with a salutation the founder does not use";
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


/** Escape, linkify and paragraph a plain-text letter for the HTML part. */
export function toEmailHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const linked = escaped.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
    const label = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `<a href="${url}" style="color:#0e7490; text-decoration:underline;">${label}</a>`;
  });
  const paragraphs = linked
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 14px;">${block.replace(/\n/g, "<br/>")}</p>`) 
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#111;">${paragraphs}</div>`;
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
    `Sector tag on file, TREAT AS UNRELIABLE and never assert it back to them unless the scale evidence supports it: ${row.sector}${row.subSector && row.subSector !== row.sector ? ` (${row.subSector})` : ""}`,
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
          "- Greet by first name on its own line. A short courteous line is welcome, not filler.",
          "- Understated. No hype words, no exclamation marks, no emoji, no jargon such as leverage,",
          "  solution, synergies, unlock, game changer or circle back.",
          "- Offer to be redirected: if this sits with someone else in the business, ask to be pointed there.",
          "- NEVER use an em dash or an en dash. The founder hates them. Use a comma, a colon or a full stop.",
          "",
          "THE FOUNDER HAS WRITTEN THE LETTER HIMSELF. Follow his structure exactly. Your job is to fit this",
          "prospect into it, not to reinvent it. Short lines. No apology. No throat clearing. Nothing said twice.",
          "",
          "SUBJECT: lead with the benefit and the company, under 60 characters. His pattern:",
          "  <Company>\'s power bill: up to 60% down, zero capital outlay",
          "",
          "THE LETTER, in this exact order:",
          "1. <First name>,   on its own line. No Good day, no Dear.",
          "2. Karman Kekana, founder of Foundation-1, based in Bryanston.   One line, exactly this form.",
          "3. THE OPENER, exactly this shape, two sentences: I wanted to reach out directly rather than",
          "   through the usual channels. I\'ve spent time looking at what operators around <their town or",
          "   area from the evidence> are facing on electricity costs, and I think there\'s something here",
          "   worth a conversation. Use their real town, city or province from the evidence. Never invent",
          "   or guess a place, and if no location is given, write: I\'ve spent time looking at what",
          "   operators in their industry are facing on electricity costs.",
          "4. THE PITCH, one paragraph, exactly this shape and order:",
          "   Tariffs are rising roughly 13% a year, and most output pricing doesn\'t move with it.",
          "   Foundation-1 closes that gap two ways: Eden: solar and storage on-site, zero capex, up to 35%",
          "   off from day one, financed and insured through Nedbank CIB. Lumen: renewable power wheeled to",
          "   your existing meter, nothing installed, up to 58% off. Combined, up to 60%. You only pay once",
          "   power is live.",
          "   Where the evidence gives you something specific about their operation, work one short true",
          "   detail into the first sentence. Never assert a sector the evidence does not support.",
          "5. THE CTA, exactly this shape: If it\'s useful, you can run your own numbers in under a minute,",
          "   no signature needed: then the link on its own line.",
          "6. THE REDIRECT: I\'d genuinely welcome a conversation if this is relevant to you, and if energy",
          "   procurement sits with someone else at <Company>, I\'d appreciate a name to point me to.",
          "7. THE WHATSAPP LINE, exactly this shape: Feel free to WhatsApp me directly with any questions:",
          "   +27 69 811 7112.",
          "8. The signature block, exactly these four lines, with NO Kind regards and no sign off line",
          "   above it. The founder does not use one:",
          "     Karman Kekana",
          "     Founder, Foundation-1",
          "     karman@foundation-1.co.za",
          "     linkedin.com/in/karman-kekana-26011674",
          "",
          "HARD RULES:",
          "- Greeting: when the evidence carries a Recipient, greet that person by first name and nothing",
          "  else. Never write the team when a person is named. Only when no Recipient is given, address",
          "  the business by name. Never invent a person\'s name.",
          "- When a job title is given, write to that person\'s actual concern: an operations manager cares",
          "  about uptime and continuity, a finance director about the cost line and the balance sheet, an",
          "  owner about the next ten years. Do not name their title back at them, use it to choose what you say.",
          "- THE OFFER MUST BE UNMISTAKABLE. Every letter has to carry three things in plain words:",
          "  (a) ZERO CAPEX, AND WHO CARRIES IT. On-site solar and storage, zero capex, financed and",
          "      insured through Nedbank CIB. Name them. A bank on the asset is the reason a cautious",
          "      operator keeps reading. The client pays nothing to build it and buys only the energy it",
          "      produces, at a lower rate than now.",
          "  (b) THE TWO PATHWAYS, named exactly Eden and Lumen, and their approved savings ceilings,",
          "      which are the published figures on foundation-1.co.za and are the ONLY percentages you",
          "      may ever write:",
          "        Eden: solar and storage on-site, up to 35 percent off from day one;",
          "        Lumen: renewable power wheeled to their existing meter, nothing installed, up to 58 percent off;",
          "        and both together, up to 60 percent combined.",
          "      Always write them as up to, never as a promise, and never invent a different number.",
          "  (c) R0 until the switch. You only pay once power is live.",
          "- No invented numbers beyond those two published ceilings. No partner or bank names other than Nedbank CIB. No em dashes.",
          "- NEVER quote a rand figure for their electricity spend. Any spend figure you are given is",
          "  Foundation-1\'s own estimate, not their bill, and stating it back as fact is both wrong and",
          "  intrusive. Refer to the scale of the operation in words instead.",
          "- Write rand amounts with spaces and never commas, for example R1 250 000.",
          "- Describe the client\'s own sector accurately from the evidence. Never call an operation an",
          "  agribusiness if the evidence says otherwise, and never describe a sector you were not given.",
          "- Between 140 and 270 words, excluding the signature block. The offer needs room, but every",
          "  sentence must earn its place. Short paragraphs, one or two sentences each.",
          "  Subject under 60 characters, specific to their operation, never a",
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
  if (rejected) {
    // Silent rejection hides why a batch is empty. One env flag turns the
    // reason on without changing behaviour.
    if (process.env.OUTREACH_DEBUG) console.error(`[outreach guard] ${row.companyName}: ${rejected}`);
    return null;
  }

  // The letter is written as plain text, but it goes out as both. Building the
  // HTML here means the assessment link and the founder's LinkedIn profile are
  // actually clickable in the client's inbox instead of being bare text.
  const bodyHtml = toEmailHtml(draft.body);

  return {
    agent: SALES_AGENT,
    prospectKey: row.bookId,
    templateKey: "direct_first_touch_v2_model",
    toAddress: email,
    subject: draft.subject,
    bodyText: draft.body,
    bodyHtml,
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

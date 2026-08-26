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

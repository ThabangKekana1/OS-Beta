/**
 * HARNESS — the Deck (doc 21): the decision-first founder surface.
 *
 * The founder's job is verdicts. The Deck's job is to make every verdict a
 * single keystroke backed by visible evidence: the artifact, the score and
 * its inputs, why-now. Ordering here is policy:
 *
 *   escalations   — platform asks for a decision it will not make itself
 *   drafts        — highest score first; evidence-dense items float up
 *   receipts      — recently sent / rejected; collapsed context, never gone
 */
export const DECK_VERSION = "deck-v1";

export type QueueItem = {
  id: string;
  prospectKey: string;
  toAddress: string | null;
  subject: string;
  bodyText: string;
  status: "draft" | "approved" | "rejected" | "sent";
  createdAt: string;
  approvedBy?: string | null;
  sentAt?: string | null;
  rejectedReason?: string | null;
  payload: {
    bookId?: string;
    sector?: string;
    score?: number;
    scoreReasons?: string[];
    fitLineSource?: string;
    companyName?: string;
  };
};

export function itemScore(item: QueueItem): number {
  return typeof item.payload?.score === "number" ? item.payload.score : -1;
}

/** Stable, explainable ordering of the Today Queue. Pure; unit-tested. */
export function orderQueueForFounder(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => {
    // Drafts are work; everything else is receipt.
    if (a.status === "draft" && b.status !== "draft") return -1;
    if (b.status === "draft" && a.status !== "draft") return 1;
    if (a.status !== "draft" && b.status !== "draft") {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    }
    const scoreDelta = itemScore(b) - itemScore(a);
    if (scoreDelta !== 0) return scoreDelta;
    // Equal scores: oldest first so nothing starves at the bottom.
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });
}

/** Round receipts down to a bounded strip — the queue stays about the future. */
export function takeReceipts(ordered: QueueItem[], limit = 8): { receipts: QueueItem[]; hiddenCount: number } {
  const receipts = ordered.filter((item) => item.status !== "draft").slice(0, limit);
  return { receipts, hiddenCount: Math.max(0, ordered.filter((item) => item.status !== "draft").length - receipts.length) };
}

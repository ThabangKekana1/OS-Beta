/**
 * The Daily Worklist — pure derivation, no new state (doc 06 §3.2).
 *
 * Constraint order:
 *   Group 1 — cases blocking a submission slot. A slot is blocked when a
 *     submitted pack is waiting on the funder (SLA clock running or breached)
 *     or when a completed pack is sitting on the shelf instead of moving:
 *     ready-to-submit, signed funder proposal in hand, verified pack awaiting
 *     the recorded handoff.
 *   Group 2 — cases one action away from bankable: everything is in place
 *     except exactly one of {signed EOI, confirmed KYC readiness}, or a
 *     parked Fix-It plan whose reassess date has arrived.
 *   Group 3 — everything else, ordered by staleness so nothing rots quietly.
 *
 * Every row derives from existing case data. Each row names THE one next
 * action and its owner; the operator never has to decide what a row means.
 */

import { slaClock, type SlaClock } from "@/lib/submission-queue";

const DAY_MS = 24 * 60 * 60 * 1000;

export type WorklistOwner = "Foundation-1" | "Client" | "Funder";

/** The case facts the worklist needs — all read from existing rows. */
export type WorklistCaseInput = {
  caseId: string;
  reference: string;
  businessName: string;
  stage: string;
  createdAt: string;
  updatedAt: string | null;
  /** Stage-entry timestamps as recorded on the case row. */
  proposalReadyAt: string | null;
  eoiSignedAt: string | null;
  kycReadinessConfirmedAt: string | null;
  submittedToFunderAt: string | null;
  kycPackCompleteAt: string | null;
  kycVerifiedAt: string | null;
  kycHandedOffAt: string | null;
  termSheetIssuedAt: string | null;
  partnerProposalReadyAt: string | null;
  partnerProposalSignedAt: string | null;
  /** Relations, reduced to facts. */
  hasBillPack: boolean;
  hasProposal: boolean;
  /** "in_progress" is written by the document gate while items remain open. */
  readinessStatus: "confirmed" | "parked" | "in_progress" | null;
  readinessReassessOn: string | null;
  /** Client returned the signed funder proposal (submitted_by_client). */
  signedFunderProposalAt: string | null;
  /** Active submission facts, when one exists. */
  submissionPending: boolean;
  submissionSubmittedAt: string | null;
  submissionSlaDays: number | null;
  submissionAcknowledgedAt: string | null;
  /** KYC custody pack complete (6/6 latest documents present). */
  kycPackComplete: boolean;
};

export type WorklistGroup = 1 | 2 | 3;

export type WorklistRow = {
  caseId: string;
  reference: string;
  businessName: string;
  stage: string;
  group: WorklistGroup;
  daysInStage: number;
  nextAction: string;
  owner: WorklistOwner;
  /** Set when the row carries a live SLA clock. */
  sla: SlaClock | null;
  /** Lower ranks sort first inside a group. */
  rank: number;
};

/** When the case entered its current stage, from the row's own timestamps. */
export function stageEnteredAt(input: WorklistCaseInput): string {
  const byStage: Record<string, string | null> = {
    term_sheet_issued: input.termSheetIssuedAt,
    kyc_handed_off: input.kycHandedOffAt,
    kyc_verified: input.kycVerifiedAt,
    partner_proposal_signed: input.partnerProposalSignedAt,
    partner_proposal_ready: input.partnerProposalReadyAt,
    submitted_to_funder: input.submittedToFunderAt,
    kyc_ready: input.kycReadinessConfirmedAt,
    eoi_signed: input.eoiSignedAt,
    proposal_ready: input.proposalReadyAt,
    proposal_not_recommended: input.proposalReadyAt,
  };
  return byStage[input.stage] ?? input.updatedAt ?? input.createdAt;
}

export function daysBetween(fromIso: string, now: number | Date): number {
  const nowMs = now instanceof Date ? now.getTime() : now;
  return Math.max(0, Math.floor((nowMs - new Date(fromIso).getTime()) / DAY_MS));
}

type Derived = {
  group: WorklistGroup;
  nextAction: string;
  owner: WorklistOwner;
  rank: number;
  sla: SlaClock | null;
};

function derive(input: WorklistCaseInput, now: number): Derived {
  // ----- Group 1: the submission drum -------------------------------------
  if (input.submissionPending && input.submissionSubmittedAt) {
    const clock = slaClock({
      submittedAt: input.submissionSubmittedAt,
      slaDays: input.submissionSlaDays ?? undefined,
      acknowledgedAt: input.submissionAcknowledgedAt,
      now,
    });
    if (clock.breachDue) {
      return { group: 1, rank: 0, sla: clock, owner: "Funder", nextAction: `Send the formal breach note — day ${clock.dayNumber} of ${input.submissionSlaDays ?? 7} (cl. 4.2.1).` };
    }
    if (clock.escalationDue) {
      return { group: 1, rank: 1, sla: clock, owner: "Funder", nextAction: `Send the day-${clock.dayNumber} escalation — response due in ${Math.max(0, clock.daysRemaining)} day${clock.daysRemaining === 1 ? "" : "s"}.` };
    }
    if (!input.submissionAcknowledgedAt) {
      return { group: 1, rank: 4, sla: clock, owner: "Funder", nextAction: "Chase and record the funder's acknowledgement of receipt." };
    }
    return { group: 1, rank: 5, sla: clock, owner: "Funder", nextAction: `Await the funder proposal — day ${clock.dayNumber} of ${input.submissionSlaDays ?? 7}.` };
  }

  if (input.kycVerifiedAt && !input.kycHandedOffAt) {
    return { group: 1, rank: 2, sla: null, owner: "Foundation-1", nextAction: "Record the official KYC handoff with the recipient manifest." };
  }
  if (!input.submittedToFunderAt && input.signedFunderProposalAt) {
    return { group: 1, rank: 2, sla: null, owner: "Foundation-1", nextAction: "Signed funder proposal in hand — submit in the next batch." };
  }
  if (!input.submittedToFunderAt && input.eoiSignedAt && input.kycReadinessConfirmedAt) {
    return { group: 1, rank: 3, sla: null, owner: "Foundation-1", nextAction: "Bankable — queue into the next submission batch." };
  }

  // ----- Group 2: one action from bankable ---------------------------------
  if (input.hasProposal && input.eoiSignedAt && !input.kycReadinessConfirmedAt) {
    if (input.readinessStatus === "parked") {
      const due = input.readinessReassessOn && new Date(input.readinessReassessOn).getTime() <= now;
      return {
        group: due ? 2 : 3,
        rank: due ? 1 : 2,
        sla: null,
        owner: "Client",
        nextAction: due
          ? `Fix-It reassess date reached (${input.readinessReassessOn}) — chase the missing KYC items.`
          : `Parked on a Fix-It plan — reassess ${input.readinessReassessOn ?? "date not set"}.`,
      };
    }
    return { group: 2, rank: 0, sla: null, owner: "Client", nextAction: "Chase the six-item KYC readiness confirmation — one step from bankable." };
  }
  if (input.hasProposal && !input.eoiSignedAt && (input.stage === "proposal_ready" || input.stage === "proposal_not_recommended")) {
    return { group: 2, rank: 1, sla: null, owner: "Client", nextAction: "Chase the non-binding EOI signature — one step from bankable." };
  }

  // ----- Group 3: everything else ------------------------------------------
  if (input.termSheetIssuedAt || input.stage === "term_sheet_issued") {
    return { group: 3, rank: 9, sla: null, owner: "Foundation-1", nextAction: "Term sheet recorded — confirm client signature and close out." };
  }
  if (input.kycHandedOffAt) {
    return { group: 3, rank: 3, sla: null, owner: "Funder", nextAction: "Handed off — chase the funder for the term sheet." };
  }
  if (input.partnerProposalSignedAt && !input.kycPackComplete) {
    return { group: 3, rank: 0, sla: null, owner: "Client", nextAction: "Chase the outstanding KYC documents into custody." };
  }
  if (input.kycPackComplete && !input.kycVerifiedAt) {
    return { group: 3, rank: 0, sla: null, owner: "Foundation-1", nextAction: "Verify the six KYC documents in custody." };
  }
  if (input.stage === "bill_pack_review") {
    return { group: 3, rank: 1, sla: null, owner: "Foundation-1", nextAction: "Clear the bill-pack evidence blockers." };
  }
  if (input.stage === "bill_pack_processing") {
    return { group: 3, rank: 2, sla: null, owner: "Foundation-1", nextAction: "Bill pack processing — confirm the audit completes." };
  }
  if (!input.hasBillPack) {
    return { group: 3, rank: 4, sla: null, owner: "Client", nextAction: "Chase the six-month bill pack upload." };
  }
  if (!input.hasProposal) {
    return { group: 3, rank: 2, sla: null, owner: "Foundation-1", nextAction: "Generate the bill-audited proposal." };
  }
  return { group: 3, rank: 8, sla: null, owner: "Foundation-1", nextAction: "Review the case timeline — no standard action matched." };
}

/**
 * Builds the constraint-sorted worklist. Group 1 rows first, then group 2,
 * then group 3; inside a group, urgency rank first, then the row that has
 * waited longest in its stage.
 */
export function buildDailyWorklist(cases: WorklistCaseInput[], now: number | Date): WorklistRow[] {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const rows = cases.map((input) => {
    const derived = derive(input, nowMs);
    return {
      caseId: input.caseId,
      reference: input.reference,
      businessName: input.businessName,
      stage: input.stage,
      group: derived.group,
      daysInStage: daysBetween(stageEnteredAt(input), nowMs),
      nextAction: derived.nextAction,
      owner: derived.owner,
      sla: derived.sla,
      rank: derived.rank,
    } satisfies WorklistRow;
  });
  rows.sort((a, b) =>
    a.group - b.group
    || a.rank - b.rank
    || b.daysInStage - a.daysInStage
    || a.reference.localeCompare(b.reference));
  return rows;
}

/* ------------------------------------------------------------------ */
/* Deal book (§7: cumulative term-sheet R value)                       */
/* ------------------------------------------------------------------ */

export type DealBookSheet = {
  dealValueRands: number;
  /** Tracker status; null/undefined rows (pre-migration) count as received. */
  status?: "received" | "signed" | "declined" | null;
};

export type DealBookSummary = {
  count: number;
  /** Cumulative R value of all term-sheeted deals that are not declined. */
  totalRands: number;
  signedRands: number;
  signedCount: number;
  declinedCount: number;
};

/** Declined sheets leave the book; unmigrated rows degrade to "received". */
export function summariseDealBook(sheets: DealBookSheet[]): DealBookSummary {
  const summary: DealBookSummary = { count: 0, totalRands: 0, signedRands: 0, signedCount: 0, declinedCount: 0 };
  for (const sheet of sheets) {
    const status = sheet.status ?? "received";
    if (status === "declined") {
      summary.declinedCount += 1;
      continue;
    }
    summary.count += 1;
    summary.totalRands += sheet.dealValueRands;
    if (status === "signed") {
      summary.signedRands += sheet.dealValueRands;
      summary.signedCount += 1;
    }
  }
  return summary;
}

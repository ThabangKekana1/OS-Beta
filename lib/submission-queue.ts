/**
 * Submission queue, batch manifests and SLA clocks — pure functions only.
 *
 * This module is the calculation core of the operator console (doc 06 §3.2):
 * the drum is the weekly external submission capacity, the buffer is the
 * submission-ready queue, and the SLA clock protects every consumed slot.
 * Nothing in here touches the network or the database; every function is a
 * pure derivation so it can be unit-tested and reused by routes and views.
 *
 * Confidentiality: escalation drafts are partner-facing text. They cite only
 * the dealer agreement's own service level (cl. 4.2.1) and never reference
 * internal pricing, margins or negotiation strategy.
 */

export const FUNDER_SLA_DAYS = 7;
/** Day on which the polite escalation draft becomes available (doc 06 §3.2). */
export const SLA_ESCALATION_DAY = 5;
/** Day on which the formal breach note becomes available (cl. 4.2.1 + 1). */
export const SLA_BREACH_DAY = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Readiness classification (the queue's three shelves)                */
/* ------------------------------------------------------------------ */

export type SubmissionReadinessTier = "signed_ready" | "bankable" | "blocked";

/** Minimal case facts the classifier needs — all already held on the case. */
export type SubmissionReadinessInput = {
  stage: string;
  eoiSignedAt: string | null;
  /** Six-item KYC readiness attestation confirmed (S7 gate). */
  kycReadinessConfirmedAt: string | null;
  /** Readiness record parked with a Fix-It plan. */
  readinessParked: boolean;
  /** Client returned the signed funder proposal in-platform (submitted_by_client). */
  signedFunderProposalAt: string | null;
  submittedToFunderAt: string | null;
  hasBillPack: boolean;
  hasProposal: boolean;
};

export type SubmissionReadiness = {
  tier: SubmissionReadinessTier;
  /** One line: exactly what is missing. Empty for submittable tiers. */
  blockedReason: string;
};

/**
 * Classifies an unsubmitted case onto one of the queue's three shelves:
 *
 * - `signed_ready` — the client has returned a signed funder proposal
 *   (document-signing status `submitted_by_client`). Highest priority: the
 *   funder is waiting on us, not the client.
 * - `bankable` — EOI signed and the six-item KYC readiness attestation
 *   confirmed. The Bankable-Pack Rule is satisfied; the case may consume a
 *   submission slot.
 * - `blocked` — everything else, with the single missing thing named.
 *
 * Already-submitted cases never appear on a shelf; they carry an SLA clock
 * instead (see `slaClock`).
 */
export function classifySubmissionReadiness(input: SubmissionReadinessInput): SubmissionReadiness {
  if (input.signedFunderProposalAt) {
    return { tier: "signed_ready", blockedReason: "" };
  }
  if (input.eoiSignedAt && input.kycReadinessConfirmedAt) {
    return { tier: "bankable", blockedReason: "" };
  }
  return { tier: "blocked", blockedReason: submissionBlockedReason(input) };
}

/** Names the ONE thing stopping this case from consuming a submission slot. */
function submissionBlockedReason(input: SubmissionReadinessInput): string {
  if (!input.hasBillPack) return "No complete bill pack — six recognised billing periods are required first.";
  if (input.stage === "bill_pack_processing") return "Bill pack still processing — audit has not completed.";
  if (input.stage === "bill_pack_review") return "Bill pack in review — evidence blockers must be cleared.";
  if (!input.hasProposal) return "No proposal yet — the bill-audited proposal must be generated.";
  if (!input.eoiSignedAt) return "EOI not signed — the non-binding Expression of Interest is outstanding.";
  if (input.readinessParked) return "KYC readiness parked — Fix-It plan open, reassess on the recorded date.";
  if (!input.kycReadinessConfirmedAt) return "KYC readiness not confirmed — the six-item attestation is outstanding.";
  return "Not yet bankable — check the case timeline.";
}

/* ------------------------------------------------------------------ */
/* Batch manifests (numbered — nothing silently disappears, §3.2)      */
/* ------------------------------------------------------------------ */

export type ManifestEntryInput = {
  caseId: string;
  reference: string;
  businessName: string;
  siteCity: string;
  province: string;
  channel: "eden_ufms" | "awaken_wheeling" | "both";
  eoiSignedAt: string | null;
  kycReadinessConfirmedAt: string | null;
  signedFunderProposalAt: string | null;
  recognisedBillingPeriods: number | null;
  coveredDays: number | null;
};

export type SubmissionManifestEntry = ManifestEntryInput & {
  /** 1-based line number inside the batch. */
  line: number;
};

export type SubmissionManifest = {
  version: "submission-manifest-2026-08.1";
  batchReference: string;
  generatedAt: string;
  submittedBy: string;
  slaDays: number;
  slaDueAt: string;
  caseCount: number;
  entries: SubmissionManifestEntry[];
};

/**
 * Builds the next numbered batch reference for a submission day:
 * `F1-SUB-20260816-01`, `-02`, … Sequence continues from any references
 * already issued that day, so re-running a batch never reuses a number.
 */
export function nextBatchReference(now: Date, existingReferences: string[]): string {
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("");
  const prefix = `F1-SUB-${stamp}-`;
  let highest = 0;
  for (const reference of existingReferences) {
    if (!reference?.startsWith(prefix)) continue;
    const sequence = Number.parseInt(reference.slice(prefix.length), 10);
    if (Number.isInteger(sequence) && sequence > highest) highest = sequence;
  }
  return `${prefix}${String(highest + 1).padStart(2, "0")}`;
}

/** SLA due date for a submission made at `submittedAt`. */
export function slaDueAt(submittedAt: string, slaDays = FUNDER_SLA_DAYS): string {
  return new Date(new Date(submittedAt).getTime() + slaDays * DAY_MS).toISOString();
}

/** Assembles the numbered manifest that is stored on every case in the batch. */
export function buildSubmissionManifest(input: {
  batchReference: string;
  generatedAt: string;
  submittedBy: string;
  slaDays?: number;
  entries: ManifestEntryInput[];
}): SubmissionManifest {
  const slaDays = input.slaDays ?? FUNDER_SLA_DAYS;
  return {
    version: "submission-manifest-2026-08.1",
    batchReference: input.batchReference,
    generatedAt: input.generatedAt,
    submittedBy: input.submittedBy,
    slaDays,
    slaDueAt: slaDueAt(input.generatedAt, slaDays),
    caseCount: input.entries.length,
    entries: input.entries.map((entry, index) => ({ ...entry, line: index + 1 })),
  };
}

/** Renders the manifest as the plain-text artefact that travels with the batch. */
export function renderManifestText(manifest: SubmissionManifest): string {
  const dateLabel = new Date(manifest.generatedAt).toISOString().slice(0, 10);
  const dueLabel = new Date(manifest.slaDueAt).toISOString().slice(0, 10);
  const lines: string[] = [
    "FOUNDATION-1 (PTY) LTD — FUNDER SUBMISSION MANIFEST",
    `Batch:        ${manifest.batchReference}`,
    `Submitted:    ${dateLabel} by ${manifest.submittedBy}`,
    `Cases:        ${manifest.caseCount}`,
    `Service level: response due within ${manifest.slaDays} days (${dueLabel}) — dealer agreement cl. 4.2.1`,
    "",
  ];
  for (const entry of manifest.entries) {
    const channel = entry.channel === "both" ? "Eden/UFMS + Awaken wheeling" : entry.channel === "awaken_wheeling" ? "Awaken wheeling" : "Eden/UFMS";
    lines.push(
      `${String(entry.line).padStart(2, "0")}. ${entry.reference} — ${entry.businessName} (${entry.siteCity}, ${entry.province})`,
      `    Channel: ${channel}`,
      `    EOI signed: ${entry.eoiSignedAt ? entry.eoiSignedAt.slice(0, 10) : "—"} · KYC readiness: ${entry.kycReadinessConfirmedAt ? entry.kycReadinessConfirmedAt.slice(0, 10) : "—"}${entry.signedFunderProposalAt ? ` · signed funder proposal: ${entry.signedFunderProposalAt.slice(0, 10)}` : ""}`,
      `    Bill evidence: ${entry.recognisedBillingPeriods ?? "—"}/6 recognised periods · ${entry.coveredDays ?? "—"} covered days`,
      "",
    );
  }
  lines.push("Please acknowledge receipt of this batch by return email, quoting the batch reference.");
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* SLA clocks (cl. 4.2.1 — 7 days; escalate day 5, breach day 8)       */
/* ------------------------------------------------------------------ */

export type SlaPhase = "waiting" | "escalate" | "breach" | "acknowledged_overdue";

export type SlaClock = {
  /** Whole days elapsed since submission. Day 0 is the submission day. */
  dayNumber: number;
  /** Days remaining until the due date; negative once overdue. */
  daysRemaining: number;
  overdue: boolean;
  phase: SlaPhase;
  /** True from day 5: the polite escalation draft should be prepared. */
  escalationDue: boolean;
  /** True from day 8: the formal breach note should be prepared. */
  breachDue: boolean;
};

/**
 * The SLA day math. Day numbering is calendar-simple: `dayNumber` is the
 * count of whole 24-hour periods since submission (day 0 = submission day),
 * so day 5 and day 8 match the operating policy in doc 06 §3.2 exactly.
 * An acknowledgement does not stop the clock — cl. 4.2.1 runs from
 * submission — but it is surfaced so the operator escalates with context.
 */
export function slaClock(input: {
  submittedAt: string;
  slaDays?: number;
  acknowledgedAt?: string | null;
  now: number | Date;
}): SlaClock {
  const nowMs = input.now instanceof Date ? input.now.getTime() : input.now;
  const submittedMs = new Date(input.submittedAt).getTime();
  const slaDays = input.slaDays ?? FUNDER_SLA_DAYS;
  const dayNumber = Math.max(0, Math.floor((nowMs - submittedMs) / DAY_MS));
  const daysRemaining = slaDays - dayNumber;
  const overdue = nowMs > submittedMs + slaDays * DAY_MS;
  const breachDue = dayNumber >= SLA_BREACH_DAY;
  const escalationDue = dayNumber >= SLA_ESCALATION_DAY;
  const phase: SlaPhase = breachDue
    ? (input.acknowledgedAt ? "acknowledged_overdue" : "breach")
    : escalationDue
      ? "escalate"
      : "waiting";
  return { dayNumber, daysRemaining, overdue, phase, escalationDue, breachDue };
}

/* ------------------------------------------------------------------ */
/* Escalation drafts — operator sends manually; never auto-sent        */
/* ------------------------------------------------------------------ */

export type EscalationDraftKind = "day5_escalation" | "day8_breach";

export type EscalationDraft = {
  kind: EscalationDraftKind;
  subject: string;
  body: string[];
};

export type EscalationDraftInput = {
  reference: string;
  businessName: string;
  submittedAt: string;
  slaDueAt: string;
  batchReference: string | null;
  channel: string;
  dayNumber: number;
  operatorName?: string | null;
};

function longDate(value: string) {
  return new Date(value).toLocaleDateString("en-ZA", { dateStyle: "long" });
}

/**
 * Drafts the funder follow-up. Day 5 is a polite nudge inside the service
 * level; day 8 is a formal breach note for the record (and the leverage
 * ledger). The system NEVER sends these — the operator copies the draft into
 * their own mail client, reviews, and sends.
 */
export function buildSlaEscalationDraft(kind: EscalationDraftKind, input: EscalationDraftInput): EscalationDraft {
  const batchLine = input.batchReference ? ` under batch ${input.batchReference}` : "";
  const signOff = ["Kind regards,", input.operatorName?.trim() || "Karman Kekana", "Foundation-1 (Pty) Ltd"];

  if (kind === "day5_escalation") {
    return {
      kind,
      subject: `Follow-up: submission ${input.reference} — response due ${longDate(input.slaDueAt)}`,
      body: [
        "Good day,",
        "",
        `A complete application pack for ${input.businessName} (our reference ${input.reference}) was submitted on ${longDate(input.submittedAt)}${batchLine}.`,
        "",
        `We are now on day ${input.dayNumber} of the seven-day proposal turnaround provided for in the dealer agreement (clause 4.2.1), with the response due by ${longDate(input.slaDueAt)}.`,
        "",
        "Could you confirm the pack is in process and on track for the due date? If anything in the pack needs clarifying, we will turn it around the same day.",
        "",
        ...signOff,
      ],
    };
  }

  return {
    kind: "day8_breach",
    subject: `Formal notice: submission ${input.reference} — cl. 4.2.1 turnaround exceeded`,
    body: [
      "Good day,",
      "",
      `This is a formal record that the proposal turnaround for ${input.businessName} (our reference ${input.reference}) has been exceeded.`,
      "",
      `The complete pack was submitted on ${longDate(input.submittedAt)}${batchLine}. Clause 4.2.1 of the dealer agreement provides for a proposal within seven days; that period expired on ${longDate(input.slaDueAt)} and we are now on day ${input.dayNumber} without a response.`,
      "",
      "We ask that the proposal be issued, or a firm issue date confirmed in writing, within two business days. The client has been told a response is being chased on their behalf, and this delay is being recorded against the submission.",
      "",
      "We remain ready to resolve any query on the pack immediately.",
      "",
      ...signOff,
    ],
  };
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSlaEscalationDraft,
  buildSubmissionManifest,
  classifySubmissionReadiness,
  FUNDER_SLA_DAYS,
  nextBatchReference,
  renderManifestText,
  slaClock,
  slaDueAt,
} from "../lib/submission-queue.ts";
import {
  buildDailyWorklist,
  daysBetween,
  stageEnteredAt,
  summariseDealBook,
} from "../lib/worklist.ts";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-08-18T08:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();

/* ------------------------------------------------------------------ */
/* Submission queue readiness                                          */
/* ------------------------------------------------------------------ */

const baseReadiness = {
  stage: "eoi_signed",
  eoiSignedAt: iso(T0 - 5 * DAY),
  kycReadinessConfirmedAt: null,
  readinessParked: false,
  signedFunderProposalAt: null,
  submittedToFunderAt: null,
  hasBillPack: true,
  hasProposal: true,
};

test("a case with a client-signed funder proposal is signed_ready above all else", () => {
  const result = classifySubmissionReadiness({
    ...baseReadiness,
    signedFunderProposalAt: iso(T0 - DAY),
  });
  assert.equal(result.tier, "signed_ready");
  assert.equal(result.blockedReason, "");
});

test("EOI + confirmed KYC readiness is bankable (the Bankable-Pack Rule)", () => {
  const result = classifySubmissionReadiness({
    ...baseReadiness,
    kycReadinessConfirmedAt: iso(T0 - 2 * DAY),
  });
  assert.equal(result.tier, "bankable");
});

test("blocked cases name exactly the one missing thing, one line each", () => {
  const missingEoi = classifySubmissionReadiness({ ...baseReadiness, eoiSignedAt: null });
  assert.equal(missingEoi.tier, "blocked");
  assert.match(missingEoi.blockedReason, /EOI not signed/);

  const missingReadiness = classifySubmissionReadiness(baseReadiness);
  assert.match(missingReadiness.blockedReason, /readiness not confirmed/i);

  const parked = classifySubmissionReadiness({ ...baseReadiness, readinessParked: true });
  assert.match(parked.blockedReason, /Fix-It/);

  const noBills = classifySubmissionReadiness({ ...baseReadiness, hasBillPack: false, hasProposal: false, eoiSignedAt: null, stage: "bill_pack_required" });
  assert.match(noBills.blockedReason, /bill pack/i);

  for (const reason of [missingEoi, missingReadiness, parked, noBills]) {
    assert.ok(!reason.blockedReason.includes("\n"), "blocked reason must be one line");
  }
});

/* ------------------------------------------------------------------ */
/* Batch manifest generation                                           */
/* ------------------------------------------------------------------ */

function manifestEntry(n) {
  return {
    caseId: `case-${n}`,
    reference: `F1-MC-00000${n}`,
    businessName: `Boerdery ${n}`,
    siteCity: "Bethlehem",
    province: "Free State",
    channel: "eden_ufms",
    eoiSignedAt: iso(T0 - 9 * DAY),
    kycReadinessConfirmedAt: iso(T0 - 3 * DAY),
    signedFunderProposalAt: null,
    recognisedBillingPeriods: 6,
    coveredDays: 182,
  };
}

test("batch references number sequentially within a submission day", () => {
  const day = new Date("2026-08-18T09:30:00.000Z");
  assert.equal(nextBatchReference(day, []), "F1-SUB-20260818-01");
  assert.equal(nextBatchReference(day, ["F1-SUB-20260818-01"]), "F1-SUB-20260818-02");
  assert.equal(
    nextBatchReference(day, ["F1-SUB-20260818-03", "F1-SUB-20260817-09", "junk", null]),
    "F1-SUB-20260818-04",
    "sequence continues from the highest reference of the SAME day only",
  );
});

test("the manifest numbers every case and carries the SLA due date", () => {
  const manifest = buildSubmissionManifest({
    batchReference: "F1-SUB-20260818-01",
    generatedAt: iso(T0),
    submittedBy: "karman@foundation-1.co.za",
    entries: [manifestEntry(1), manifestEntry(2), manifestEntry(3)],
  });
  assert.equal(manifest.caseCount, 3);
  assert.deepEqual(manifest.entries.map((entry) => entry.line), [1, 2, 3]);
  assert.equal(manifest.slaDays, FUNDER_SLA_DAYS);
  assert.equal(manifest.slaDueAt, iso(T0 + 7 * DAY));
  assert.equal(slaDueAt(iso(T0)), iso(T0 + 7 * DAY));
});

test("the manifest text artefact lists every numbered line and the SLA clause", () => {
  const manifest = buildSubmissionManifest({
    batchReference: "F1-SUB-20260818-01",
    generatedAt: iso(T0),
    submittedBy: "karman@foundation-1.co.za",
    entries: [manifestEntry(1), manifestEntry(2)],
  });
  const text = renderManifestText(manifest);
  assert.match(text, /F1-SUB-20260818-01/);
  assert.match(text, /01\. F1-MC-000001 — Boerdery 1/);
  assert.match(text, /02\. F1-MC-000002 — Boerdery 2/);
  assert.match(text, /cl\. 4\.2\.1/);
  assert.match(text, /6\/6 recognised periods/);
  assert.match(text, /acknowledge receipt/i);
});

/* ------------------------------------------------------------------ */
/* SLA day math                                                        */
/* ------------------------------------------------------------------ */

test("SLA day math: day 0 on submission, escalate day 5, breach day 8", () => {
  const submittedAt = iso(T0);
  const at = (days) => slaClock({ submittedAt, now: T0 + days * DAY });

  assert.equal(at(0).dayNumber, 0);
  assert.equal(at(0).phase, "waiting");
  assert.equal(at(4.99).dayNumber, 4);
  assert.equal(at(4.99).escalationDue, false);
  assert.equal(at(5).dayNumber, 5);
  assert.equal(at(5).phase, "escalate");
  assert.equal(at(5).escalationDue, true);
  assert.equal(at(7).overdue, false, "day 7 is the due day, not yet overdue");
  assert.equal(at(7).daysRemaining, 0);
  assert.equal(at(7.5).overdue, true);
  assert.equal(at(8).phase, "breach");
  assert.equal(at(8).breachDue, true);
  assert.equal(at(8).daysRemaining, -1);
});

test("an acknowledgement never stops the cl. 4.2.1 clock", () => {
  const clock = slaClock({
    submittedAt: iso(T0),
    acknowledgedAt: iso(T0 + DAY),
    now: T0 + 9 * DAY,
  });
  assert.equal(clock.breachDue, true);
  assert.equal(clock.phase, "acknowledged_overdue");
});

test("escalation drafts: day 5 is polite, day 8 is a formal breach citing cl. 4.2.1", () => {
  const input = {
    reference: "F1-MC-000001",
    businessName: "Boerdery 1",
    submittedAt: iso(T0),
    slaDueAt: iso(T0 + 7 * DAY),
    batchReference: "F1-SUB-20260818-01",
    channel: "eden_ufms",
    dayNumber: 5,
  };
  const day5 = buildSlaEscalationDraft("day5_escalation", input);
  const day5Text = day5.body.join("\n");
  assert.match(day5Text, /clause 4\.2\.1/);
  assert.match(day5Text, /Could you confirm/i, "day 5 asks, it does not accuse");
  assert.ok(!/formal|breach/i.test(day5Text), "day 5 must stay polite");

  const day8 = buildSlaEscalationDraft("day8_breach", { ...input, dayNumber: 8 });
  assert.match(day8.subject, /Formal notice/);
  assert.match(day8.body.join("\n"), /Clause 4\.2\.1/);
  assert.match(day8.body.join("\n"), /day 8/);

  // Partner-facing text: confidential internals must never leak into drafts.
  for (const text of [day5Text, day8.body.join("\n"), day5.subject, day8.subject]) {
    assert.ok(!/pricing engine|1\.5969|margin|leverage/i.test(text));
  }
});

/* ------------------------------------------------------------------ */
/* Daily worklist ordering                                             */
/* ------------------------------------------------------------------ */

function caseInput(overrides) {
  return {
    caseId: overrides.caseId ?? "case-x",
    reference: overrides.reference ?? "F1-MC-X",
    businessName: overrides.businessName ?? "Case X",
    stage: "bill_pack_required",
    createdAt: iso(T0 - 20 * DAY),
    updatedAt: iso(T0 - 10 * DAY),
    proposalReadyAt: null,
    eoiSignedAt: null,
    kycReadinessConfirmedAt: null,
    submittedToFunderAt: null,
    kycPackCompleteAt: null,
    kycVerifiedAt: null,
    kycHandedOffAt: null,
    termSheetIssuedAt: null,
    partnerProposalReadyAt: null,
    partnerProposalSignedAt: null,
    hasBillPack: false,
    hasProposal: false,
    readinessStatus: null,
    readinessReassessOn: null,
    signedFunderProposalAt: null,
    submissionPending: false,
    submissionSubmittedAt: null,
    submissionSlaDays: null,
    submissionAcknowledgedAt: null,
    kycPackComplete: false,
    ...overrides,
  };
}

test("worklist orders group 1 (drum) before group 2 (near-bankable) before group 3", () => {
  const breached = caseInput({
    caseId: "breached", reference: "F1-MC-BREACH", stage: "submitted_to_funder",
    hasBillPack: true, hasProposal: true,
    eoiSignedAt: iso(T0 - 20 * DAY), kycReadinessConfirmedAt: iso(T0 - 15 * DAY),
    submittedToFunderAt: iso(T0 - 9 * DAY),
    submissionPending: true, submissionSubmittedAt: iso(T0 - 9 * DAY), submissionSlaDays: 7,
  });
  const bankable = caseInput({
    caseId: "bankable", reference: "F1-MC-BANK", stage: "kyc_ready",
    hasBillPack: true, hasProposal: true,
    eoiSignedAt: iso(T0 - 6 * DAY), kycReadinessConfirmedAt: iso(T0 - 2 * DAY),
  });
  const nearBankable = caseInput({
    caseId: "near", reference: "F1-MC-NEAR", stage: "eoi_signed",
    hasBillPack: true, hasProposal: true, eoiSignedAt: iso(T0 - 4 * DAY),
  });
  const cold = caseInput({ caseId: "cold", reference: "F1-MC-COLD" });

  const rows = buildDailyWorklist([cold, nearBankable, bankable, breached], T0);
  assert.deepEqual(rows.map((row) => row.caseId), ["breached", "bankable", "near", "cold"]);
  assert.deepEqual(rows.map((row) => row.group), [1, 1, 2, 3]);
});

test("inside group 1, an SLA breach outranks a fresh ready-to-submit case", () => {
  const ready = caseInput({
    caseId: "ready", stage: "kyc_ready", hasBillPack: true, hasProposal: true,
    eoiSignedAt: iso(T0 - 30 * DAY), kycReadinessConfirmedAt: iso(T0 - 25 * DAY),
  });
  const breached = caseInput({
    caseId: "breached", stage: "submitted_to_funder", hasBillPack: true, hasProposal: true,
    eoiSignedAt: iso(T0 - 20 * DAY), kycReadinessConfirmedAt: iso(T0 - 15 * DAY),
    submittedToFunderAt: iso(T0 - 8 * DAY),
    submissionPending: true, submissionSubmittedAt: iso(T0 - 8 * DAY), submissionSlaDays: 7,
  });
  const rows = buildDailyWorklist([ready, breached], T0);
  assert.equal(rows[0].caseId, "breached", "the breach comes first even though ready waited longer");
  assert.match(rows[0].nextAction, /breach note/);
  assert.equal(rows[0].sla?.breachDue, true);
});

test("every worklist row names exactly one next action and an owner", () => {
  const inputs = [
    caseInput({ caseId: "a" }),
    caseInput({ caseId: "b", stage: "bill_pack_review", hasBillPack: true }),
    caseInput({ caseId: "c", stage: "proposal_ready", hasBillPack: true, hasProposal: true, proposalReadyAt: iso(T0 - 3 * DAY) }),
    caseInput({ caseId: "d", stage: "eoi_signed", hasBillPack: true, hasProposal: true, eoiSignedAt: iso(T0 - DAY) }),
    caseInput({ caseId: "e", stage: "kyc_verified", hasBillPack: true, hasProposal: true, eoiSignedAt: iso(T0 - 9 * DAY), kycVerifiedAt: iso(T0 - DAY), kycPackComplete: true }),
  ];
  for (const row of buildDailyWorklist(inputs, T0)) {
    assert.ok(row.nextAction.length > 10, `${row.caseId} has no real next action`);
    assert.ok(["Foundation-1", "Client", "Funder"].includes(row.owner));
    assert.ok(Number.isInteger(row.daysInStage) && row.daysInStage >= 0);
  }
});

test("a parked Fix-It case surfaces into group 2 only once its reassess date arrives", () => {
  const base = {
    stage: "eoi_signed", hasBillPack: true, hasProposal: true,
    eoiSignedAt: iso(T0 - 10 * DAY), readinessStatus: "parked",
  };
  const due = caseInput({ caseId: "due", ...base, readinessReassessOn: "2026-08-17" });
  const notDue = caseInput({ caseId: "notDue", ...base, readinessReassessOn: "2026-09-15" });
  const rows = buildDailyWorklist([due, notDue], T0);
  assert.equal(rows.find((row) => row.caseId === "due").group, 2);
  assert.equal(rows.find((row) => row.caseId === "notDue").group, 3);
});

test("days-in-stage derives from the stage's own timestamp", () => {
  const input = caseInput({
    stage: "eoi_signed",
    eoiSignedAt: iso(T0 - 6 * DAY),
    updatedAt: iso(T0 - DAY),
  });
  assert.equal(stageEnteredAt(input), iso(T0 - 6 * DAY));
  assert.equal(daysBetween(stageEnteredAt(input), T0), 6);
  const fallback = caseInput({ stage: "bill_pack_required", updatedAt: iso(T0 - 3 * DAY) });
  assert.equal(daysBetween(stageEnteredAt(fallback), T0), 3, "stages without a timestamp fall back to updated_at");
});

/* ------------------------------------------------------------------ */
/* Deal book                                                           */
/* ------------------------------------------------------------------ */

test("the deal book counts received + signed sheets and drops declined ones", () => {
  const summary = summariseDealBook([
    { dealValueRands: 2_000_000, status: "signed" },
    { dealValueRands: 1_500_000, status: "received" },
    { dealValueRands: 900_000, status: null },       // pre-migration row → received
    { dealValueRands: 5_000_000, status: "declined" },
  ]);
  assert.equal(summary.count, 3);
  assert.equal(summary.totalRands, 4_400_000);
  assert.equal(summary.signedRands, 2_000_000);
  assert.equal(summary.signedCount, 1);
  assert.equal(summary.declinedCount, 1);
});

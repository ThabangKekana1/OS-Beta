import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLearningLoopInsights,
  buildWeeklyBrief,
  computeFunnelMetrics,
  deriveFunderReportCorrectionEntries,
  isoWeekStart,
  median,
  pickConstraintOfTheWeek,
  summarizeEngineCalibration,
  summarizeReaderCorrections,
} from "../lib/intelligence/learning-loop.ts";
import { buildImprovementInsights } from "../lib/intelligence/improvement-engine.ts";
import { FUNDER_CONSTANTS } from "../lib/pricing-engine.ts";

/* ------------------------------------------------------------------ */
/* Helpers and fixtures.                                                */
/* ------------------------------------------------------------------ */

const NOW = "2026-08-31T00:00:00.000Z"; // a Monday

function caseLite(overrides = {}) {
  return {
    id: "case",
    reference: "F1-0000",
    businessName: "Client",
    stage: "bill_pack_required",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    packCompletedAt: null,
    proposalReadyAt: null,
    eoiSignedAt: null,
    kycReadinessConfirmedAt: null,
    submittedToFunderAt: null,
    partnerProposalReadyAt: null,
    partnerProposalSignedAt: null,
    kycHandedOffAt: null,
    termSheetIssuedAt: null,
    ...overrides,
  };
}

const FUNNEL_FIXTURE = {
  windowDays: 28,
  now: NOW,
  reportsGenerated: 280,
  casesOpened: 80,
  cases: [
    caseLite({
      id: "a",
      reference: "F1-A",
      businessName: "Alpha Farms",
      stage: "kyc_ready",
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
      packCompletedAt: "2026-08-06T00:00:00.000Z",
      proposalReadyAt: "2026-08-06T12:00:00.000Z",
      eoiSignedAt: "2026-08-08T00:00:00.000Z",
      kycReadinessConfirmedAt: "2026-08-10T00:00:00.000Z",
    }),
    caseLite({
      id: "b",
      reference: "F1-B",
      businessName: "Bravo Boerdery",
      stage: "proposal_ready",
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
      packCompletedAt: "2026-08-09T00:00:00.000Z",
      proposalReadyAt: "2026-08-10T00:00:00.000Z",
    }),
    caseLite({
      id: "c",
      reference: "F1-C",
      businessName: "Charlie Sitrus",
      stage: "bill_pack_required",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    }),
    caseLite({
      id: "d",
      reference: "F1-D",
      businessName: "Delta Koöp",
      stage: "bill_pack_review",
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-27T00:00:00.000Z",
      packCompletedAt: "2026-08-27T00:00:00.000Z",
    }),
  ],
  submissions: [
    { submittedAt: "2026-08-04T00:00:00.000Z", outcome: "proposal_received", outcomeAt: "2026-08-10T00:00:00.000Z" },
    { submittedAt: "2026-08-05T00:00:00.000Z", outcome: "proposal_received", outcomeAt: "2026-08-13T00:00:00.000Z" },
    { submittedAt: "2026-08-06T00:00:00.000Z", outcome: "declined", outcomeAt: "2026-08-12T00:00:00.000Z" },
    { submittedAt: "2026-08-25T00:00:00.000Z", outcome: "pending", outcomeAt: null },
  ],
  termSheets: [
    { issuedAt: "2026-08-20T00:00:00.000Z", dealValueRands: 3_000_000 },
    { issuedAt: "2026-08-28T00:00:00.000Z", dealValueRands: 2_500_000 },
  ],
  rampStart: "2026-08-01",
};

function metric(result, key) {
  const found = result.metrics.find((item) => item.key === key);
  assert.ok(found, `metric ${key} exists`);
  return found;
}

/* ------------------------------------------------------------------ */
/* Funnel metrics math (doc 06 §7).                                     */
/* ------------------------------------------------------------------ */

test("funnel metrics implement the doc 06 §7 table with targets and alarms", () => {
  const result = computeFunnelMetrics(FUNNEL_FIXTURE);
  assert.equal(result.metrics.length, 12);

  const reports = metric(result, "reports_per_week");
  assert.equal(reports.value, 70);
  assert.equal(reports.status, "green");

  const reportToCase = metric(result, "report_to_case");
  assert.equal(reportToCase.value, 28.6);
  assert.equal(reportToCase.status, "green");

  const pack = metric(result, "case_to_pack");
  assert.equal(pack.value, 75); // 3 of 4
  assert.equal(pack.status, "green"); // median 3 days ≤ 7
  assert.match(pack.display, /median 3d/);

  const proposal = metric(result, "pack_to_proposal");
  assert.equal(proposal.value, 66.7); // 2 of 3 packs
  assert.equal(proposal.status, "amber"); // yield below 85, p50 18h fine
  assert.match(proposal.display, /p50 18h/);

  const eoi = metric(result, "proposal_to_eoi");
  assert.equal(eoi.value, 50);
  assert.equal(eoi.status, "amber");

  const readiness = metric(result, "eoi_to_readiness");
  assert.equal(readiness.value, 100);
  assert.equal(readiness.status, "green");

  const firstPass = metric(result, "submission_first_pass");
  assert.equal(firstPass.value, 66.7); // 2 of 3 decided
  assert.equal(firstPass.status, "red"); // any bounce is an alarm

  const sla = metric(result, "submission_sla");
  assert.equal(sla.value, 7); // median of 6 and 8 days
  assert.equal(sla.status, "green");

  assert.equal(metric(result, "proposal_to_signature").status, "no_data");
  assert.equal(metric(result, "handoff_to_term_sheet").status, "no_data");

  const dealBook = metric(result, "deal_book");
  assert.equal(dealBook.value, 5_500_000);
  assert.equal(dealBook.status, "green"); // month 1 ramp target R3m

  const buffer = metric(result, "submission_buffer");
  assert.equal(result.weeklyDrum, 1); // 4 submissions / 4 weeks
  assert.equal(result.queueSize, 1); // case A is kyc_ready
  assert.equal(buffer.status, "amber"); // 1.0× drum: alive but thin
});

test("funnel alarms go red at the doc 06 §7 thresholds", () => {
  const result = computeFunnelMetrics({
    ...FUNNEL_FIXTURE,
    reportsGenerated: 100, // 25/week < 40
    casesOpened: 10, // 10% < 15%
    submissions: [
      { submittedAt: "2026-08-01T00:00:00.000Z", outcome: "proposal_received", outcomeAt: "2026-08-13T00:00:00.000Z" },
    ],
  });
  assert.equal(metric(result, "reports_per_week").status, "red");
  assert.equal(metric(result, "report_to_case").status, "red");
  assert.equal(metric(result, "submission_sla").status, "red"); // 12 days > 10
  assert.equal(metric(result, "submission_first_pass").status, "green"); // no bounce
});

test("stuck-case list names the case, stage, days and blocking item", () => {
  const result = computeFunnelMetrics(FUNNEL_FIXTURE);
  assert.deepEqual(
    result.stuckCases.map((item) => [item.reference, item.stage, item.days]),
    [
      ["F1-A", "kyc_ready", 21],
      ["F1-B", "proposal_ready", 21],
      ["F1-C", "bill_pack_required", 11],
    ],
  );
  assert.match(result.stuckCases[0].blockingItem, /submission-ready queue/);
  assert.match(result.stuckCases[1].blockingItem, /EOI signature/);
  assert.match(result.stuckCases[2].blockingItem, /bill upload/);
});

/* ------------------------------------------------------------------ */
/* Engine calibration drift rule.                                       */
/* ------------------------------------------------------------------ */

function calibrationRow(overrides = {}) {
  return {
    created_at: "2026-08-01T00:00:00.000Z",
    case_reference: "F1-X",
    source: "ufms",
    field: "monthlyCharge",
    predicted: 100_000,
    stated: 103_000,
    deviation_pct: 3,
    tolerance_pct: 2,
    pass: false,
    report_version: "funder-report-2026-08-09.1",
    operator_confirmed: false,
    ...overrides,
  };
}

function driftLedger() {
  const rows = [];
  for (let index = 0; index < 5; index += 1) {
    rows.push(
      calibrationRow({
        case_reference: `F1-${index}`,
        created_at: `2026-08-0${index + 1}T00:00:00.000Z`,
      }),
    );
    // A stale re-run per case with a wild number: latest row must win.
    rows.push(
      calibrationRow({
        case_reference: `F1-${index}`,
        created_at: `2026-07-0${index + 1}T00:00:00.000Z`,
        stated: 150_000,
        deviation_pct: 50,
      }),
    );
  }
  return rows;
}

test("calibration drift: p50 deviation > 2% over the last 5 proposals flags the constant", () => {
  const summaries = summarizeEngineCalibration(driftLedger());
  assert.equal(summaries.length, 1);
  const summary = summaries[0];
  assert.equal(summary.sampleCases, 5);
  assert.equal(summary.rollingP50DeviationPct, 3); // stale re-runs ignored
  assert.equal(summary.drift, true);
  assert.equal(summary.constantName, "FUNDER_CONSTANTS.ufmsMonthlyRateFactor");
  assert.equal(summary.medianStatedOverPredicted, 1.03);
  assert.ok(
    Math.abs(summary.suggestedConstant - FUNDER_CONSTANTS.ufmsMonthlyRateFactor * 1.03) < 1e-6,
  );
});

test("calibration drift needs a full window and a breach", () => {
  // Only 4 proposals: no drift call yet.
  const short = summarizeEngineCalibration(driftLedger().slice(0, 8));
  assert.equal(short[0].drift, false);

  // Five proposals inside tolerance: no drift.
  const calm = summarizeEngineCalibration(
    Array.from({ length: 5 }, (_, index) =>
      calibrationRow({
        case_reference: `F1-${index}`,
        created_at: `2026-08-0${index + 1}T00:00:00.000Z`,
        stated: 100_500,
        deviation_pct: 0.5,
      }),
    ),
  );
  assert.equal(calm[0].drift, false);
  assert.equal(calm[0].suggestedConstant, null);
});

test("drift surfaces as a deterministic improvement insight with the suggested constant", () => {
  const insights = buildLearningLoopInsights({
    calibrationRows: driftLedger(),
    correctionRows: [],
    environment: "test",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
  });
  assert.equal(insights.length, 1);
  const insight = insights[0];
  assert.equal(insight.insightKey, "funder_pricing_drift_ufms_monthlyCharge");
  assert.equal(insight.headline, "Funder pricing model drift: monthlyCharge");
  assert.equal(insight.category, "data_quality");
  assert.match(insight.recommendation, /FUNDER_CONSTANTS\.ufmsMonthlyRateFactor/);
  assert.match(insight.recommendation, /never automatic/);
  assert.equal(insight.metrics.rolling_p50_deviation_pct, 3);
});

test("the existing improvement engine carries the learning-loop rules", () => {
  const insights = buildImprovementInsights({
    events: [],
    graphRuns: [],
    environment: "test",
    periodEnd: new Date("2026-08-31T00:00:00.000Z"),
    days: 30,
    calibrationRows: driftLedger(),
    correctionRows: [],
  });
  assert.ok(
    insights.some((item) => item.insightKey === "funder_pricing_drift_ufms_monthlyCharge"),
  );
  // Existing behaviour is untouched: the low-sample data-quality insight remains.
  assert.ok(insights.some((item) => item.insightKey === "insufficient_behavior_sample"));
});

/* ------------------------------------------------------------------ */
/* Reader correction capture.                                           */
/* ------------------------------------------------------------------ */

function correctionRow(overrides = {}) {
  return {
    created_at: "2026-08-10T00:00:00.000Z",
    case_reference: "F1-A",
    source: "funder_report",
    field: "ufmsMonthlyCharge",
    original_value: 100_000,
    corrected_value: 103_000,
    corrected_by: "operator@foundation-1.co.za",
    ...overrides,
  };
}

test("per-field correction rate surfaces the top-corrected field", () => {
  const rows = [
    correctionRow(),
    correctionRow({ case_reference: "F1-B" }),
    correctionRow({ case_reference: "F1-C" }),
    correctionRow({ field: "pvKwp", case_reference: "F1-A" }),
  ];
  const summary = summarizeReaderCorrections(rows);
  assert.equal(summary.total, 4);
  assert.equal(summary.cases, 3);
  assert.equal(summary.topField.field, "ufmsMonthlyCharge");
  assert.equal(summary.topField.corrections, 3);
  assert.equal(summary.topField.sharePct, 75);

  const insights = buildLearningLoopInsights({
    calibrationRows: [],
    correctionRows: rows,
    environment: "test",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
  });
  assert.equal(insights.length, 1);
  assert.equal(insights[0].insightKey, "reader_top_corrected_field");
  assert.match(insights[0].headline, /ufmsMonthlyCharge/);
});

test("corrections become labelled examples only when they change the machine's value", () => {
  const previous = {
    ufmsExtraction: {
      monthlyChargeExVat: { value: 100_000, confidence: "high" },
      contractEscalationPct: { value: 6, confidence: "high" },
      termYears: { value: 10, confidence: "high" },
      pvKwp: { value: 100, confidence: "high" },
      bessKwh: { value: 100, confidence: "medium" },
      generationKwhPerMonth: { value: 17_000, confidence: "medium" },
    },
    wheelingFields: { firmRatePerKwh: 1.85, escalationCapPct: 6, termYears: 10 },
  };
  const entries = deriveFunderReportCorrectionEntries(previous, {
    ufmsMonthlyCharge: 103_000, // changed -> captured
    pvKwp: 100, // identical -> confirmation, not a correction
    wheelingRatePerKwh: 1.65, // changed -> captured
  });
  assert.deepEqual(entries, [
    { field: "ufmsMonthlyCharge", originalValue: 100_000, correctedValue: 103_000 },
    { field: "wheelingRatePerKwh", originalValue: 1.85, correctedValue: 1.65 },
  ]);
  assert.deepEqual(deriveFunderReportCorrectionEntries(null, null), []);
});

/* ------------------------------------------------------------------ */
/* Weekly brief.                                                        */
/* ------------------------------------------------------------------ */

test("median and isoWeekStart are exact", () => {
  assert.equal(median([]), null);
  assert.equal(median([3]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(isoWeekStart(new Date("2026-08-31T00:00:00.000Z")), "2026-08-31"); // Monday
  assert.equal(isoWeekStart(new Date("2026-08-26T12:00:00.000Z")), "2026-08-24"); // Wednesday
  assert.equal(isoWeekStart(new Date("2026-08-30T23:59:59.000Z")), "2026-08-24"); // Sunday
});

test("constraint of the week is the highest-priority red metric", () => {
  const funnel = computeFunnelMetrics(FUNNEL_FIXTURE);
  const constraint = pickConstraintOfTheWeek(funnel.metrics);
  assert.equal(constraint.key, "submission_first_pass"); // the bounce outranks all
});

test("weekly brief is a deterministic markdown snapshot of the fixture", () => {
  const funnel = computeFunnelMetrics(FUNNEL_FIXTURE);
  const input = {
    generatedAt: NOW,
    weekStart: "2026-08-31",
    environment: "test",
    funnel,
    calibration: summarizeEngineCalibration(driftLedger()),
    corrections: summarizeReaderCorrections([
      correctionRow(),
      correctionRow({ case_reference: "F1-B" }),
    ]),
    acceptedInsights: [
      {
        headline: "Pricing visitors are not progressing into migration cases",
        recommendation: "Review the pricing result CTA.",
      },
    ],
  };
  const brief = buildWeeklyBrief(input);

  // Deterministic: same input, same markdown.
  assert.equal(brief, buildWeeklyBrief(input));

  const lines = brief.split("\n");
  assert.equal(lines[0], "# Foundation-1 weekly operating brief");
  assert.match(brief, /Week of 2026-08-31 · generated 2026-08-31T00:00:00\.000Z · environment test/);
  assert.match(brief, /INTERNAL — contains clone-engine calibration/);
  assert.match(brief, /Cumulative term-sheet value: \*\*R5[\s\u00a0.,]500[\s\u00a0.,]000\*\*/);
  assert.match(brief, /## Constraint of the week/);
  assert.match(brief, /\*\*Submission first-pass acceptance\*\* — 🔴 66\.7%/);
  assert.match(brief, /\| Reports \/ week \| 70 \| 70 \(ramping to 120\) \| < 40 \| 🟢 green \|/);
  assert.match(brief, /- F1-A \(Alpha Farms\) — 21d in kyc_ready: In submission-ready queue/);
  assert.match(brief, /ufms\.monthlyCharge: p50 deviation 3% over last 5 proposal\(s\) \*\*DRIFT\*\*/);
  assert.match(brief, /FUNDER_CONSTANTS\.ufmsMonthlyRateFactor/);
  assert.match(brief, /- 2 correction\(s\) across 2 case\(s\)\./);
  assert.match(brief, /- \[ \] Pricing visitors are not progressing into migration cases/);
});

test("weekly brief handles an empty platform without lying", () => {
  const funnel = computeFunnelMetrics({
    windowDays: 28,
    now: NOW,
    reportsGenerated: 0,
    casesOpened: 0,
    cases: [],
    submissions: [],
    termSheets: [],
  });
  const brief = buildWeeklyBrief({
    generatedAt: NOW,
    weekStart: "2026-08-31",
    environment: "test",
    funnel,
    calibration: [],
    corrections: summarizeReaderCorrections([]),
    acceptedInsights: [],
  });
  assert.match(brief, /No case has sat in a stage for 7\+ days\./);
  assert.match(brief, /No funder-report cross-checks recorded yet\./);
  assert.match(brief, /No operator corrections recorded/);
  assert.match(brief, /No accepted hypotheses awaiting implementation\./);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  proposalGateProgressIndex,
  proposalReportProgressIndex,
} from "../lib/proposal-progress.ts";

test("proposal gate reaches the EOI only after the complete bill assessment", () => {
  assert.equal(proposalGateProgressIndex(undefined), 1);
  assert.equal(proposalGateProgressIndex({
    signedEoi: false,
    recognisedBillingPeriods: 6,
    requiredBillingPeriods: 6,
  }), 3);
});

test("proposal gate advances through bills, assessment, and post-assessment EOI", () => {
  assert.equal(proposalGateProgressIndex({
    signedEoi: true,
    recognisedBillingPeriods: 5,
    requiredBillingPeriods: 6,
  }), 1);
  assert.equal(proposalGateProgressIndex({
    signedEoi: true,
    recognisedBillingPeriods: 6,
    requiredBillingPeriods: 6,
  }), 4);
});

test("populated report progress never marks mandate or document stages complete early", () => {
  assert.equal(proposalReportProgressIndex({ accepted: false, mandateSigned: false }), 3);
  assert.equal(proposalReportProgressIndex({ accepted: true, mandateSigned: false }), 4);
  assert.equal(proposalReportProgressIndex({ accepted: true, mandateSigned: true }), 5);
});
import assert from "node:assert/strict";
import test from "node:test";

import { buildLifecycleTemplate } from "../lib/case-lifecycle.ts";

const CASE = {
  id: "00000000-0000-4000-8000-000000000001",
  public_reference: "F1-MC-A1B2C3D4E5F6",
  business_name: "Vredefort Poultry 121",
  contact_name: "Archie Mahila",
  contact_email: "archie@example.co.za",
};

const PORTAL = "https://foundation-1.co.za/c/testtoken";

/** Every message a case can receive must render and name its next action. */
const ALL_KEYS = [
  "bill_pack_received",
  "proposal_ready",
  "proposal_gap",
  "bill_pack_needs_attention",
  "kyc_ready",
  "submitted_to_funder",
  "partner_proposal_ready",
  "partner_proposal_signed",
  "kyc_verified",
  "kyc_handed_off",
  "term_sheet_issued",
  "reminder_bill_pack_d1",
  "reminder_bill_pack_d3",
  "reminder_bill_pack_d7",
  "reminder_bill_pack_d14",
  "reminder_review_d2",
  "reminder_eoi_d3",
  "reminder_eoi_d7",
];

test("every lifecycle message renders with a subject, the reference and a working link", () => {
  for (const key of ALL_KEYS) {
    const built = buildLifecycleTemplate(key, CASE, PORTAL, {});
    assert.ok(built, `${key} has no template`);
    assert.ok(built.subject.includes(CASE.public_reference), `${key} subject omits the case reference`);
    assert.ok(built.subject.length <= 78, `${key} subject is too long for an inbox`);

    const body = built.body.join("\n");
    assert.ok(body.includes(PORTAL), `${key} body has no link back to the case`);
    assert.ok(body.startsWith("Hi Archie,"), `${key} does not greet the contact by first name`);
    assert.ok(!body.includes("undefined"), `${key} leaked an undefined value`);
    assert.ok(!body.includes("{token}"), `${key} leaked an unresolved token placeholder`);
  }
});

test("the proposal-ready message states the audited numbers rather than a generic nudge", () => {
  const built = buildLifecycleTemplate("proposal_ready", CASE, PORTAL, {
    monthlySaving: 8_921,
    tenYearDifference: 1_240_500,
  });
  const body = built.body.join("\n");
  // en-ZA groups thousands with a non-breaking space, not a comma.
  assert.match(body, /R8\s921/, "year-one movement is not quoted");
  assert.match(body, /R1\s240\s500/, "ten-year difference is not quoted");
  assert.match(body, /Expression of Interest/, "the next action is not named");
});

test("the proposal-ready message degrades safely when economics are unavailable", () => {
  const built = buildLifecycleTemplate("proposal_ready", CASE, PORTAL, {});
  const body = built.body.join("\n");
  assert.ok(!body.includes("R null"), "null economics leaked into the copy");
  assert.match(body, /year-one and ten-year position/, "no fallback framing was used");
});

test("a blocked bill pack tells the client exactly what is wrong", () => {
  const built = buildLifecycleTemplate("bill_pack_needs_attention", CASE, PORTAL, {
    blockers: [
      "The pack does not contain six recognised billing periods.",
      "Two files cover the same billing period.",
    ],
  });
  const body = built.body.join("\n");
  assert.match(body, /six recognised billing periods/);
  assert.match(body, /same billing period/);
  assert.match(body, /submit the pack again/, "no recovery instruction given");
});

test("a blocked bill pack still explains itself when no blocker text was captured", () => {
  const built = buildLifecycleTemplate("bill_pack_needs_attention", CASE, PORTAL, { blockers: [] });
  const body = built.body.join("\n");
  assert.match(body, /six recognisable billing periods/, "no fallback reason given");
});

test("the gap proposal is honest and never claims a saving", () => {
  const built = buildLifecycleTemplate("proposal_gap", CASE, PORTAL, {});
  const body = built.body.join("\n");
  assert.match(body, /does not currently sit below your utility path/);
  assert.ok(!/\bsaving\b/i.test(built.subject), "gap subject implies a saving");
});

test("the funder submission message carries the response date when known", () => {
  const built = buildLifecycleTemplate("submitted_to_funder", CASE, PORTAL, {
    slaDueAt: "2026-08-10T09:00:00.000Z",
  });
  assert.match(built.body.join("\n"), /10 August 2026/);
});

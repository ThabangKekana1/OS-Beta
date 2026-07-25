import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAssociationOutreachEmail,
  buildAssociationFollowUpEmail,
  memberLinkForCode,
} from "../lib/association-outreach.ts";
import { ASSOCIATION_OUTREACH_STAGES } from "../lib/association-stages.ts";

const ASSOCIATION = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "South African Poultry Association",
  sector: "Agriculture / Food Production",
  referral_code: "SAPA",
  website: "https://www.sapoultry.co.za/",
  member_base: "Poultry producers, broilers, eggs, hatcheries and poultry value chain",
  product_fit: "Eden and Awaken",
  partnership_angle: "Lower-cost energy and uptime for poultry producers.",
  why_it_matters: "Poultry is energy-sensitive: heating, ventilation, cooling and processing.",
  recommended_action: "Pitch poultry energy programme.",
  priority_tier: 2,
  priority_score: 10,
  outreach_stage: "not_started",
  outreach_owner: null,
  last_contacted_at: null,
  next_action_at: null,
  contact_name: "Thandi Nkosi",
  contact_email: "thandi@sapoultry.co.za",
  commission_value: 15000,
  notes: null,
};

test("the member link uses the association referral code on the public site", () => {
  assert.match(memberLinkForCode("sapa"), /\/migrate\/SAPA$/);
});

test("the approach email leads with member value and states the terms plainly", () => {
  const built = buildAssociationOutreachEmail(ASSOCIATION);
  const body = built.body.join("\n");

  assert.match(built.subject, /South African Poultry Association/);
  assert.ok(built.subject.length <= 78, "subject is too long for an inbox");
  assert.match(body, /^Dear Thandi,/, "does not address the contact by first name");

  // Commercial terms are stated, not buried. en-ZA groups with a non-breaking space.
  assert.match(body, /R15\s000/, "commission is not stated");
  assert.match(body, /No exclusivity is asked for/, "exclusivity position is not stated");

  // The member link must be present and correct.
  assert.match(body, /\/migrate\/SAPA/, "member link is missing");

  // The honesty commitment that differentiates the offer must survive edits.
  assert.match(body, /told to stay where they are/, "the honest-answer commitment is missing");
  assert.match(body, /six of their own utility bills/, "the evidence basis is not stated");

  // One specific, small ask.
  assert.match(body, /twenty minutes/, "no concrete ask");
  assert.ok(!body.includes("undefined"), "leaked an undefined value");
  assert.ok(!/\.\./.test(body), "doubled full stop in the copy");

  // why_it_matters is an internal targeting note and must never be sent out.
  assert.doesNotMatch(body, /energy-sensitive/, "internal targeting rationale leaked into client copy");
});

test("the approach email degrades gracefully with no named contact", () => {
  const built = buildAssociationOutreachEmail({ ...ASSOCIATION, contact_name: null });
  assert.match(built.body.join("\n"), /^Good day,/);
});

test("the follow-up shrinks the ask rather than repeating it", () => {
  const body = buildAssociationFollowUpEmail(ASSOCIATION).body.join("\n");
  assert.match(body, /send me one member/, "does not reduce the ask");
  assert.match(body, /close the file/, "does not offer a clean exit");
});

test("every outreach stage carries a next action", () => {
  assert.equal(ASSOCIATION_OUTREACH_STAGES.length, 9);
  for (const stage of ASSOCIATION_OUTREACH_STAGES) {
    assert.ok(stage.label.length > 0, `${stage.id} has no label`);
    assert.ok(stage.nextAction.length > 10, `${stage.id} has no usable next action`);
  }
});

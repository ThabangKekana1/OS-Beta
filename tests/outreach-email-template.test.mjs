import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFoundationOutreachBody,
  FOUNDATION_OUTREACH_SUBJECT,
} from "../lib/outreach-email-template.ts";

test("outreach template leads with the tariff switch and savings", () => {
  const body = buildFoundationOutreachBody({ contactName: "Guthrie Jones" });

  assert.equal(FOUNDATION_OUTREACH_SUBJECT, "Switch energy tariffs and save up to 60%");
  assert.match(body, /^Good day Guthrie,/);
  assert.match(body, /switch from Eskom to a clean-energy PPA tariff/);
  assert.match(body, /up to 60% on electricity costs/);
  assert.match(body, /six months of utility bills/);
  assert.match(body, /projected tariff and savings over the PPA term/);
});

test("outreach template does not position the PPA as client funding or debt", () => {
  const body = buildFoundationOutreachBody(null);

  assert.doesNotMatch(body, /funded|funding|finance|financing|debt|owe|we carry the cost/i);
  assert.doesNotMatch(body, /eliminat(?:e|ing) load shedding|R25 million|R0\.98/i);
});

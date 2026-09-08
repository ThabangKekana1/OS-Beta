import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = join(here, "..", "..");
const read = (rel) => readFileSync(join(workspace, "1OS", rel), "utf8");

test("delivery events require the signing secret and speak only the three kinds", () => {
  const route = read("app/api/internal/email-events/route.ts");
  assert.match(route, /RESEND_DELIVERY_WEBHOOK_SECRET/, "the secret must gate the route");
  assert.match(route, /verifyWebhookRequest/, "every payload is signature-checked");
  assert.match(route, /"email\.delivered": "delivered"/, "delivered is recorded");
  assert.match(route, /"email\.bounced": "bounced"/, "bounced is recorded");
  assert.match(route, /"email\.complained": "complained"/, "complaints are recorded");
  assert.match(route, /ignored: true/, "svix pings and opens pass through, not recorded");
});

test("dispatch stores the resend id so delivery events can correlate", () => {
  const dispatch = read("app/api/admin/sales/harness/dispatch/route.ts");
  assert.match(dispatch, /resend_id: outcome\.id/, "the queue row carries the resend id");
  assert.match(dispatch, /resend_id: outcome\.id \}/, "the sent outcome carries it too");
});

test("recordDeliveryEvent correlates through the payload and lands in outcomes", async () => {
  const gate = read("lib/harness/gate.ts");
  assert.match(gate, /payload->>resend_id/, "correlation is by the stored resend id");
  assert.match(gate, /event: input\.kind/, "the event kind passes through to the ledger");

  const mod = await import("../lib/harness/gate.ts");
  assert.equal(typeof mod.recordDeliveryEvent, "function");
  // Without a configured Supabase admin the event is not recorded, and it does not throw.
  const result = await mod.recordDeliveryEvent({ resendId: "test-id", kind: "delivered" });
  assert.equal(result.recorded, false);
});

test("MI's brief speaks delivery, not just acceptance", () => {
  const founder = read("lib/harness/founder.ts");
  assert.match(founder, /DELIVERY: \$\{counts\.delivered\} delivered/, "the brief carries the delivery line");
  assert.match(founder, /Bounces poison the mailbox/, "the brief carries the warning");
});

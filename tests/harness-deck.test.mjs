import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = join(here, "..", "..");
const read = (rel) => readFileSync(join(workspace, "1OS", rel), "utf8");

test("deck verdicts route exclusively through the approval gate", () => {
  const route = read("app/api/admin/deck/route.ts");
  assert.match(route, /approveSend|rejectSend/, "verdicts must use gate functions");
  assert.doesNotMatch(route, /markSent|sendEmail|resend\.com/, "the deck never touches the wire");
  const dispatch = read("app/api/admin/sales/harness/dispatch/route.ts");
  assert.match(dispatch, /canDispatch/, "dispatch re-checks caps even for approved rows");
});

test("the Today Queue orders drafts before receipts, best evidence first", async () => {
  const mod = await import("../lib/harness/deck.ts");
  const items = [
    { id: "sent-old", prospectKey: "p4", subject: "s", bodyText: "b", status: "sent", createdAt: "2026-09-01T00:00:00Z", payload: {} },
    { id: "draft-low", prospectKey: "p2", subject: "s", bodyText: "b", status: "draft", createdAt: "2026-09-01T00:00:00Z", payload: { score: 40 } },
    { id: "draft-high-stale", prospectKey: "p1", subject: "s", bodyText: "b", status: "draft", createdAt: "2026-08-01T00:00:00Z", payload: { score: 88 } },
    { id: "draft-high-fresh", prospectKey: "p3", subject: "s", bodyText: "b", status: "draft", createdAt: "2026-09-03T00:00:00Z", payload: { score: 88 } },
  ];
  const ordered = mod.orderQueueForFounder(items);
  assert.deepEqual(ordered.map((i) => i.id), ["draft-high-stale", "draft-high-fresh", "draft-low", "sent-old"]);
  // Equal scores starve oldest-last, not first.
  const { receipts, hiddenCount } = mod.takeReceipts(ordered, 1);
  assert.equal(receipts.length, 1);
  assert.equal(hiddenCount, 0, "only one receipt exists so nothing hides");
});

test("harness cognition runs on its own model tier via MODEL_HARNESS", () => {
  const run = read("lib/harness/run.ts");
  assert.match(run, /process\.env\.MODEL_HARNESS/);
  assert.match(run, /model: harnessModel/);
  const client = read("lib/model/client.ts");
  assert.match(client, /input\.model\?\.trim\(\) \|\| modelForRole/);
});

test("MI speaks through the thread but only ever acts through the gate", () => {
  const chatRoute = read("app/api/admin/deck/chat/route.ts");
  assert.doesNotMatch(chatRoute, /sendEmail|resend\.com|markSent/, "chat has no wire access");
  assert.match(chatRoute, /buildFounderTools/);

  const founder = read("lib/harness/founder.ts");
  for (const banned of ["sendEmail", "api.resend.com"]) {
    assert.doesNotMatch(founder, new RegExp(banned), `${banned} must not exist in MI's toolset`);
  }
  // Killing sends is a founder verdict relayed as gate rejections with reasons.
  assert.match(founder, /status: "rejected"/);
  assert.match(founder, /killed by founder via MI/);

  // The persona carries the honesty contract.
  assert.match(founder, /Never invent figures/);

  // The thread persists with three author roles.
  const migration = read("supabase/migrations/20260826140000_deck_thread.sql");
  assert.match(migration, /role text not null check \(role in \('founder', 'harness', 'event'\)\)/);

  // Platform events speak: dispatch reports into the same stream.
  const dispatch = read("app/api/admin/sales/harness/dispatch/route.ts");
  assert.match(dispatch, /\bsay\(/);
});

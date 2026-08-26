import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = join(here, "..", "..");

const read = (rel) => readFileSync(join(workspace, "1OS", rel), "utf8");
async function load(rel, aliasMap = new Map()) {
  const { resolveTsAlias } = await import("./resolve-ts-alias.mjs").catch(() => ({}));
  void resolveTsAlias;
  const source = read(rel);
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  return import(dataUrl);
}

test("the approval gate is absolute: nothing marks a send sent without approval", () => {
  // The code path itself must refuse non-approved rows.
  const gate = read("lib/harness/gate.ts");
  assert.match(gate, /\.eq\("status", "approved"\)/);
  assert.match(gate, /not\("approved_at", "is", null\)/);
  assert.match(gate, /not\("approved_by", "is", null\)/);

  // The table carries the same invariant as a declared CHECK.
  const migration = read("supabase/migrations/20260826120000_harness_core.sql");
  assert.match(migration, /send_queue_sent_requires_approval/);
  assert.match(migration, /status <> 'sent' or \(approved_at is not null and approved_by is not null\)/);
});

test("the only agent-callable write is a gate-mediated queueing draft", () => {
  const tools = read("lib/harness/tools.ts");
  // No send/mutate tools registered anywhere in the harness tool layer.
  assert.match(tools, /read\.salesBook|queue\.outreachDraft/);
  for (const banned of ["markSent", "approveSend"]) {
    assert.doesNotMatch(tools, new RegExp(banned), `${banned} must never be agent-callable`);
  }
  const runner = read("lib/harness/run.ts");
  assert.match(runner, /startsWith\("read\."\)|startsWith\("queue\."/);
});

test("volume caps hold: 20/day platform-wide, one follow-up per prospect per week", async () => {
  const mod = await import("../lib/harness/gate.ts");
  const now = "2026-09-01T09:00:00.000Z";
  assert.equal(mod.SEND_DAILY_CAP, 20);
  assert.ok(mod.withinDailyCap(new Array(19)), "19 sends leave room for one more");
  assert.equal(mod.withinDailyCap(new Array(20)), false, "20 sends exhaust the day");
  assert.ok(mod.outsideFollowupWindow([], now));
  assert.equal(
    mod.outsideFollowupWindow(["2026-08-29T08:00:00.000Z"], now),
    false,
    "a send inside the rolling window blocks another",
  );
  assert.ok(
    mod.outsideFollowupWindow(["2026-08-20T08:00:00.000Z"], now),
    "an old send does not block",
  );
  assert.equal(
    mod.canDispatch({ status: "draft", prospectKey: "p" }, { sentTodayIso: [], prospectSendsIso: [] }, now),
    false,
    "dispatch refuses anything that is not approved",
  );
});

test("lead scoring is explainable arithmetic with locked sectors first", async () => {
  const mod = await import("../lib/harness/score.ts");
  const top = mod.scoreLead({ sector: "poultry", estSpendBand: "250k+", contactChannel: "info@x.co.za", verification: "V" });
  const bottom = mod.scoreLead({ sector: "other", estSpendBand: "unknown", contactChannel: null, verification: null });
  assert.ok(top.score > bottom.score);
  assert.ok(top.score <= 100 && bottom.score >= 0);
  assert.equal(top.scorerVersion, mod.SCORER_VERSION);
  assert.ok(Array.isArray(top.breakdown.reasons) && top.breakdown.reasons.length > 0);
});

test("deal health punishes stale stages and missing evidence, not bad luck", async () => {
  const mod = await import("../lib/harness/score.ts");
  const healthy = mod.scoreDealHealth({
    stage: "proposal_ready",
    stageChangedAt: "2026-09-01T00:00:00.000Z",
    nowIso: "2026-09-03T00:00:00.000Z",
    billsReceived: 6,
    billsRequired: 6,
    eoiSigned: true,
    daysSinceLastClientEngagement: 2,
  });
  const stale = mod.scoreDealHealth({
    stage: "proposal_ready",
    stageChangedAt: "2026-07-01T00:00:00.000Z",
    nowIso: "2026-09-03T00:00:00.000Z",
    billsReceived: 0,
    billsRequired: 6,
    eoiSigned: false,
    daysSinceLastClientEngagement: null,
  });
  assert.ok(healthy.score > stale.score);
  assert.ok(stale.breakdown.staleDays > 14, "staleDays are reported honestly");
  assert.match(healthy.breakdown.reasons.join(" "), /EOI signed/);
});

test("harness runs persist into the shared graph-run ledger", () => {
  const run = read("lib/harness/run.ts");
  assert.match(run, /foundation1_graph_runs/);
  assert.match(run, /graph_key: `harness:\$\{input\.agent\}`/);
});

test("the migration report model stays byte-identical across apps", () => {
  for (const file of ["indicative-migration-report.ts", "pricing-engine.ts", "sa-places.ts", "eskom-tariff-model.ts", "municipal-tariff-model.ts"]) {
    const serverCopy = readFileSync(join(workspace, "1OS", "lib", file), "utf8");
    let publicCopy;
    try {
      publicCopy = readFileSync(join(workspace, "NEW F-1", "src", "lib", file), "utf8");
    } catch {
      continue; // server-only model
    }
    assert.equal(publicCopy, serverCopy, `${file} drifted between apps`);
  }
});

test("Dawn shares the harness playbook layer without breaking its own", () => {
  const store = read("lib/dawn/store.ts");
  assert.match(store, /foundation1_agent_playbooks/);
  assert.match(store, /\.eq\("agent", "dawn"\)/);
  // The merge is optional by design: a lagging migration never breaks a client chat.
  const shared = store.split("Shared harness playbook layer")[1] ?? "";
  assert.match(shared, /catch/, "the shared-layer read must be wrapped in try/catch");
});

test("outcome roll-up uses cumulative reach so conversions are plain ratios", async () => {
  const mod = await import("../lib/harness/outcomes.ts");
  const rows = [
    { event: "sent", prospectKey: "A", sector: "poultry", templateKey: "v1" },
    { event: "reply", prospectKey: "A", sector: "poultry", templateKey: "v1" },
    { event: "bills_in", prospectKey: "A", sector: "poultry", templateKey: "v1" },
    { event: "sent", prospectKey: "B", sector: "dairy", templateKey: "v2" },
    { event: "sent", prospectKey: "C", sector: "dairy", templateKey: "v2" },
    { event: "reply", prospectKey: "C", sector: "dairy", templateKey: "v2" },
  ];
  const slices = mod.rollUpOutcomes(rows);
  const all = slices.find((s) => s.sliceKey === "_all");
  assert.equal(all.counts.sent, 3);
  assert.equal(all.counts.reply, 2);
  assert.equal(all.counts.bills_in, 1);
  assert.equal(all.counts.term_sheet, 0);

  const insights = await mod.buildConversionInsights(slices, [{ from: "sent", to: "reply" }], 3);
  assert.equal(insights.length, 1, "denominators under the minimum are withheld");
  const topInsight = await mod.buildConversionInsights(slices, [{ from: "sent", to: "reply" }], 2);
  assert.match(topInsight.find((i) => i.sliceKey === "_all").fact, /2\/3 prospects converted/);
});

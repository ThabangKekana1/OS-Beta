import test from "node:test";
import assert from "node:assert/strict";

const { enforceStyle } = await import("../lib/dawn/engine.ts");
const { stageNarrative, DAWN_VIEWS } = await import("../lib/dawn/prompt.ts");
const { detectStuck } = await import("../lib/dawn/context.ts");
const { detectSignals } = await import("../lib/dawn/learning.ts");

test("enforceStyle strips em dashes", () => {
  const out = enforceStyle("The EOI \u2014 a short letter \u2014 commits you to nothing.");
  assert.ok(!out.includes("\u2014"));
});

test("enforceStyle removes external URLs", () => {
  const out = enforceStyle("See https://example.com/page for detail.");
  assert.ok(!out.includes("http"));
});

test("enforceStyle keeps whitelisted dawn view links and rewrites unknown ones", () => {
  const good = enforceStyle("[Open documents](dawn:view/documents)");
  assert.ok(good.includes("(dawn:view/documents)"));
  const bad = enforceStyle("[Go](dawn:view/admin-panel)");
  assert.ok(bad.includes("(dawn:view/home)"));
});

test("enforceStyle allows disclosed partners, scrubs internal codenames", () => {
  // Partner disclosure allowed since 30 August 2026: Nedbank CIB and
  // GreenShare VPP are namable. Internal codenames still never leak.
  const out = enforceStyle("NEDBANK and GreenShare back this; Eqstra and UFMS are internal words.");
  assert.ok(/nedbank/i.test(out));
  assert.ok(/greenshare/i.test(out));
  assert.ok(!/eqstra|ufms/i.test(out));
  assert.ok(out.includes("the funded programme"));
});

test("stageNarrative walks profile then NDA before stage logic", () => {
  const noProfile = stageNarrative({ stage: "bill_pack_required", profileCompleted: false, ndaSigned: false });
  assert.match(noProfile.next, /profile/i);
  const noNda = stageNarrative({ stage: "bill_pack_required", profileCompleted: true, ndaSigned: false });
  assert.match(noNda.next, /NDA/);
  const bills = stageNarrative({ stage: "bill_pack_required", profileCompleted: true, ndaSigned: true });
  assert.match(bills.next, /six months/i);
  assert.equal(bills.waitingOnFoundation1, false);
});

test("stageNarrative marks waiting stages as Foundation-1's ball", () => {
  for (const stage of ["bill_pack_processing", "bill_pack_review", "kyc_ready", "submitted_to_funder"]) {
    const narrative = stageNarrative({ stage, profileCompleted: true, ndaSigned: true });
    assert.equal(narrative.waitingOnFoundation1, true, stage);
  }
});

test("detectStuck flags repeated task opens without action", () => {
  const now = Date.now();
  const movements = [0, 1, 2].map((i) => ({
    at: new Date(now - i * 60_000).toISOString(),
    eventName: "page_view",
    pageKey: "task",
  }));
  assert.equal(detectStuck(movements, true).stuck, true);
  assert.equal(detectStuck(movements, false).stuck, false);
  const withAction = [...movements, { at: new Date(now).toISOString(), eventName: "interaction", pageKey: "task" }];
  assert.equal(detectStuck(withAction, true).stuck, false);
});

test("detectSignals catches repeated questions and trust language", () => {
  const history = [
    { id: "1", conversationId: "c", role: "client", content: "What exactly does the non-binding EOI letter mean for my business?", createdAt: "", context: {} },
    { id: "2", conversationId: "c", role: "dawn", content: "It is a short letter of interest.", createdAt: "", context: {} },
  ];
  const repeated = detectSignals({
    clientMessage: "Sorry but what does the non-binding EOI letter actually mean for my business?",
    history,
    stuck: { stuck: false, reason: null },
  });
  assert.ok(repeated.some((s) => s.kind === "repeated_question"));

  const trust = detectSignals({
    clientMessage: "This sounds like a scam to be honest, where is the catch?",
    history: [],
    stuck: { stuck: false, reason: null },
  });
  assert.ok(trust.some((s) => s.kind === "trust_concern"));
});

test("DAWN_VIEWS matches the workspace views", () => {
  assert.deepEqual([...DAWN_VIEWS], ["home", "task", "journey", "documents", "notifications", "support"]);
});

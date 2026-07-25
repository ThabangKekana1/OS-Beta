import assert from "node:assert/strict";
import test from "node:test";
import {
  FOUNDATION1_AGENT_GRAPHS,
  foundation1Graph,
} from "../lib/agent-graph/definitions.ts";
import {
  runBoundedGraph,
  validateGraphDefinition,
} from "../lib/agent-graph/runtime.ts";

test("Foundation-1 graph registry contains only bounded valid graphs", () => {
  assert.equal(FOUNDATION1_AGENT_GRAPHS.length, 6);
  for (const graph of FOUNDATION1_AGENT_GRAPHS) {
    assert.equal(validateGraphDefinition(graph), graph);
    assert.ok(graph.nodes.length <= graph.limits.maxNodes);
    assert.ok(graph.limits.maxParallelNodes <= 4);
    assert.ok(graph.limits.maxAttemptsPerNode <= 3);
    assert.equal(graph.limits.maxRounds, 1);
  }
});

test("graph definitions expose no transactional or calculation capabilities", () => {
  const capabilities = FOUNDATION1_AGENT_GRAPHS.flatMap((graph) =>
    graph.nodes.flatMap((node) => node.capabilities),
  );
  for (const forbidden of [
    "transition:case",
    "calculate:financials",
    "decide:eligibility",
    "send:proposal",
    "submit:funding",
    "accept:term_sheet",
    "write:final_proposal",
  ]) {
    assert.equal(capabilities.includes(forbidden), false);
  }
  const artifactKeys = FOUNDATION1_AGENT_GRAPHS.flatMap((graph) =>
    graph.nodes.map((node) => node.artifactKey),
  );
  assert.equal(artifactKeys.includes("final_proposal_document"), false);
});

test("proposal content graph has one assembler and never writes the final proposal", () => {
  const graph = foundation1Graph("proposal_content");
  assert.ok(graph);
  const outputWriters = graph.nodes.filter(
    (node) => node.artifactKey === graph.outputArtifactKey,
  );
  assert.equal(outputWriters.length, 1);
  assert.equal(outputWriters[0].key, "assemble_proposal_content");
  assert.equal(graph.outputArtifactKey, "proposal_content_package");
});

test("runtime executes independent work in parallel and respects the cap", async () => {
  const graph = foundation1Graph("account_research");
  assert.ok(graph);
  let active = 0;
  let maximum = 0;
  const result = await runBoundedGraph({
    definition: graph,
    request: { target_name: "Test target" },
    executor: async ({ node }) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 8));
      active -= 1;
      return {
        outcome: "passed",
        artifact: { node: node.key },
        citations: [],
        flags: [],
      };
    },
  });
  assert.equal(result.outcome, "succeeded");
  assert.ok(maximum > 1);
  assert.ok(maximum <= graph.limits.maxParallelNodes);
  assert.equal(
    result.results.merge_account_brief.artifactKey,
    "account_brief",
  );
});

test("runtime retries within the explicit node cap", async () => {
  const graph = foundation1Graph("account_research");
  assert.ok(graph);
  const calls = new Map();
  const result = await runBoundedGraph({
    definition: graph,
    request: { target_name: "Retry target" },
    executor: async ({ node, attempt }) => {
      calls.set(node.key, (calls.get(node.key) ?? 0) + 1);
      if (node.key === "company_research" && attempt === 1) {
        return {
          outcome: "failed",
          citations: [],
          flags: ["temporary failure"],
        };
      }
      return {
        outcome: "passed",
        artifact: { node: node.key },
        citations: [],
        flags: [],
      };
    },
  });
  assert.equal(result.outcome, "succeeded");
  assert.equal(calls.get("company_research"), 2);
  assert.equal(result.results.company_research.attempt, 2);
});

test("a verifier that does not pass blocks the merge", async () => {
  const graph = foundation1Graph("account_research");
  assert.ok(graph);
  const result = await runBoundedGraph({
    definition: graph,
    request: { target_name: "Unverified target" },
    executor: async ({ node }) => ({
      outcome:
        node.key === "account_evidence_verifier" ? "needs_review" : "passed",
      artifact: { node: node.key },
      citations: [],
      flags:
        node.key === "account_evidence_verifier"
          ? ["source quality below threshold"]
          : [],
    }),
  });
  assert.equal(result.outcome, "failed");
  assert.equal(result.results.merge_account_brief.outcome, "blocked");
});

test("definition validation rejects parallel writers and protected artifacts", () => {
  const graph = foundation1Graph("account_research");
  assert.ok(graph);
  assert.throws(
    () =>
      validateGraphDefinition({
        ...graph,
        nodes: graph.nodes.map((node, index) =>
          index === 1
            ? { ...node, artifactKey: graph.nodes[0].artifactKey }
            : node,
        ),
      }),
    /multiple writers/,
  );
  assert.throws(
    () =>
      validateGraphDefinition({
        ...graph,
        outputArtifactKey: "final_proposal_document",
        nodes: graph.nodes.map((node) =>
          node.key === "merge_account_brief"
            ? { ...node, artifactKey: "final_proposal_document" }
            : node,
        ),
      }),
    /protected artifact/,
  );
});

import { FOUNDATION1_AGENT_GRAPHS } from "@/lib/agent-graph/definitions";
import { summarizeIntelligence } from "@/lib/intelligence/improvement-engine";
import type { IntelligenceSnapshot } from "@/lib/intelligence/types";

export function buildCodexOperationsBrief(snapshot: IntelligenceSnapshot) {
  const summary = summarizeIntelligence(snapshot);
  const lines = [
    "# Foundation-1 Codex operations brief",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Environment: ${snapshot.environment}`,
    `Window: ${snapshot.days} days`,
    "",
    "## Hard boundaries",
    "",
    "- Do not change financial calculations, eligibility rules or migration-case transitions from this brief.",
    "- Do not send outreach, proposals, KYC packs, funding submissions or term-sheet decisions.",
    "- Treat behavioural signals as pseudonymous aggregates, not facts about an identifiable person.",
    "- Every proposed product change requires human review.",
    "",
    "## Current signals",
    "",
    `- Allowlisted events: ${summary.eventCount}`,
    `- Pseudonymous sessions: ${summary.sessionCount}`,
    `- Bounded graph runs: ${summary.graphRunCount}`,
    `- Successful graph runs: ${summary.successfulGraphRuns}`,
    "",
    "## Most-viewed redacted paths",
    "",
    ...summary.pages.map(
      (page) => `- ${page.pageKey}: ${page.views} views / ${page.sessions} sessions`,
    ),
    "",
    "## Improvement queue",
    "",
    ...(snapshot.insights.length
      ? snapshot.insights.map(
          (item) =>
            `- [${item.status}] [${item.severity}] ${item.headline}\n  Evidence: ${item.evidence}\n  Recommendation: ${item.recommendation}`,
        )
      : ["- No persisted insights yet. Run the learning cycle."]),
    "",
    "## Bounded graph registry",
    "",
    ...FOUNDATION1_AGENT_GRAPHS.map(
      (graph) =>
        `- ${graph.key}@${graph.version}: ${graph.nodes.length} nodes, parallel cap ${graph.limits.maxParallelNodes}, retry cap ${graph.limits.maxAttemptsPerNode}, output ${graph.outputArtifactKey}`,
    ),
    "",
    "## Codex task",
    "",
    "Challenge the evidence, identify the smallest high-leverage operational improvement, list risks and affected files, and wait for human approval before changing production behaviour.",
    "",
  ];
  return lines.join("\n");
}

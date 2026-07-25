import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildCodexOperationsBrief } from "../lib/intelligence/codex-brief.ts";
import {
  buildImprovementInsights,
  summarizeIntelligence,
} from "../lib/intelligence/improvement-engine.ts";
import {
  sanitizeTelemetryBatch,
  sanitizeTelemetryPath,
} from "../lib/intelligence/telemetry.ts";

const hashSecret = "test-telemetry-hash-secret-2026";

function rawEvent(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    occurredAt: "2026-07-23T10:00:00.000Z",
    environment: "test",
    surface: "public_website",
    eventName: "page_view",
    pageKey:
      "/migration/case/Jr0bALY2eN1kC2xYpB6_RhVt9WqA5sDfGhJkLzXcVbn?email=secret@example.com",
    visitorId: "visitor-raw-identifier",
    sessionId: "session-raw-identifier",
    consentBasis: "test",
    properties: {
      viewport: "desktop",
      forbidden_email: "secret@example.com",
    },
    schemaVersion: "2026-07-23.1",
    ...overrides,
  };
}

test("telemetry paths remove query strings and access tokens", () => {
  assert.equal(
    sanitizeTelemetryPath(
      "/migration/case/Jr0bALY2eN1kC2xYpB6_RhVt9WqA5sDfGhJkLzXcVbn?email=a@b.com",
    ),
    "/migration/case/[case]",
  );
  assert.equal(
    sanitizeTelemetryPath("/proposal/3fa85f64-5717-4562-b3fc-2c963f66afa6"),
    "/proposal/[token]",
  );
  assert.equal(
    sanitizeTelemetryPath("/dealroom/short-private-access-code?document=secret"),
    "/dealroom/[token]",
  );
  assert.equal(
    sanitizeTelemetryPath("/estimate/a/cooperative-code/private-link-id"),
    "/estimate/a/[token]/[token]",
  );
});

test("telemetry accepts only consented allowlisted and pseudonymised events", () => {
  const accepted = sanitizeTelemetryBatch({
    events: [rawEvent()],
    hashSecret,
    receivedAt: new Date("2026-07-23T10:00:05.000Z"),
  });
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].pageKey, "/migration/case/[case]");
  assert.match(accepted[0].visitorHash, /^[0-9a-f]{64}$/);
  assert.match(accepted[0].sessionHash, /^[0-9a-f]{64}$/);
  assert.notEqual(accepted[0].visitorHash, "visitor-raw-identifier");
  assert.deepEqual(accepted[0].properties, { viewport: "desktop" });

  const rejected = sanitizeTelemetryBatch({
    events: [
      rawEvent({ environment: "production", consentBasis: "test" }),
      rawEvent({ eventName: "keystroke" }),
      rawEvent({ id: "not-an-id" }),
    ],
    hashSecret,
    receivedAt: new Date("2026-07-23T10:00:05.000Z"),
  });
  assert.equal(rejected.length, 0);
});

test("telemetry batch has a hard event cap", () => {
  const accepted = sanitizeTelemetryBatch({
    events: Array.from({ length: 40 }, () => rawEvent()),
    hashSecret,
    receivedAt: new Date("2026-07-23T10:00:05.000Z"),
  });
  assert.equal(accepted.length, 20);
});

test("learning engine produces evidence-based funnel and graph insights", () => {
  const pricingEvents = Array.from({ length: 20 }, (_, index) => ({
    id: `pricing-${index}`,
    occurred_at: "2026-07-23T10:00:00.000Z",
    environment: "test",
    surface: "public_website",
    event_name: "page_view",
    page_key: "/pricing",
    session_hash: `pricing-session-${index}`,
    properties: {},
  }));
  const caseEvents = Array.from({ length: 2 }, (_, index) => ({
    ...pricingEvents[index],
    id: `case-${index}`,
    page_key: "/migration/case/[case]",
    session_hash: `case-session-${index}`,
  }));
  const graphRuns = Array.from({ length: 5 }, (_, index) => ({
    id: `run-${index}`,
    created_at: "2026-07-23T10:00:00.000Z",
    graph_key: "account_research",
    graph_version: "2026-07-23.1",
    environment: "test",
    status: index < 2 ? "succeeded" : "failed",
    max_nodes: 10,
    max_parallel_nodes: 4,
    max_attempts_per_node: 2,
    node_count: 6,
    stop_reason: null,
    failure_reason: index < 2 ? null : "verification",
  }));
  const insights = buildImprovementInsights({
    events: [...pricingEvents, ...caseEvents],
    graphRuns,
    environment: "test",
    periodEnd: new Date("2026-07-23T12:00:00.000Z"),
    days: 30,
  });
  assert.ok(
    insights.some((item) => item.insightKey === "pricing_to_case_progression_low"),
  );
  assert.ok(
    insights.some((item) => item.insightKey === "graph_quality_below_threshold"),
  );
});

test("Codex brief preserves human and transactional boundaries", () => {
  const snapshot = {
    configured: true,
    schemaReady: true,
    environment: "test",
    days: 30,
    events: [],
    graphRuns: [],
    insights: [],
  };
  const summary = summarizeIntelligence(snapshot);
  assert.equal(summary.eventCount, 0);
  const brief = buildCodexOperationsBrief(snapshot);
  assert.match(brief, /Do not change financial calculations/);
  assert.match(brief, /Every proposed product change requires human review/);
  assert.match(brief, /pseudonymous aggregates/);
});

test("intelligence schema is service-role only and protects final proposal writes", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260723140000_agent_graph_intelligence.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const table of [
    "foundation1_graph_runs",
    "foundation1_graph_node_runs",
    "foundation1_graph_artifacts",
    "foundation1_behavior_events",
    "foundation1_behavior_daily_metrics",
    "foundation1_improvement_insights",
    "foundation1_improvement_decisions",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
  }
  assert.match(migration, /final_proposal_document/);
  assert.match(migration, /retention_days integer default 90/);
});

test("public telemetry remains active in test mode but requires explicit consent", async () => {
  const [component, route, layout] = await Promise.all([
    readFile(
      new URL(
        "../../NEW F-1/src/components/BehaviorTelemetry.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../../NEW F-1/src/app/api/telemetry/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../NEW F-1/src/app/layout.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(component, /consent !== "accepted"/);
  assert.match(component, /environment === "test" \? "test"/);
  assert.match(component, /globalPrivacyControl/);
  assert.match(component, /x-f1-telemetry-client/);
  assert.doesNotMatch(component, /innerText|textContent|keypress|keydown/);
  assert.match(route, /Unauthorized telemetry client/);
  assert.match(layout, /<BehaviorTelemetry environment=\{telemetryEnvironment\}/);
});

test("client-workspace telemetry is active, consented, redacted and isolated from staff routes", async () => {
  const [component, route, layout, privacy, proxy] = await Promise.all([
    readFile(
      new URL(
        "../components/intelligence/ClientBehaviorTelemetry.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/api/telemetry/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../components/public-pages/privacy.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
  ]);
  assert.match(component, /consent !== "accepted"/);
  assert.match(component, /surface: "migration_workspace"/);
  assert.match(component, /globalPrivacyControl/);
  assert.match(component, /CLIENT_PATH_PREFIXES/);
  assert.doesNotMatch(component, /"\/admin"|"\/sales"/);
  assert.doesNotMatch(component, /innerText|textContent|keypress|keydown/);
  assert.match(
    layout,
    /<ClientBehaviorTelemetry environment=\{telemetryEnvironment\}/,
  );
  assert.match(route, /isSameOriginBrowserClient/);
  assert.match(route, /client-behavior-telemetry/);
  assert.match(route, /browserAuthorized\s*\?\s*currentEnvironment/);
  assert.match(proxy, /"\/api\/telemetry"/);
  assert.match(privacy, /does not store form values/);
  assert.match(privacy, /retained for 90 days/);
});

import type { Metadata } from "next";
import Link from "next/link";
import { FOUNDATION1_AGENT_GRAPHS } from "@/lib/agent-graph/definitions";
import {
  readIntelligenceSnapshot,
  runtimeEnvironment,
} from "@/lib/intelligence/store";
import { summarizeIntelligence } from "@/lib/intelligence/improvement-engine";
import type { TelemetryEnvironment } from "@/lib/intelligence/telemetry";
import {
  InsightDecisionControl,
  LearningCycleControl,
} from "@/components/admin/IntelligenceControls";

export const metadata: Metadata = {
  title: "Product Intelligence | 1OS Admin",
  description:
    "Privacy-safe customer movement, graph quality and human-reviewed operating improvements.",
};

export const dynamic = "force-dynamic";

const environments: TelemetryEnvironment[] = [
  "production",
  "preview",
  "development",
  "test",
];

function tone(value: string) {
  if (value === "high") return "border-rose-300/25 bg-rose-300/[0.06]";
  if (value === "medium") return "border-amber-300/25 bg-amber-300/[0.06]";
  if (value === "low") return "border-sky-300/25 bg-sky-300/[0.06]";
  return "border-white/10 bg-white/[0.03]";
}

export default async function AdminIntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ environment?: string }>;
}) {
  const params = await searchParams;
  const requested = params.environment as TelemetryEnvironment | undefined;
  const environment = environments.includes(requested as TelemetryEnvironment)
    ? (requested as TelemetryEnvironment)
    : runtimeEnvironment();
  const snapshot = await readIntelligenceSnapshot({ environment, days: 30 });
  const summary = summarizeIntelligence(snapshot);
  const graphSuccessRate = summary.graphRunCount
    ? Math.round((summary.successfulGraphRuns / summary.graphRunCount) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.35)] md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-[0.62rem] uppercase tracking-[0.22em] text-lime-200/70">
              First-party product intelligence
            </p>
            <h1 className="mt-4 text-3xl font-medium tracking-[-0.05em] text-white md:text-5xl">
              Learn from movement. Improve with evidence.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/48">
              Consented, pseudonymous customer movement and bounded graph
              quality. No form values, document contents, case tokens,
              keystrokes, cross-site tracking or autonomous production changes.
            </p>
          </div>
          <LearningCycleControl environment={environment} />
        </div>
        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Intelligence environment">
          {environments.map((item) => (
            <Link
              key={item}
              href={`/admin/intelligence?environment=${item}`}
              className={`rounded-full border px-3 py-1.5 text-[0.58rem] uppercase tracking-[0.15em] ${
                item === environment
                  ? "border-lime-300/30 bg-lime-300/10 text-lime-100"
                  : "border-white/10 text-white/40 hover:bg-white/5"
              }`}
            >
              {item}
            </Link>
          ))}
        </nav>
      </header>

      {!snapshot.schemaReady ? (
        <section className="rounded-[1.5rem] border border-amber-300/25 bg-amber-300/[0.06] p-5 text-sm text-amber-100">
          {snapshot.message ?? "Product intelligence storage is not ready."} Apply{" "}
          <code className="text-xs">
            20260723140000_agent_graph_intelligence.sql
          </code>{" "}
          before collecting durable signals.
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [summary.eventCount, "Allowlisted events"],
          [summary.sessionCount, "Pseudonymous sessions"],
          [summary.graphRunCount, "Bounded graph runs"],
          [`${graphSuccessRate}%`, "Graph success"],
        ].map(([value, label]) => (
          <div
            key={label}
            className="rounded-[1.4rem] border border-white/10 bg-black/30 p-5"
          >
            <strong className="text-3xl font-medium tracking-[-0.04em] text-white">
              {value}
            </strong>
            <span className="mt-2 block text-[0.6rem] uppercase tracking-[0.18em] text-white/34">
              {label}
            </span>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[1.7rem] border border-white/10 bg-black/30 p-5">
          <p className="text-[0.62rem] uppercase tracking-[0.2em] text-white/35">
            Customer movement · redacted paths
          </p>
          <div className="mt-4 space-y-2">
            {summary.pages.length ? (
              summary.pages.map((page) => (
                <div
                  key={page.pageKey}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3"
                >
                  <code className="truncate text-xs text-white/65">{page.pageKey}</code>
                  <span className="text-xs text-white/45">{page.views} views</span>
                  <span className="text-xs text-white/45">
                    {page.sessions} sessions
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-white/35">
                No consented events in this environment yet.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-[1.7rem] border border-white/10 bg-black/30 p-5">
          <p className="text-[0.62rem] uppercase tracking-[0.2em] text-white/35">
            Human-reviewed improvement queue
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {snapshot.insights.length ? (
              snapshot.insights.map((item) => (
                <article
                  key={item.id}
                  className={`rounded-[1.25rem] border p-4 ${tone(item.severity)}`}
                >
                  <div className="flex items-center justify-between gap-3 text-[0.56rem] uppercase tracking-[0.14em]">
                    <span className="text-white/38">{item.category}</span>
                    <span className="text-white/52">
                      {item.severity} · {item.status}
                    </span>
                  </div>
                  <h2 className="mt-3 text-sm font-medium text-white/85">
                    {item.headline}
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-white/45">{item.evidence}</p>
                  <p className="mt-3 text-xs leading-5 text-white/65">
                    {item.recommendation}
                  </p>
                  <InsightDecisionControl
                    insightId={item.id}
                    status={item.status}
                  />
                </article>
              ))
            ) : (
              <p className="text-sm leading-6 text-white/35">
                Run the learning cycle to generate evidence-based recommendations.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[1.7rem] border border-white/10 bg-black/30 p-5 md:p-6">
        <p className="text-[0.62rem] uppercase tracking-[0.2em] text-white/35">
          Bounded agent graph registry
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {FOUNDATION1_AGENT_GRAPHS.map((graph) => (
            <article
              key={graph.key}
              className="rounded-[1.3rem] border border-white/9 bg-white/[0.025] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium text-white/80">{graph.label}</h2>
                <code className="text-[0.58rem] text-white/30">{graph.version}</code>
              </div>
              <p className="mt-2 text-xs leading-5 text-white/40">{graph.purpose}</p>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  [graph.nodes.length, "nodes"],
                  [graph.limits.maxParallelNodes, "parallel"],
                  [graph.limits.maxAttemptsPerNode, "attempts"],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-lg border border-white/8 p-2">
                    <dt className="text-sm text-white/75">{value}</dt>
                    <dd className="mt-1 text-[0.5rem] uppercase tracking-[0.12em] text-white/28">
                      {label}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-[0.58rem] uppercase tracking-[0.13em] text-lime-200/55">
                One output · {graph.outputArtifactKey.replace(/_/g, " ")}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[1.7rem] border border-sky-300/20 bg-sky-300/[0.045] p-5 text-xs leading-6 text-sky-50/70">
        <strong className="font-medium text-sky-50">Learning boundary:</strong>{" "}
        the analyzer may propose interface, copy, evidence-quality and graph-input
        improvements. It cannot change calculations, qualification rules,
        migration-case stages, signatures, proposal release, funding actions or
        term-sheet decisions.
      </section>
    </div>
  );
}

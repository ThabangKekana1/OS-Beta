"use client";

/**
 * Briefs (doc 21): Monday and Friday, as living documents. The weekly brief
 * markdown from the intelligence layer, funnel rates that show their own
 * denominators, the R100m trajectory, and MI's self-changes with reasons.
 */
import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminPrimitives";

type Brief = {
  ok: boolean;
  weeklyMarkdown: string;
  dealBook: { gatedValueZar: number; gatedCount: number; weightedPipelineZar: number; goalZar: number };
  insights: Array<{ sliceKey: string; fact: string; measure: { rate: number; denominator: number } }>;
  decisions: Array<{ id: string; summary: string | null; reason: string | null; createdAt: string }>;
};

const zar = (v: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(v);

export function AdminBriefsRoute() {
  const [brief, setBrief] = useState<Brief | null>(null);

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/admin/deck/brief", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (payload?.ok) setBrief(payload);
    })();
  }, []);

  const book = brief?.dealBook;
  const pct = book?.goalZar ? Math.min(100, Math.round((book.gatedValueZar / book.goalZar) * 100)) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <AdminHeader
        eyebrow="Briefs"
        title="The rhythm."
        description="Monday you get the queue. Friday you get the truth. Both live here."
      />

      <section className="overflow-hidden rounded-md border border-white/10 bg-[var(--canvas)] p-5">
        <p className="text-[11px] uppercase tracking-widest opacity-50">R100m trajectory · term-sheet gated only</p>
        <p className="mt-2 text-3xl font-medium">{zar(book?.gatedValueZar ?? 0)}</p>
        <div className="mt-3 h-px w-full bg-white/12">
          <div className="h-px bg-[var(--electric)]" style={{ width: `${Math.max(pct, 1)}%` }} />
        </div>
        <p className="mt-2 text-xs opacity-55">
          {pct}% of goal · {book?.gatedCount ?? 0} gated deal(s) · weighted pipeline{" "}
          {zar(book?.weightedPipelineZar ?? 0)} (tracked, never counted)
        </p>
      </section>

      {!!brief?.insights?.length && (
        <section className="space-y-2">
          <h2 className="text-[11px] uppercase tracking-widest opacity-50">Measured rates</h2>
          <ul className="space-y-1.5">
            {brief.insights.map((insight, index) => (
              <li key={index} className="flex items-baseline justify-between gap-4 border-b border-white/6 pb-1.5 text-[13px]">
                <span className="opacity-75">{insight.fact}</span>
                <span className={`shrink-0 tabular-nums ${insight.measure.rate >= 0.25 ? "text-white" : "text-[var(--magenta)]"}`}>
                  {(insight.measure.rate * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] opacity-40">Rates under sample size 5 are withheld rather than guessed.</p>
        </section>
      )}

      {!!brief?.decisions?.length && (
        <section className="space-y-2">
          <h2 className="text-[11px] uppercase tracking-widest opacity-50">What MI changed about itself</h2>
          <ul className="space-y-1.5">
            {brief.decisions.map((decision) => (
              <li key={decision.id} className="border-b border-white/8 pb-2 px-3 py-2">
                <p className="text-[13px]">{decision.summary}</p>
                {decision.reason ? <p className="mt-0.5 text-[11px] opacity-50">because: {decision.reason}</p> : null}
                <p className="mt-0.5 text-[10px] opacity-35">{(decision.createdAt || "").slice(0, 16).replace("T", " ")}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {brief?.weeklyMarkdown ? (
        <section className="space-y-2">
          <h2 className="text-[11px] uppercase tracking-widest opacity-50">Weekly brief</h2>
          <pre className="whitespace-pre-wrap break-words rounded-md border border-white/10 bg-black/40 p-4 text-[12px] leading-5 opacity-85">
            {brief.weeklyMarkdown}
          </pre>
        </section>
      ) : null}
    </div>
  );
}

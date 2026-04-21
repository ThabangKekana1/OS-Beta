"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import {
  DEAL_VALUE_ZAR,
  isEoiDeal,
  sumClosedDealValue,
  sumEoiDealValue,
} from "@/lib/admin-kpis";

function toCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(numerator: number, denominator: number) {
  if (denominator === 0) {
    return "0%";
  }
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function AdminKpisRoute() {
  const { leads, agents } = useAdminPortal();

  const totals = useMemo(() => {
    const totalDeals = leads.length;
    const closedDeals = leads.filter((lead) => lead.stage === "Onboarding Complete").length;
    const disqualifiedDeals = leads.filter((lead) => lead.stage === "Disqualified").length;
    const eoiDeals = leads.filter(isEoiDeal).length;
    const eoiValue = sumEoiDealValue(leads);
    const closedValue = sumClosedDealValue(leads);
    const clientDocs = leads.reduce(
      (acc, lead) =>
        acc +
        lead.documents.filter((doc) => doc.uploadedByType === "Client").length,
      0,
    );
    const salesDocs = leads.reduce(
      (acc, lead) =>
        acc +
        lead.documents.filter((doc) => doc.uploadedByType === "Sales Team").length,
      0,
    );

    return {
      totalDeals,
      closedDeals,
      disqualifiedDeals,
      eoiDeals,
      eoiValue,
      closedValue,
      clientDocs,
      salesDocs,
    };
  }, [leads]);

  const dealStageRows = [
    {
      stage: "Expression of Interest",
      count: totals.eoiDeals,
      value: totals.eoiValue,
      ratio: percent(totals.eoiDeals, totals.totalDeals),
    },
    {
      stage: "Deal Closed",
      count: totals.closedDeals,
      value: totals.closedValue,
      ratio: percent(totals.closedDeals, totals.totalDeals),
    },
  ];

  const ownerRows = agents.map((agent) => {
    const assigned = leads.filter((lead) => lead.ownerId === agent.id);
    const eoi = assigned.filter(isEoiDeal);
    const closed = assigned.filter((lead) => lead.stage === "Onboarding Complete");
    const disqualified = assigned.filter((lead) => lead.stage === "Disqualified");
    return {
      agent,
      assigned: assigned.length,
      eoi: eoi.length,
      closed: closed.length,
      disqualified: disqualified.length,
      conversion: percent(closed.length, assigned.length),
    };
  });

  return (
    <div className="flex w-full flex-col gap-4 lg:gap-5">
      <section className="app-surface rounded-[1.6rem] px-5 py-5 lg:px-6 lg:py-6">
        <AdminHeader
          eyebrow="Deal KPIs"
          title="KPI board for all deals and onboarding outcomes."
          description="Monitor conversion, disqualification, value movement, and document throughput across the full sales pipeline."
          actions={
            <div className="flex flex-wrap gap-2">
              <AdminBadge label={`${totals.totalDeals} Total Deals`} />
              <AdminBadge
                label={`${percent(totals.closedDeals, totals.totalDeals)} Close Rate`}
                tone="muted"
              />
              <AdminBadge label={`${toCurrency(DEAL_VALUE_ZAR)} / Deal`} tone="muted" />
            </div>
          }
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="EOI Deals" value={String(totals.eoiDeals)} />
        <KpiCard label="Deals Closed" value={String(totals.closedDeals)} />
        <KpiCard label="Disqualified" value={String(totals.disqualifiedDeals)} />
        <KpiCard label="EOI Value" value={toCurrency(totals.eoiValue)} />
        <KpiCard label="Deal Closed Value" value={toCurrency(totals.closedValue)} />
        <KpiCard
          label="Doc Completion"
          value={percent(totals.clientDocs, totals.clientDocs + totals.salesDocs)}
        />
        <KpiCard label="Client Docs" value={String(totals.clientDocs)} />
        <KpiCard label="Sales Docs" value={String(totals.salesDocs)} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="app-surface rounded-[1.4rem] p-4">
          <p className="line-label">Deal Value Stages</p>
          <div className="mt-3 overflow-auto rounded-[0.9rem] border border-white/10">
            <table className="w-full min-w-[560px] text-left">
              <thead className="bg-black/70">
                <tr className="text-[0.64rem] uppercase tracking-[0.18em] text-white/50">
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Deals</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Share</th>
                </tr>
              </thead>
              <tbody>
                {dealStageRows.map((row) => (
                  <tr
                    key={row.stage}
                    className="border-t border-white/8 bg-black/35 text-sm"
                  >
                    <td className="px-3 py-2 text-white/78">{row.stage}</td>
                    <td className="px-3 py-2 text-white/62">{row.count}</td>
                    <td className="px-3 py-2 text-white/62">{toCurrency(row.value)}</td>
                    <td className="px-3 py-2 text-white/62">{row.ratio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="app-surface rounded-[1.4rem] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="line-label">Sales Rep Leaderboard</p>
            <Link
              href="/admin/sales-reps"
              className="rounded-[0.65rem] border border-white/12 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.16em] text-white/72 transition hover:border-white/26 hover:text-white"
            >
              Open Reps
            </Link>
          </div>
          <div className="mt-3 overflow-auto rounded-[0.9rem] border border-white/10">
            <table className="w-full min-w-[620px] text-left">
              <thead className="bg-black/70">
                <tr className="text-[0.64rem] uppercase tracking-[0.18em] text-white/50">
                  <th className="px-3 py-2">Rep</th>
                  <th className="px-3 py-2">Assigned</th>
                  <th className="px-3 py-2">EOI</th>
                  <th className="px-3 py-2">Closed</th>
                  <th className="px-3 py-2">Disqualified</th>
                  <th className="px-3 py-2">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {ownerRows.map((row) => (
                  <tr
                    key={row.agent.id}
                    className="border-t border-white/8 bg-black/35 text-sm"
                  >
                    <td className="px-3 py-2 text-white/78">
                      <Link
                        href={`/admin/sales-reps/${row.agent.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {row.agent.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-white/62">{row.assigned}</td>
                    <td className="px-3 py-2 text-white/62">{row.eoi}</td>
                    <td className="px-3 py-2 text-white/62">{row.closed}</td>
                    <td className="px-3 py-2 text-white/62">{row.disqualified}</td>
                    <td className="px-3 py-2 text-white/62">{row.conversion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-surface rounded-[1rem] border border-white/10 bg-black/35 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-white/44">{label}</p>
      <p className="mt-2 text-2xl font-medium tracking-[-0.04em] text-white">{value}</p>
    </div>
  );
}

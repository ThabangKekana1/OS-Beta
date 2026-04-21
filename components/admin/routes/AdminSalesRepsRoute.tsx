"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import {
  DEAL_VALUE_ZAR,
  isEoiDeal,
  sumClosedDealValue,
  sumDealValue,
} from "@/lib/admin-kpis";

function toCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function AdminSalesRepsRoute() {
  const { agents, leads } = useAdminPortal();

  const repRows = useMemo(
    () =>
      agents.map((agent) => {
        const assigned = leads.filter((lead) => lead.ownerId === agent.id);
        const eoiDeals = assigned.filter(isEoiDeal);
        const closedDeals = assigned.filter((lead) => lead.stage === "Onboarding Complete");
        const disqualifiedDeals = assigned.filter((lead) => lead.stage === "Disqualified");
        const eoiValue = sumDealValue(eoiDeals);
        const closedValue = sumClosedDealValue(assigned);
        const avgReadiness =
          eoiDeals.length === 0
            ? 0
            : Math.round(
                eoiDeals.reduce((acc, lead) => acc + lead.readinessScore, 0) /
                  eoiDeals.length,
              );

        return {
          agent,
          assignedDeals: assigned.length,
          eoiDeals: eoiDeals.length,
          closedDeals: closedDeals.length,
          disqualifiedDeals: disqualifiedDeals.length,
          eoiValue,
          closedValue,
          avgReadiness,
        };
      }),
    [agents, leads],
  );

  const totalEoiValue = repRows.reduce((acc, row) => acc + row.eoiValue, 0);
  const totalClosedValue = repRows.reduce((acc, row) => acc + row.closedValue, 0);

  return (
    <div className="flex w-full flex-col gap-4 lg:gap-5">
      <section className="app-surface rounded-[1.6rem] px-5 py-5 lg:px-6 lg:py-6">
        <AdminHeader
          eyebrow="Sales Reps"
          title="Dedicated profiles for every sales rep."
          description="Open a rep profile to review assigned clients, stage progress, and contribution across the onboarding pipeline."
          actions={
            <div className="flex flex-wrap gap-2">
              <AdminBadge label={`${repRows.length} Sales Reps`} />
              <AdminBadge label={`EOI ${toCurrency(totalEoiValue)}`} tone="muted" />
              <AdminBadge label={`Closed ${toCurrency(totalClosedValue)}`} tone="muted" />
              <AdminBadge label={`${toCurrency(DEAL_VALUE_ZAR)} / Deal`} tone="muted" />
            </div>
          }
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="EOI Deals"
          value={String(
            repRows.reduce((acc, row) => acc + row.eoiDeals, 0),
          )}
        />
        <KpiCard
          label="Deals Closed"
          value={String(repRows.reduce((acc, row) => acc + row.closedDeals, 0))}
        />
        <KpiCard label="EOI Value" value={toCurrency(totalEoiValue)} />
        <KpiCard label="Deal Closed Value" value={toCurrency(totalClosedValue)} />
      </section>

      <section className="app-surface rounded-[1.4rem] p-4">
        <p className="line-label">Sales Rep Profiles</p>
        <div className="mt-3 overflow-auto rounded-[0.9rem] border border-white/10">
          <table className="w-full min-w-[1240px] text-left">
            <thead className="bg-black/70">
              <tr className="text-[0.64rem] uppercase tracking-[0.18em] text-white/50">
                <th className="px-3 py-2">Sales Rep</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Region</th>
                <th className="px-3 py-2">Assigned</th>
                <th className="px-3 py-2">EOI Deals</th>
                <th className="px-3 py-2">Deals Closed</th>
                <th className="px-3 py-2">Disqualified</th>
                <th className="px-3 py-2">Avg Readiness</th>
                <th className="px-3 py-2">EOI Value</th>
                <th className="px-3 py-2">Deal Closed Value</th>
                <th className="px-3 py-2">Open Profile</th>
              </tr>
            </thead>
            <tbody>
              {repRows.map((row) => (
                <tr key={row.agent.id} className="border-t border-white/8 bg-black/35 text-sm hover:bg-white/[0.04]">
                  <td className="px-3 py-2 text-white/78">
                    <Link
                      href={`/admin/sales-reps/${row.agent.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {row.agent.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-white/62">{row.agent.role}</td>
                  <td className="px-3 py-2 text-white/62">{row.agent.region}</td>
                  <td className="px-3 py-2 text-white/62">{row.assignedDeals}</td>
                  <td className="px-3 py-2 text-white/62">{row.eoiDeals}</td>
                  <td className="px-3 py-2 text-white/62">{row.closedDeals}</td>
                  <td className="px-3 py-2 text-white/62">{row.disqualifiedDeals}</td>
                  <td className="px-3 py-2 text-white/62">{row.avgReadiness}</td>
                  <td className="px-3 py-2 text-white/62">{toCurrency(row.eoiValue)}</td>
                  <td className="px-3 py-2 text-white/62">{toCurrency(row.closedValue)}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/sales-reps/${row.agent.id}`}
                      className="rounded-[0.65rem] border border-white/12 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.16em] text-white/72 transition hover:border-white/26 hover:text-white"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-surface rounded-[1.1rem] border border-white/10 bg-black/35 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-white/44">{label}</p>
      <p className="mt-2 text-2xl font-medium tracking-[-0.04em] text-white">{value}</p>
    </div>
  );
}

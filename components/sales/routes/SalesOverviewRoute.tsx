"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { RegistrationLinkCard } from "@/components/registration/RegistrationLinkCard";
import {
  getStatisticsPeriods,
  isWithinStatisticsPeriod,
  type StatisticsPeriod,
  type StatisticsPeriodId,
} from "@/lib/statistics-periods";
import type { AdminLead } from "@/lib/admin-types";

const SALES_AGENT_DEAL_VALUE_ZAR = 2_000;

function zar(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function countLeadsWithDocumentInPeriod(
  leads: AdminLead[],
  titlePattern: RegExp,
  period: StatisticsPeriod,
) {
  return leads.filter((lead) =>
    lead.documents.some(
      (document) =>
        titlePattern.test(document.title) &&
        isWithinStatisticsPeriod(document.uploadedAt, period),
    ),
  ).length;
}

export function SalesOverviewRoute({
  email,
  agentId,
}: {
  email: string;
  agentId: string | null;
}) {
  const { leads } = useAdminPortal();
  const visibleClients = agentId
    ? leads.filter((lead) => lead.ownerId === agentId)
    : leads;

  const openClients = visibleClients.filter(
    (lead) => !["Onboarding Complete", "Disqualified"].includes(lead.stage),
  );
  const completedClients = visibleClients.filter((lead) => lead.stage === "Onboarding Complete");
  const periods = getStatisticsPeriods();
  const [selectedPeriodId, setSelectedPeriodId] = useState<StatisticsPeriodId>("24h");
  const selectedPeriod =
    periods.find((period) => period.id === selectedPeriodId) ?? periods[0];
  const eoiCount = visibleClients.filter((lead) =>
    isWithinStatisticsPeriod(lead.eoiSignedAt, selectedPeriod),
  ).length;
  const closedCount = visibleClients.filter((lead) =>
    isWithinStatisticsPeriod(lead.onboardingCompletedAt, selectedPeriod),
  ).length;
  const selectedStats = [
    ["EOIs", String(eoiCount)],
    [
      "Utility Bills",
      String(
        countLeadsWithDocumentInPeriod(
          visibleClients,
          /6-month utility bill pack|utility bills|utility/i,
          selectedPeriod,
        ),
      ),
    ],
    [
      "Proposals",
      String(countLeadsWithDocumentInPeriod(visibleClients, /proposal/i, selectedPeriod)),
    ],
    [
      "Term Sheets",
      String(countLeadsWithDocumentInPeriod(visibleClients, /term sheet/i, selectedPeriod)),
    ],
    ["Closed", String(closedCount)],
    ["Closed Value", zar(closedCount * SALES_AGENT_DEAL_VALUE_ZAR)],
  ] satisfies Array<[string, string]>;
  const pendingDocuments = openClients.reduce(
    (sum, lead) => sum + lead.documents.filter((doc) => doc.status === "pending").length,
    0,
  );
  const avgReadiness = visibleClients.length
    ? Math.round(
      visibleClients.reduce((sum, lead) => sum + lead.readinessScore, 0) / visibleClients.length,
    )
    : 0;

  return (
    <div className="space-y-6 pb-8">
      <AdminHeader
        eyebrow="Sales Dashboard"
        title="Sales Dashboard"
        description="This dashboard is isolated to your sales profile so you can focus on your client book and onboarding progress."
        actions={<AdminBadge label={`${openClients.length} Active Clients`} tone="bright" />}
      />

      <RegistrationLinkCard
        email={email}
        role="sales"
        agentId={agentId}
      />

      <section className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/8 pb-3">
          <div>
            <p className="line-label">Sales Statistics</p>
            <p className="mt-2 text-sm text-white/56">
              Activity grouped by 24 hours, days, weeks, and months.
            </p>
          </div>
          <label className="flex min-w-[12rem] flex-col gap-2">
            <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
              Date Range
            </span>
            <select
              value={selectedPeriodId}
              onChange={(event) =>
                setSelectedPeriodId(event.target.value as StatisticsPeriodId)
              }
              className="h-10 rounded-xl border border-white/12 bg-black/45 px-3 text-sm font-medium text-white outline-none transition focus:border-white/32"
            >
              {periods.map((period) => (
                <option key={period.id} value={period.id} className="bg-zinc-950 text-white">
                  {period.label} - {period.caption}
                </option>
              ))}
            </select>
          </label>
        </div>

        <article className="mt-4 rounded-2xl border border-white/12 bg-black/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-medium tracking-[-0.03em] text-white">
                {selectedPeriod.label}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/42">
                {selectedPeriod.caption}
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.2em] text-white/58">
              {zar(SALES_AGENT_DEAL_VALUE_ZAR)} / Active Deal
            </span>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {selectedStats.map(([name, value]) => (
              <div key={name} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3">
                <dt className="text-xs text-white/52">{name}</dt>
                <dd className="mt-2 text-2xl font-medium tracking-[-0.04em] text-white">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
          <p className="line-label">Average readiness</p>
          <p className="mt-2 text-3xl font-medium tracking-[-0.04em] text-white">{avgReadiness}</p>
          <p className="mt-2 text-sm text-white/56">Average readiness score across your assigned leads.</p>
        </article>
        <article className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
          <p className="line-label">Active conversion</p>
          <p className="mt-2 text-3xl font-medium tracking-[-0.04em] text-white">
            {visibleClients.length === 0
              ? "0%"
              : `${Math.round((completedClients.length / visibleClients.length) * 100)}%`}
          </p>
          <p className="mt-2 text-sm text-white/56">Completed clients as a share of your assigned client book.</p>
        </article>
        <article className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
          <p className="line-label">Pending docs</p>
          <p className="mt-2 text-3xl font-medium tracking-[-0.04em] text-white">{pendingDocuments}</p>
          <p className="mt-2 text-sm text-white/56">Outstanding documentation across open leads.</p>
        </article>
      </section>

      <section className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between border-b border-white/8 pb-3">
          <p className="line-label">Recent Client Activity</p>
          <Link href="/sales/leads" className="text-xs uppercase tracking-[0.2em] text-white/58 transition hover:text-white">
            View all
          </Link>
        </div>

        <div className="mt-3 space-y-2">
          {visibleClients.slice(0, 5).map((lead) => (
            <article
              key={lead.id}
              className="rounded-xl border border-white/10 bg-black/25 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-white">{lead.company}</p>
                <span className="rounded-full border border-white/14 px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.18em] text-white/62">
                  {lead.stage}
                </span>
              </div>
              <p className="mt-2 text-xs text-white/56">Next action: {lead.nextAction}</p>
            </article>
          ))}

          {visibleClients.length === 0 ? (
            <p className="rounded-xl border border-white/8 bg-black/20 p-4 text-sm text-white/58">
              No client profiles are currently assigned to this profile.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

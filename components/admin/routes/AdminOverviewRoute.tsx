"use client";

import { useState } from "react";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { RegistrationLinkCard } from "@/components/registration/RegistrationLinkCard";
import { isSignupShellLead } from "@/lib/client-registration";
import {
  DEAL_VALUE_ZAR,
  isEoiDeal,
  sumDealValue,
} from "@/lib/admin-kpis";
import {
  getStatisticsPeriods,
  isWithinStatisticsPeriod,
  type StatisticsPeriodId,
} from "@/lib/statistics-periods";

function toCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function scoreTone(score: number) {
  if (score >= 80) return "High";
  if (score >= 60) return "Medium";
  return "Low";
}

export function AdminOverviewRoute({
  email,
  agentId,
}: {
  email: string;
  agentId: string | null;
}) {
  const { leads, salesLeads, registrationDrafts, leadStages, salesLeadQualificationStages, agents } =
    useAdminPortal();
  const eoiLeads = leads.filter(isEoiDeal);
  const periods = getStatisticsPeriods();
  const [selectedPeriodId, setSelectedPeriodId] = useState<StatisticsPeriodId>("24h");
  const selectedPeriod =
    periods.find((period) => period.id === selectedPeriodId) ?? periods[0];
  const eoiSignedLeads = leads.filter(
    (lead) => isEoiDeal(lead) && isWithinStatisticsPeriod(lead.eoiSignedAt, selectedPeriod),
  );
  const closedLeads = leads.filter((lead) =>
    isWithinStatisticsPeriod(lead.onboardingCompletedAt, selectedPeriod),
  );
  const newSalesLeads = salesLeads.filter((lead) =>
    isWithinStatisticsPeriod(lead.createdAt, selectedPeriod),
  );
  const activeRisks = eoiLeads.filter(
    (lead) =>
      /hour|yesterday|day/i.test(lead.lastTouched) &&
      (isWithinStatisticsPeriod(lead.eoiSignedAt, selectedPeriod) ||
        isWithinStatisticsPeriod(lead.onboardingCompletedAt, selectedPeriod)),
  );
  const salesLeadsInPeriod = salesLeads.filter((lead) =>
    isWithinStatisticsPeriod(lead.lastUpdatedAt, selectedPeriod),
  );
  const recentSignupLeads = leads.filter(isSignupShellLead).slice(0, 5);

  const selectedStats = [
    ["EOIs", String(eoiSignedLeads.length)],
    ["EOI Value", toCurrency(sumDealValue(eoiSignedLeads))],
    ["Closed", String(closedLeads.length)],
    ["Closed Value", toCurrency(sumDealValue(closedLeads))],
    ["Sales Leads", String(newSalesLeads.length)],
    ["SLA Risk", String(activeRisks.length)],
  ] satisfies Array<[string, string]>;
  const salesAgentStats = salesLeadQualificationStages.map((stage) => [
    stage,
    String(salesLeadsInPeriod.filter((lead) => lead.qualificationStage === stage).length),
  ]) satisfies Array<[string, string]>;

  return (
    <div className="flex flex-col gap-6">
      <section className="app-surface rounded-[2.2rem] px-5 py-5 lg:px-7 lg:py-6">
        <AdminHeader
          eyebrow="Admin CRM"
          title="Sales command centre for 1OS Migrate leads."
          description="Track pipeline health, revenue potential, and follow-through quality without touching the client migration workspace."
          actions={
            <div className="flex flex-wrap gap-2">
              <AdminBadge label={`${eoiLeads.length} EOI Deals`} />
              <AdminBadge label={`${registrationDrafts.length} Registrations In Progress`} tone="muted" />
              <AdminBadge label={`${agents.length} Team Members`} tone="muted" />
              <AdminBadge label={`${toCurrency(DEAL_VALUE_ZAR)} / Deal`} tone="muted" />
            </div>
          }
        />
      </section>

      <RegistrationLinkCard
        email={email}
        role="admin"
        agentId={agentId}
      />

      <section className="app-surface rounded-[2rem] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/8 pb-4">
          <div>
            <p className="line-label">Statistics</p>
            <p className="mt-2 text-sm text-white/56">
              Pipeline movement organised by 24 hours, days, weeks, and months.
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

        <PeriodStatCard
          label={selectedPeriod.label}
          caption={selectedPeriod.caption}
          stats={selectedStats}
        />

        <PeriodStatCard
          label="All Sales Agents"
          caption={`Qualification stages in ${selectedPeriod.caption.toLowerCase()}`}
          stats={salesAgentStats}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="app-surface rounded-[2rem] p-5">
          <div className="flex items-center justify-between">
            <p className="line-label">Registrations In Progress</p>
            <AdminBadge label={String(registrationDrafts.length)} tone="muted" />
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {registrationDrafts.length === 0 ? (
              <div className="rounded-[1rem] border border-white/10 bg-black/40 px-4 py-4 text-sm text-white/54">
                No active registration drafts.
              </div>
            ) : (
              registrationDrafts.slice(0, 5).map((draft) => (
                <div
                  key={draft.workspaceId}
                  className="rounded-[1rem] border border-white/10 bg-black/40 px-4 py-4"
                >
                  <p className="text-sm font-medium text-white">
                    {draft.fields.businessName?.trim() || "Unnamed business"}
                  </p>
                  <p className="mt-1 text-xs text-white/42">
                    {draft.fields.contactFirstName || draft.fields.contactSurname
                      ? `${draft.fields.contactFirstName ?? ""} ${draft.fields.contactSurname ?? ""}`.trim()
                      : "Contact not fully captured"}
                    {draft.fields.contactEmail ? ` • ${draft.fields.contactEmail}` : ""}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-amber-200/80">
                    Updated {new Date(draft.updatedAt).toLocaleString("en-ZA")}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="app-surface rounded-[2rem] p-5">
          <div className="flex items-center justify-between">
            <p className="line-label">Recent Client Signups</p>
            <AdminBadge label={String(recentSignupLeads.length)} tone="muted" />
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {recentSignupLeads.length === 0 ? (
              <div className="rounded-[1rem] border border-white/10 bg-black/40 px-4 py-4 text-sm text-white/54">
                No recent account signups waiting for business details.
              </div>
            ) : (
              recentSignupLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="rounded-[1rem] border border-white/10 bg-black/40 px-4 py-4"
                >
                  <p className="text-sm font-medium text-white">{lead.contactName}</p>
                  <p className="mt-1 text-xs text-white/42">{lead.userProfile.email}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-sky-200/80">
                    {lead.stage} • {lead.company}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="app-surface rounded-[2rem] p-5">
          <div className="flex items-center justify-between">
            <p className="line-label">Pipeline Snapshot</p>
            <AdminBadge label="By Stage" tone="muted" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {leadStages.map((stage) => {
              const count = leads.filter((lead) => lead.stage === stage).length;
              return (
                <div key={stage} className="rounded-[1rem] border border-white/10 bg-black/40 px-4 py-4">
                  <p className="text-sm text-white/74">{stage}</p>
                  <p className="mt-2 text-2xl font-medium tracking-[-0.05em] text-white">{count}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="app-surface rounded-[2rem] p-5">
          <div className="flex items-center justify-between">
            <p className="line-label">Top Ready Leads</p>
            <AdminBadge label="Readiness" tone="muted" />
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {[...eoiLeads]
              .sort((a, b) => b.readinessScore - a.readinessScore)
              .slice(0, 5)
              .map((lead) => (
                <div
                  key={lead.id}
                  className="rounded-[1rem] border border-white/10 bg-black/40 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{lead.company}</p>
                      <p className="mt-1 text-xs text-white/42">
                        {lead.stage} • {lead.priority}
                      </p>
                    </div>
                    <span className="rounded-full border border-white/12 px-2.5 py-1 text-xs uppercase tracking-[0.2em] text-white/62">
                      {scoreTone(lead.readinessScore)} {lead.readinessScore}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function PeriodStatCard({
  label,
  caption,
  stats,
}: {
  label: string;
  caption: string;
  stats: Array<[string, string]>;
}) {
  return (
    <article className="mt-4 rounded-[1.25rem] border border-white/10 bg-black/35 p-4">
      <div>
        <p className="text-lg font-medium tracking-[-0.03em] text-white">{label}</p>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/42">{caption}</p>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map(([name, value]) => (
          <div key={name} className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3">
            <dt className="text-xs text-white/52">{name}</dt>
            <dd className="mt-2 text-2xl font-medium tracking-[-0.04em] text-white">{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

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
import type { AdminLead } from "@/lib/admin-types";

function toCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function clientDocCount(lead: AdminLead) {
  return lead.documents.filter((doc) => doc.uploadedByType === "Client").length;
}

function salesDocCount(lead: AdminLead) {
  return lead.documents.filter((doc) => doc.uploadedByType === "Sales Team").length;
}

function getRepEmail(name: string) {
  const normalized = name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, ".");
  return `${normalized}@1os.africa`;
}

export function AdminSalesRepProfileRoute({ repId }: { repId: string }) {
  const { agents, leads } = useAdminPortal();

  const rep = agents.find((agent) => agent.id === repId) ?? null;
  const assignedLeads = useMemo(
    () => leads.filter((lead) => lead.ownerId === repId),
    [leads, repId],
  );

  if (!rep) {
    return (
      <div className="flex w-full flex-col gap-4 lg:gap-5">
        <section className="app-surface rounded-[1.6rem] px-5 py-5 lg:px-6 lg:py-6">
          <AdminHeader
            eyebrow="Sales Rep Profile"
            title="Sales rep not found."
            description="The selected sales rep profile does not exist."
            actions={
              <Link
                href="/admin/sales-reps"
                className="rounded-[0.8rem] border border-white/16 px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/78 transition hover:border-white/26 hover:text-white"
              >
                Back to Sales Reps
              </Link>
            }
          />
        </section>
      </div>
    );
  }

  const eoiDeals = assignedLeads.filter(isEoiDeal);
  const closedDeals = assignedLeads.filter(
    (lead) => lead.stage === "Onboarding Complete",
  );
  const disqualifiedDeals = assignedLeads.filter(
    (lead) => lead.stage === "Disqualified",
  );
  const eoiValue = sumDealValue(eoiDeals);
  const dealClosedValue = sumClosedDealValue(assignedLeads);
  const avgReadiness =
    eoiDeals.length === 0
      ? 0
      : Math.round(
          eoiDeals.reduce((acc, lead) => acc + lead.readinessScore, 0) /
            eoiDeals.length,
        );

  return (
    <div className="flex w-full flex-col gap-4 lg:gap-5">
      <section className="app-surface rounded-[1.6rem] px-5 py-5 lg:px-6 lg:py-6">
        <AdminHeader
          eyebrow="Sales Rep Profile"
          title={rep.name}
          description="Performance, assigned client profiles, and active deal flow for this sales rep."
          actions={
            <div className="flex flex-wrap gap-2">
              <AdminBadge label={rep.role} />
              <AdminBadge label={rep.region} tone="muted" />
            </div>
          }
        />
      </section>

      <section className="app-surface rounded-[1.4rem] p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Assigned Deals" value={String(assignedLeads.length)} />
          <StatCard label="EOI Deals" value={String(eoiDeals.length)} />
          <StatCard label="Deals Closed" value={String(closedDeals.length)} />
          <StatCard label="Avg Readiness" value={String(avgReadiness)} />
          <StatCard label="EOI Value" value={toCurrency(eoiValue)} />
          <StatCard label="Deal Closed Value" value={toCurrency(dealClosedValue)} />
        </div>
        <p className="mt-3 text-sm text-white/56">
          Profile contact: {getRepEmail(rep.name)} • Disqualified deals:{" "}
          {disqualifiedDeals.length}
        </p>
      </section>

      <section className="app-surface rounded-[1.4rem] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="line-label">Assigned Client Profiles</p>
          <Link
            href="/admin/sales-reps"
            className="rounded-[0.65rem] border border-white/12 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.16em] text-white/72 transition hover:border-white/26 hover:text-white"
          >
            Back to Sales Reps
          </Link>
        </div>

        <div className="mt-3 overflow-auto rounded-[0.9rem] border border-white/10">
          <table className="w-full min-w-[1120px] text-left">
            <thead className="bg-black/70">
              <tr className="text-[0.64rem] uppercase tracking-[0.18em] text-white/50">
                <th className="px-3 py-2">Business</th>
                <th className="px-3 py-2">Client Profile</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Readiness</th>
                <th className="px-3 py-2">Client Docs</th>
                <th className="px-3 py-2">Sales Docs</th>
                <th className="px-3 py-2">Deal Value</th>
                <th className="px-3 py-2">Open</th>
              </tr>
            </thead>
            <tbody>
              {assignedLeads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-sm text-white/54">
                    No client profiles are currently assigned to this sales rep.
                  </td>
                </tr>
              ) : (
                assignedLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-t border-white/8 bg-black/35 text-sm hover:bg-white/[0.04]"
                  >
                    <td className="px-3 py-2 text-white/78">{lead.company}</td>
                    <td className="px-3 py-2 text-white/62">{lead.clientProfileId}</td>
                    <td className="px-3 py-2 text-white/62">{lead.stage}</td>
                    <td className="px-3 py-2 text-white/62">{lead.priority}</td>
                    <td className="px-3 py-2 text-white/62">{lead.readinessScore}</td>
                    <td className="px-3 py-2 text-white/62">{clientDocCount(lead)}</td>
                    <td className="px-3 py-2 text-white/62">{salesDocCount(lead)}</td>
                    <td className="px-3 py-2 text-white/62">
                      {toCurrency(DEAL_VALUE_ZAR)}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/clients/${lead.clientProfileId}`}
                        className="rounded-[0.65rem] border border-white/12 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.16em] text-white/72 transition hover:border-white/26 hover:text-white"
                      >
                        Open Profile
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[0.9rem] border border-white/10 bg-black/35 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-white/44">{label}</p>
      <p className="mt-2 text-2xl font-medium tracking-[-0.04em] text-white">{value}</p>
    </div>
  );
}

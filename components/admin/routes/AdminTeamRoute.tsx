"use client";

import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";

function scoreWorkload(openLeads: number, priorityLeads: number) {
  return openLeads * 10 + priorityLeads * 15;
}

export function AdminTeamRoute() {
  const { agents, leads } = useAdminPortal();

  const teamCards = agents.map((agent) => {
    const assigned = leads.filter((lead) => lead.ownerId === agent.id);
    const openLeads = assigned.filter(
      (lead) => !["Onboarding Complete", "Disqualified"].includes(lead.stage),
    );
    const priorityLeads = openLeads.filter((lead) => lead.priority !== "Standard");
    const completedLeads = assigned.filter(
      (lead) => lead.stage === "Onboarding Complete",
    );
    const avgReadiness =
      openLeads.length === 0
        ? 0
        : Math.round(
            openLeads.reduce((acc, lead) => acc + lead.readinessScore, 0) /
              openLeads.length,
          );

    return {
      agent,
      openLeads: openLeads.length,
      priorityLeads: priorityLeads.length,
      completedLeads: completedLeads.length,
      avgReadiness,
      workload: scoreWorkload(openLeads.length, priorityLeads.length),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <section className="app-surface rounded-[2.2rem] px-5 py-5 lg:px-7 lg:py-6">
        <AdminHeader
          eyebrow="Team Performance"
          title="Keep assignment balanced and execution consistent."
          description="Review workloads, lead quality, and win progression across your sales team."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {teamCards.map((card) => (
          <article key={card.agent.id} className="app-surface rounded-[1.6rem] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="line-label">{card.agent.role}</p>
                <h2 className="mt-2 text-2xl font-medium tracking-[-0.04em] text-white">
                  {card.agent.name}
                </h2>
                <p className="mt-1 text-sm text-white/52">{card.agent.region}</p>
              </div>
              <AdminBadge label={`Load ${card.workload}`} tone="muted" />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Metric label="Open Leads" value={card.openLeads} />
              <Metric label="Priority Leads" value={card.priorityLeads} />
              <Metric label="Completed" value={card.completedLeads} />
              <Metric label="Avg Readiness" value={card.avgReadiness} />
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1rem] border border-white/10 bg-black/35 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.2em] text-white/42">{label}</p>
      <p className="mt-2 text-2xl font-medium tracking-[-0.04em] text-white">{value}</p>
    </div>
  );
}

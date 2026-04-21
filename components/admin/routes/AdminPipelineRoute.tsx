"use client";

import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { sumDealValue } from "@/lib/admin-kpis";

function toCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function AdminPipelineRoute() {
  const { leads, leadStages, agents } = useAdminPortal();
  const agentMap = new Map(agents.map((agent) => [agent.id, agent.name]));

  return (
    <div className="flex flex-col gap-6">
      <section className="app-surface rounded-[2.2rem] px-5 py-5 lg:px-7 lg:py-6">
        <AdminHeader
          eyebrow="Pipeline Board"
          title="See movement, bottlenecks, and value at each stage."
          description="This board is isolated to internal sales operations and mirrors the 1OS visual language without reusing migration workflow logic."
        />
      </section>

      <section className="app-surface rounded-[2rem] p-4 lg:p-5">
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-4">
            {leadStages.map((stage) => {
              const stageLeads = leads.filter((lead) => lead.stage === stage);
              const stageValue = sumDealValue(stageLeads);

              return (
                <div
                  key={stage}
                  className="w-[18rem] rounded-[1.5rem] border border-white/10 bg-black/45 p-4"
                >
                  <div className="border-b border-white/8 pb-3">
                    <p className="line-label">{stage}</p>
                    <p className="mt-2 text-2xl font-medium tracking-[-0.06em] text-white">
                      {stageLeads.length}
                    </p>
                    <p className="mt-1 text-xs text-white/42">{toCurrency(stageValue)}</p>
                  </div>

                  <div className="mt-4 flex flex-col gap-3">
                    {stageLeads.length === 0 ? (
                      <div className="rounded-[1rem] border border-dashed border-white/8 px-4 py-5 text-sm text-white/34">
                        No leads in this stage.
                      </div>
                    ) : (
                      stageLeads.map((lead) => (
                        <div
                          key={lead.id}
                          className="rounded-[1rem] border border-white/8 bg-white/[0.02] px-4 py-4"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-white">{lead.company}</p>
                              <p className="mt-1 text-xs text-white/42">
                                {lead.contactName}
                              </p>
                            </div>
                            <AdminBadge
                              label={lead.priority}
                              tone={lead.priority === "Standard" ? "muted" : "neutral"}
                            />
                          </div>
                          <p className="mt-3 text-xs text-white/48">
                            Owner: {agentMap.get(lead.ownerId) ?? "Unassigned"}
                          </p>
                          <p className="mt-1 text-xs text-white/48">
                            Readiness: {lead.readinessScore}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-white/64">{lead.nextAction}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

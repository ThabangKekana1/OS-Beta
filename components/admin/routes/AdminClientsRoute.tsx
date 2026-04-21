"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import type { AdminLead, AdminLeadStage } from "@/lib/admin-types";

function clientDocCount(documents: AdminLead["documents"]) {
  return documents.filter((doc) => doc.uploadedByType === "Client").length;
}

function salesDocCount(documents: AdminLead["documents"]) {
  return documents.filter((doc) => doc.uploadedByType === "Sales Team").length;
}

export function AdminClientsRoute() {
  const { leads, agents, leadStages } = useAdminPortal();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<AdminLeadStage | "All">("All");
  const [ownerFilter, setOwnerFilter] = useState<string>("All");

  const ownerMap = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent.name])),
    [agents],
  );

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (stageFilter !== "All" && lead.stage !== stageFilter) return false;
      if (ownerFilter !== "All" && lead.ownerId !== ownerFilter) return false;
      if (!query) return true;

      return (
        lead.company.toLowerCase().includes(query) ||
        lead.clientProfileId.toLowerCase().includes(query) ||
        lead.contactName.toLowerCase().includes(query) ||
        lead.userProfile.email.toLowerCase().includes(query) ||
        lead.businessRegistrationNumber.toLowerCase().includes(query)
      );
    });
  }, [leads, ownerFilter, search, stageFilter]);

  return (
    <div className="flex w-full flex-col gap-4 lg:gap-5">
      <section className="app-surface rounded-[1.6rem] px-5 py-5 lg:px-6 lg:py-6">
        <AdminHeader
          eyebrow="Clients"
          title="Client directory with dedicated onboarding profiles."
          description="Select any client and open a full profile page with their stage, owner, files, and onboarding workflow."
          actions={
            <div className="flex gap-2">
              <AdminBadge label={`${filteredClients.length} Client Profiles`} />
              <Link
                href="/admin/registration"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-white/16 bg-white/[0.14] px-4 py-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-white transition hover:border-white/30 hover:bg-white/[0.22]"
              >
                Register Client
              </Link>
            </div>
          }
        />
      </section>

      <section className="app-surface rounded-[1.4rem] p-4 lg:p-5">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-[1.4fr_1fr_1fr]">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.2em] text-white/45">Search Client</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Business, profile ID, reg number..."
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.2em] text-white/45">Stage</span>
            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value as AdminLeadStage | "All")}
              className="admin-input admin-select rounded-[0.8rem] px-3 py-2 text-sm"
            >
              <option value="All">All stages</option>
              {leadStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.2em] text-white/45">Owner</span>
            <select
              value={ownerFilter}
              onChange={(event) => setOwnerFilter(event.target.value)}
              className="admin-input admin-select rounded-[0.8rem] px-3 py-2 text-sm"
            >
              <option value="All">All owners</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="app-surface rounded-[1.4rem] p-4">
        <p className="line-label">Client Profiles</p>
        <div className="mt-3 overflow-auto rounded-[0.9rem] border border-white/10">
          <table className="w-full min-w-[1180px] text-left">
            <thead className="bg-black/70">
              <tr className="text-[0.64rem] uppercase tracking-[0.18em] text-white/50">
                <th className="px-3 py-2">Business</th>
                <th className="px-3 py-2">Profile ID</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Primary Contact</th>
                <th className="px-3 py-2">Client Docs</th>
                <th className="px-3 py-2">Sales Docs</th>
                <th className="px-3 py-2">Last Touched</th>
                <th className="px-3 py-2">Open</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-sm text-white/54">
                    No clients match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredClients.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => router.push(`/admin/clients/${lead.clientProfileId}`)}
                    className="border-t border-white/8 bg-black/35 text-sm hover:bg-white/[0.04]"
                  >
                    <td className="px-3 py-2 text-white/78">
                      <Link
                        href={`/admin/clients/${lead.clientProfileId}`}
                        onClick={(event) => event.stopPropagation()}
                        className="underline-offset-4 hover:underline"
                      >
                        {lead.company}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-white/62">{lead.clientProfileId}</td>
                    <td className="px-3 py-2 text-white/62">{lead.stage}</td>
                    <td className="px-3 py-2 text-white/62">
                      <Link
                        href={`/admin/sales-reps/${lead.ownerId}`}
                        onClick={(event) => event.stopPropagation()}
                        className="underline-offset-4 hover:underline"
                      >
                        {ownerMap.get(lead.ownerId) ?? "Unassigned"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-white/62">
                      {lead.contactName}
                      <span className="block text-xs text-white/42">Profile No: {lead.clientProfileId}</span>
                    </td>
                    <td className="px-3 py-2 text-white/62">{clientDocCount(lead.documents)}</td>
                    <td className="px-3 py-2 text-white/62">{salesDocCount(lead.documents)}</td>
                    <td className="px-3 py-2 text-white/52">{lead.lastTouched}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/clients/${lead.clientProfileId}`}
                        onClick={(event) => event.stopPropagation()}
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

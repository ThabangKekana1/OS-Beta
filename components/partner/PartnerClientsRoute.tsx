"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { adminLeadStages, type AdminLead, type AdminLeadStage } from "@/lib/admin-types";
import { cn } from "@/lib/utils";

function clientDocCount(documents: AdminLead["documents"]) {
  return documents.filter((doc) => doc.uploadedByType === "Client").length;
}

function stageBadgeClass(stage: AdminLeadStage) {
  switch (stage) {
    case "Onboarding Complete":
      return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
    case "Disqualified":
      return "border-rose-400/40 bg-rose-400/10 text-rose-200";
    case "EOI Signed":
    case "Utility Bills Uploaded":
    case "Compliance Pack Uploaded":
    case "Term Sheet Uploaded":
      return "border-sky-400/40 bg-sky-400/10 text-sky-200";
    default:
      return "border-white/14 bg-white/[0.04] text-white/70";
  }
}

export function PartnerClientsRoute({ clients }: { clients: AdminLead[] }) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<AdminLeadStage | "All">("All");

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    return clients.filter((lead) => {
      if (stageFilter !== "All" && lead.stage !== stageFilter) return false;
      if (!query) return true;

      return (
        lead.company.toLowerCase().includes(query) ||
        lead.clientProfileId.toLowerCase().includes(query) ||
        lead.contactName.toLowerCase().includes(query) ||
        lead.userProfile.email.toLowerCase().includes(query) ||
        lead.businessRegistrationNumber.toLowerCase().includes(query)
      );
    });
  }, [clients, search, stageFilter]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 py-6">
      <section className="app-surface rounded-[1.6rem] px-5 py-5 lg:px-6 lg:py-6">
        <AdminHeader
          eyebrow="Partner Clients"
          title="Registered business clients."
          description="Clients are businesses that have completed registration through your partner dashboard or have been converted from your referred leads."
          actions={
            <div className="flex flex-wrap gap-2">
              <AdminBadge label={`${filteredClients.length} Clients`} />
              <Link
                href="/partner/registration"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-white/16 bg-white/[0.14] px-4 py-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-white transition hover:border-white/30 hover:bg-white/[0.22]"
              >
                Register Client
              </Link>
            </div>
          }
        />
      </section>

      <section className="app-surface rounded-[1.4rem] p-4 lg:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr]">
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
              {adminLeadStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="app-surface rounded-[1.4rem] p-4">
        <p className="line-label">Client Profiles</p>
        <div className="mt-3 overflow-auto rounded-[0.9rem] border border-white/10">
          <table className="w-full min-w-[1040px] text-left">
            <thead className="bg-black/70">
              <tr className="text-[0.64rem] uppercase tracking-[0.18em] text-white/50">
                <th className="px-3 py-2">Business</th>
                <th className="px-3 py-2">Profile ID</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Primary Contact</th>
                <th className="px-3 py-2">Reg Number</th>
                <th className="px-3 py-2">Client Docs</th>
                <th className="px-3 py-2">Last Touched</th>
                <th className="px-3 py-2">Contact</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-sm text-white/54">
                    {clients.length === 0
                      ? "No registered clients yet. Register a business from the Registration tab."
                      : "No clients match the selected filters."}
                  </td>
                </tr>
              ) : (
                filteredClients.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-t border-white/8 bg-black/35 text-sm hover:bg-white/[0.04]"
                  >
                    <td className="px-3 py-2 text-white/78">{lead.company}</td>
                    <td className="px-3 py-2 text-white/62">{lead.clientProfileId}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[0.6rem] uppercase tracking-[0.2em]",
                          stageBadgeClass(lead.stage),
                        )}
                      >
                        {lead.stage}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-white/62">
                      {lead.contactName}
                      <span className="block text-xs text-white/42">{lead.userProfile.email}</span>
                    </td>
                    <td className="px-3 py-2 text-white/62">{lead.businessRegistrationNumber}</td>
                    <td className="px-3 py-2 text-white/62">{clientDocCount(lead.documents)}</td>
                    <td className="px-3 py-2 text-white/52">{lead.lastTouched}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/partner/inbox?to=${encodeURIComponent(lead.userProfile.email)}`}
                        className="rounded-[0.65rem] border border-white/12 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.16em] text-white/72 transition hover:border-white/26 hover:text-white"
                      >
                        Email
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

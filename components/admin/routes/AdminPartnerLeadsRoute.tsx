"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SalesLead } from "@/lib/admin-types";
import { cn } from "@/lib/utils";

type AgentOption = { id: string; name: string; role: string };
type PartnerOrgOption = { id: string; name: string };

export function AdminPartnerLeadsRoute({
  initialLeads,
  salesAgents,
  partnerOrgs,
}: {
  initialLeads: SalesLead[];
  salesAgents: AgentOption[];
  partnerOrgs: PartnerOrgOption[];
}) {
  const router = useRouter();
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "unassigned" | "assigned">(
    "unassigned",
  );
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const partnerOrgMap = useMemo(
    () => new Map(partnerOrgs.map((org) => [org.id, org.name])),
    [partnerOrgs],
  );
  const agentMap = useMemo(
    () => new Map(salesAgents.map((agent) => [agent.id, agent.name])),
    [salesAgents],
  );

  const filtered = useMemo(() => {
    return initialLeads
      .filter((lead) => {
        if (orgFilter !== "all" && lead.partnerOrgId !== orgFilter) return false;
        const assigned = Boolean(lead.ownerId);
        if (statusFilter === "unassigned" && assigned) return false;
        if (statusFilter === "assigned" && !assigned) return false;
        return true;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [initialLeads, orgFilter, statusFilter]);

  async function assignLead(id: string, ownerId: string) {
    if (!ownerId) return;
    setError(null);
    setPendingId(id);
    try {
      const response = await fetch("/api/admin/partner-leads", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ownerId }),
      });
      const json = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Could not assign lead.");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 py-6">
      <header>
        <p className="line-label">Admin</p>
        <h1 className="mt-1 text-2xl font-medium tracking-[-0.03em] text-white">
          Partner Leads
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/58">
          Inbox for leads referred by partner organisations. Assign each lead to a
          sales rep to begin qualification.
        </p>
      </header>

      <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.02]">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/8 px-5 py-4">
          <FilterGroup
            label="Status"
            value={statusFilter}
            options={[
              { value: "unassigned", label: "Unassigned" },
              { value: "assigned", label: "Assigned" },
              { value: "all", label: "All" },
            ]}
            onChange={(value) => setStatusFilter(value as typeof statusFilter)}
          />
          <FilterGroup
            label="Partner"
            value={orgFilter}
            options={[
              { value: "all", label: "All partners" },
              ...partnerOrgs.map((org) => ({ value: org.id, label: org.name })),
            ]}
            onChange={setOrgFilter}
          />
          <span className="ml-auto text-xs text-white/50">
            {filtered.length} of {initialLeads.length}
          </span>
        </div>

        {error ? (
          <div className="border-b border-rose-400/20 bg-rose-400/5 px-5 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-white/55">
            No partner leads match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[0.65rem] uppercase tracking-[0.2em] text-white/45">
                <tr>
                  <th className="px-5 py-3 font-normal">Contact</th>
                  <th className="px-5 py-3 font-normal">Company</th>
                  <th className="px-5 py-3 font-normal">Partner</th>
                  <th className="px-5 py-3 font-normal">Submitted</th>
                  <th className="px-5 py-3 font-normal">Assigned to</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6 text-white/82">
                {filtered.map((lead) => {
                  const partnerName = lead.partnerOrgId
                    ? partnerOrgMap.get(lead.partnerOrgId) ?? "Unknown"
                    : "—";
                  return (
                    <tr key={lead.id}>
                      <td className="px-5 py-3">
                        <div>{lead.contactName}</div>
                        <div className="text-xs text-white/50">{lead.email}</div>
                      </td>
                      <td className="px-5 py-3">{lead.company}</td>
                      <td className="px-5 py-3 text-white/65">{partnerName}</td>
                      <td className="px-5 py-3 text-white/55">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={lead.ownerId ?? ""}
                          disabled={pendingId === lead.id}
                          onChange={(event) => assignLead(lead.id, event.target.value)}
                          className={cn(
                            "rounded-full border bg-white/[0.04] px-3 py-1.5 text-xs text-white focus:outline-none",
                            lead.ownerId
                              ? "border-emerald-400/30"
                              : "border-amber-400/30",
                            pendingId === lead.id && "opacity-60",
                          )}
                        >
                          <option value="" disabled>
                            {lead.ownerId
                              ? agentMap.get(lead.ownerId) ?? "—"
                              : "Select sales rep…"}
                          </option>
                          {salesAgents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name} · {agent.role}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-white/55">
      <span className="uppercase tracking-[0.2em]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs text-white focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { SalesLead, SalesLeadQualificationStage } from "@/lib/admin-types";
import { cn } from "@/lib/utils";

const STAGE_OPTIONS: Array<SalesLeadQualificationStage | "All"> = [
  "All",
  "Havent Contacted",
  "Contacted",
  "Interested",
  "Not Interested",
  "Does Not Qualify",
  "Qualifies",
];

function stageBadgeClass(stage: SalesLeadQualificationStage) {
  switch (stage) {
    case "Qualifies":
      return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
    case "Interested":
      return "border-sky-400/40 bg-sky-400/10 text-sky-200";
    case "Not Interested":
    case "Does Not Qualify":
      return "border-rose-400/40 bg-rose-400/10 text-rose-200";
    case "Contacted":
      return "border-amber-400/40 bg-amber-400/10 text-amber-200";
    default:
      return "border-white/14 bg-white/[0.04] text-white/70";
  }
}

export function PartnerLeadsTable({ leads }: { leads: SalesLead[] }) {
  const [stageFilter, setStageFilter] = useState<(typeof STAGE_OPTIONS)[number]>("All");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (stageFilter !== "All" && lead.qualificationStage !== stageFilter) return false;
      if (!q) return true;
      return (
        lead.contactName.toLowerCase().includes(q) ||
        lead.company.toLowerCase().includes(q) ||
        lead.email.toLowerCase().includes(q)
      );
    });
  }, [leads, stageFilter, query]);

  return (
    <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.02]">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/8 px-5 py-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, company, or email"
          className="w-full max-w-xs rounded-full border border-white/12 bg-white/[0.03] px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/30 focus:outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {STAGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStageFilter(option)}
              className={cn(
                "rounded-full border px-3 py-1 text-[0.7rem] uppercase tracking-[0.18em] transition",
                stageFilter === option
                  ? "border-white/30 bg-white/[0.08] text-white"
                  : "border-white/10 bg-transparent text-white/55 hover:border-white/20 hover:text-white/80",
              )}
            >
              {option}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-white/50">
          {filtered.length} of {leads.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-white/55">
          {leads.length === 0
            ? "You haven't submitted any leads yet."
            : "No leads match the current filter."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[0.65rem] uppercase tracking-[0.2em] text-white/45">
              <tr>
                <th className="px-5 py-3 font-normal">Contact</th>
                <th className="px-5 py-3 font-normal">Company</th>
                <th className="px-5 py-3 font-normal">Email</th>
                <th className="px-5 py-3 font-normal">Stage</th>
                <th className="px-5 py-3 font-normal">Status</th>
                <th className="px-5 py-3 font-normal">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6 text-white/82">
              {filtered.map((lead) => (
                <tr key={lead.id}>
                  <td className="px-5 py-3">{lead.contactName}</td>
                  <td className="px-5 py-3">{lead.company}</td>
                  <td className="px-5 py-3 text-white/65">{lead.email}</td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[0.6rem] uppercase tracking-[0.2em]",
                        stageBadgeClass(lead.qualificationStage),
                      )}
                    >
                      {lead.qualificationStage}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-white/65">{lead.status}</td>
                  <td className="px-5 py-3 text-white/55">
                    {new Date(lead.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

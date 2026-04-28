"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { downloadCsvFile, sanitizeFileSegment } from "@/lib/download-utils";
import {
  adminLeadOriginLabels,
  adminLeadOrigins,
  type AdminLead,
  type AdminLeadOrigin,
} from "@/lib/admin-types";

const ALL = "all" as const;

type BusinessRow = {
  key: string;
  clientProfileId: string;
  leadId: string;
  company: string;
  businessRegistrationNumber: string;
  industry: string;
  province: string;
  city: string;
  ownerId: string;
  contactName: string;
  email: string;
  origin: AdminLeadOrigin;
  contactStatus: AdminLead["contactStatus"];
  stage: AdminLead["stage"];
  lastTouched: string;
  leadCount: number;
};

function buildBusinessRows(leads: AdminLead[]): BusinessRow[] {
  const map = new Map<string, BusinessRow>();
  leads.forEach((lead) => {
    const key =
      (lead.businessRegistrationNumber || "").trim().toLowerCase() ||
      lead.company.trim().toLowerCase();
    if (!key) return;
    const existing = map.get(key);
    const origin = (lead.origin ?? "created") as AdminLeadOrigin;
    if (!existing) {
      map.set(key, {
        key,
        clientProfileId: lead.clientProfileId,
        leadId: lead.id,
        company: lead.company,
        businessRegistrationNumber: lead.businessRegistrationNumber,
        industry: lead.industry,
        province: lead.province,
        city: lead.city,
        ownerId: lead.ownerId,
        contactName: lead.contactName,
        email: lead.userProfile.email,
        origin,
        contactStatus: lead.contactStatus,
        stage: lead.stage,
        lastTouched: lead.lastTouched,
        leadCount: 1,
      });
    } else {
      existing.leadCount += 1;
      if (!existing.clientProfileId && lead.clientProfileId) {
        existing.clientProfileId = lead.clientProfileId;
        existing.leadId = lead.id;
      }
    }
  });
  return Array.from(map.values());
}

export function AdminBusinessesRoute() {
  const { leads, agents, contactStatuses } = useAdminPortal();
  const router = useRouter();

  const ownerNameById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent.name])),
    [agents],
  );

  const businesses = useMemo(
    () => buildBusinessRows(leads.filter((lead) => lead.isClientRegistered)),
    [leads],
  );

  const industries = useMemo(() => {
    const set = new Set<string>();
    businesses.forEach((b) => {
      if (b.industry) set.add(b.industry);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [businesses]);

  const [industryFilter, setIndustryFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [ownerFilter, setOwnerFilter] = useState<string>(ALL);
  const [originFilter, setOriginFilter] = useState<string>(ALL);
  const [search, setSearch] = useState("");

  const visibleBusinesses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return businesses.filter((b) => {
      if (industryFilter !== ALL && b.industry !== industryFilter) return false;
      if (statusFilter !== ALL && b.contactStatus !== statusFilter) return false;
      if (ownerFilter !== ALL && b.ownerId !== ownerFilter) return false;
      if (originFilter !== ALL && b.origin !== originFilter) return false;
      if (query.length > 0) {
        const haystack = [
          b.company,
          b.businessRegistrationNumber,
          b.industry,
          b.province,
          b.city,
          b.contactName,
          b.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [businesses, industryFilter, statusFilter, ownerFilter, originFilter, search]);

  const handleExport = () => {
    const dateTag = new Date().toISOString().slice(0, 10);
    const filename = `${sanitizeFileSegment(`businesses-${industryFilter}-${originFilter}`)}-${dateTag}.csv`;
    const rows = [
      [
        "Company",
        "Reg Number",
        "Industry",
        "Province",
        "City",
        "Primary Contact",
        "Email",
        "Owner",
        "Source",
        "Contact Status",
        "Stage",
        "Lead Count",
      ],
      ...visibleBusinesses.map((b) => [
        b.company,
        b.businessRegistrationNumber,
        b.industry,
        b.province,
        b.city,
        b.contactName,
        b.email,
        ownerNameById.get(b.ownerId) ?? b.ownerId,
        adminLeadOriginLabels[b.origin],
        b.contactStatus,
        b.stage,
        String(b.leadCount),
      ]),
    ];
    downloadCsvFile(filename, rows);
  };

  return (
    <div className="space-y-6 pb-8">
      <AdminHeader
        eyebrow="Registered Businesses"
        title="Businesses"
        description="Every registered business across the 1OS platform — from dashboard registrations, public website sign-ups and CSV imports."
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminBadge label={`${businesses.length} Businesses`} />
            <AdminBadge label={`${visibleBusinesses.length} Filtered`} tone="muted" />
          </div>
        }
      />

      <section className="app-surface rounded-[2rem] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/8 pb-4">
          <div>
            <p className="line-label">Business Filters</p>
            <p className="mt-2 text-sm text-white/56">
              Slice the business directory by industry, status, owner and registration source.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[10rem] flex-col gap-2">
              <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
                Search
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Company, reg, contact…"
                className="admin-input h-10 rounded-xl px-3 text-sm text-white"
              />
            </label>

            <label className="flex min-w-[11rem] flex-col gap-2">
              <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
                Industry
              </span>
              <select
                value={industryFilter}
                onChange={(event) => setIndustryFilter(event.target.value)}
                className="admin-input admin-select h-10 rounded-xl px-3 text-sm font-medium text-white"
              >
                <option value={ALL} className="bg-zinc-950 text-white">All industries</option>
                {industries.map((industry) => (
                  <option key={industry} value={industry} className="bg-zinc-950 text-white">
                    {industry}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-w-[11rem] flex-col gap-2">
              <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
                Contact status
              </span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="admin-input admin-select h-10 rounded-xl px-3 text-sm font-medium text-white"
              >
                <option value={ALL} className="bg-zinc-950 text-white">All statuses</option>
                {contactStatuses.map((status) => (
                  <option key={status} value={status} className="bg-zinc-950 text-white">
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-w-[11rem] flex-col gap-2">
              <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
                Sales agent
              </span>
              <select
                value={ownerFilter}
                onChange={(event) => setOwnerFilter(event.target.value)}
                className="admin-input admin-select h-10 rounded-xl px-3 text-sm font-medium text-white"
              >
                <option value={ALL} className="bg-zinc-950 text-white">All agents</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id} className="bg-zinc-950 text-white">
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-w-[11rem] flex-col gap-2">
              <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
                Source
              </span>
              <select
                value={originFilter}
                onChange={(event) => setOriginFilter(event.target.value)}
                className="admin-input admin-select h-10 rounded-xl px-3 text-sm font-medium text-white"
              >
                <option value={ALL} className="bg-zinc-950 text-white">All sources</option>
                {adminLeadOrigins.map((origin) => (
                  <option key={origin} value={origin} className="bg-zinc-950 text-white">
                    {adminLeadOriginLabels[origin]}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={handleExport}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.08] px-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/88 transition hover:border-white/28 hover:bg-white/[0.14]"
            >
              <Download className="size-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/60 bg-white/[0.03]">
          <table className="w-full border-collapse text-sm text-white/75">
            <thead>
              <tr className="bg-white/[0.03] text-xs uppercase tracking-[0.2em] text-white/52">
                <th className="px-3 py-3 text-left font-medium">Company</th>
                <th className="px-3 py-3 text-left font-medium">Reg Number</th>
                <th className="px-3 py-3 text-left font-medium">Industry</th>
                <th className="px-3 py-3 text-left font-medium">Location</th>
                <th className="px-3 py-3 text-left font-medium">Owner</th>
                <th className="px-3 py-3 text-left font-medium">Source</th>
                <th className="px-3 py-3 text-left font-medium">Contact status</th>
                <th className="px-3 py-3 text-left font-medium">Stage</th>
                <th className="px-3 py-3 text-left font-medium">Leads</th>
              </tr>
            </thead>
            <tbody>
              {visibleBusinesses.length === 0 ? (
                <tr className="border-t border-white/8">
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-white/46">
                    No businesses match the current filters.
                  </td>
                </tr>
              ) : (
                visibleBusinesses.map((b) => {
                  const profileHref = b.clientProfileId
                    ? `/admin/clients/${b.clientProfileId}`
                    : null;
                  return (
                  <tr
                    key={b.key}
                    onClick={() => {
                      if (profileHref) router.push(profileHref);
                    }}
                    className={`border-t border-white/8 align-top transition ${
                      profileHref
                        ? "cursor-pointer hover:bg-white/[0.06]"
                        : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <td className="px-3 py-3 font-medium text-white">
                      {profileHref ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(profileHref);
                          }}
                          className="text-left text-white transition hover:text-white/80"
                        >
                          {b.company}
                        </button>
                      ) : (
                        b.company
                      )}
                    </td>
                    <td className="px-3 py-3 text-white/62">{b.businessRegistrationNumber || "—"}</td>
                    <td className="px-3 py-3 text-white/62">{b.industry || "—"}</td>
                    <td className="px-3 py-3 text-white/62">
                      {[b.city, b.province].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-3 text-white/72">
                      {ownerNameById.get(b.ownerId) ?? b.ownerId}
                    </td>
                    <td className="px-3 py-3 text-white/72">{adminLeadOriginLabels[b.origin]}</td>
                    <td className="px-3 py-3 text-white/72">{b.contactStatus}</td>
                    <td className="px-3 py-3 text-white/62">{b.stage}</td>
                    <td className="px-3 py-3 text-white/52">{b.leadCount}</td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Download, Mail, MessageCircle, Upload, X } from "lucide-react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { downloadCsvFile, sanitizeFileSegment } from "@/lib/download-utils";
import type { AdminLead, AdminLeadContactStatus, AdminLeadOrigin, AdminLeadPartner } from "@/lib/admin-types";
import { adminLeadOriginLabels, adminLeadOrigins, adminLeadPartners } from "@/lib/admin-types";

const ALL = "all" as const;
const OUTREACH_EMAIL_SUBJECT = "Zero-Cost Solar Proposal";

type LeadEngagement = {
  leadId: string;
  latestThreadId: string;
  lastMessageAt: string;
  lastDirection: "inbound" | "outbound" | null;
  unreadCount: number;
  state: "awaiting_reply" | "responded";
};

function firstNameForLead(lead: AdminLead) {
  return lead.contactFirstName?.trim() || lead.contactName.trim().split(/\s+/)[0] || lead.contactName;
}

function emailSubject(lead: AdminLead) {
  return `Foundation-1 - ${lead.company}`;
}

function followUpEmailBody(lead: AdminLead) {
  return [
    `Hi ${firstNameForLead(lead)},`,
    "",
    "Following up on my previous email. Is reducing electricity spend or improving power reliability something your team is currently looking at?",
    "",
    "A short reply is enough and I can route you to the right next step.",
    "",
    "Kind regards,",
  ].join("\n");
}

function formatEngagementTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-ZA", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function buildInboxHref(lead: AdminLead, engagement: LeadEngagement | null) {
  const params = new URLSearchParams();
  if (engagement?.state === "responded" && engagement.latestThreadId) {
    params.set("thread", engagement.latestThreadId);
    return `/admin/inbox?${params.toString()}`;
  }

  params.set("lead", lead.id);
  params.set("to", lead.userProfile.email);
  params.set("company", lead.company);
  params.set("name", lead.contactName || lead.contactFirstName || "");
  if (engagement?.state === "awaiting_reply") {
    params.set("subject", emailSubject(lead));
    params.set("body", followUpEmailBody(lead));
  } else {
    params.set("subject", OUTREACH_EMAIL_SUBJECT);
    params.set("template", "outreach");
  }
  return `/admin/inbox?${params.toString()}`;
}

export function AdminRepositoryRoute() {
  const {
    leads,
    agents,
    contactStatuses,
    actorAgentId,
    updateLeadOwner,
    updateLeadContactStatus,
    updateLeadPartner,
    createLead,
  } = useAdminPortal();

  const ownerNameById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent.name])),
    [agents],
  );

  const industries = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((lead) => {
      if (lead.industry) {
        set.add(lead.industry);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const [industryFilter, setIndustryFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [ownerFilter, setOwnerFilter] = useState<string>(ALL);
  const [originFilter, setOriginFilter] = useState<string>(ALL);
  const [partnerFilter, setPartnerFilter] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [engagementByLeadId, setEngagementByLeadId] = useState<Record<string, LeadEngagement>>({});
  const PAGE_SIZE = 30;

  const visibleContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (industryFilter !== ALL && lead.industry !== industryFilter) {
        return false;
      }
      if (statusFilter !== ALL && lead.contactStatus !== statusFilter) {
        return false;
      }
      if (ownerFilter !== ALL && lead.ownerId !== ownerFilter) {
        return false;
      }
      if (originFilter !== ALL && (lead.origin ?? "created") !== originFilter) {
        return false;
      }
      if (partnerFilter !== ALL && (lead.partner ?? "") !== partnerFilter) {
        return false;
      }
      if (query.length > 0) {
        const haystack = [
          lead.company,
          lead.contactName,
          lead.userProfile.email,
          lead.userProfile.phone,
          lead.industry,
          lead.city,
          lead.province,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [leads, industryFilter, statusFilter, ownerFilter, originFilter, partnerFilter, search]);

  const totalPages = Math.max(1, Math.ceil(visibleContacts.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedContacts = useMemo(
    () =>
      visibleContacts.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
      ),
    [visibleContacts, currentPage],
  );
  const pagedLeadIdsKey = useMemo(
    () => pagedContacts.map((lead) => lead.id).join(","),
    [pagedContacts],
  );

  useEffect(() => {
    let cancelled = false;

    async function refreshEngagement() {
      if (!pagedLeadIdsKey) {
        setEngagementByLeadId({});
        return;
      }

      try {
        const url = new URL("/api/email/lead-engagement", window.location.origin);
        url.searchParams.set("leadIds", pagedLeadIdsKey);
        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = (await res.json()) as {
          engagement?: Record<string, LeadEngagement>;
        };
        if (!cancelled && res.ok) {
          setEngagementByLeadId(json.engagement ?? {});
        }
      } catch {
        if (!cancelled) setEngagementByLeadId({});
      }
    }

    void refreshEngagement();
    const interval = window.setInterval(() => void refreshEngagement(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pagedLeadIdsKey]);

  const totals = useMemo(() => {
    const counts: Record<string, number> = { total: leads.length };
    contactStatuses.forEach((status) => {
      counts[status] = 0;
    });
    leads.forEach((lead) => {
      counts[lead.contactStatus] = (counts[lead.contactStatus] ?? 0) + 1;
    });
    return counts;
  }, [leads, contactStatuses]);

  const handleExport = () => {
    const dateTag = new Date().toISOString().slice(0, 10);
    const filename = `${sanitizeFileSegment(`contacts-${industryFilter}-${statusFilter}`)}-${dateTag}.csv`;
    const rows = [
      [
        "Lead ID",
        "Company",
        "Industry",
        "Contact Name",
        "Email",
        "Phone",
        "Province",
        "City",
        "Owner",
        "Contact Status",
        "Stage",
        "Last Touched",
        "Source",
      ],
      ...visibleContacts.map((lead) => [
        lead.id,
        lead.company,
        lead.industry,
        lead.contactName,
        lead.userProfile.email,
        lead.userProfile.phone,
        lead.province,
        lead.city,
        ownerNameById.get(lead.ownerId) ?? lead.ownerId,
        lead.contactStatus,
        lead.stage,
        lead.lastTouched,
        adminLeadOriginLabels[(lead.origin ?? "created") as AdminLeadOrigin],
      ]),
    ];
    downloadCsvFile(filename, rows);
  };

  return (
    <div className="space-y-6 pb-8">
      <AdminHeader
        eyebrow="Contact Repository"
        title="Repository"
        description="Centralised contact hub — filter contacts by industry and status, then allocate them to sales agents."
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminBadge label={`${totals.total} Contacts`} />
            <AdminBadge label={`${totals["Not Contacted"] ?? 0} Not Contacted`} tone="muted" />
            <AdminBadge label={`${totals["Interested"] ?? 0} Interested`} tone="muted" />
            <AdminBadge label={`${totals["Converted"] ?? 0} Converted`} tone="muted" />
          </div>
        }
      />

      <section className="app-surface rounded-[2rem] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/8 pb-4">
          <div>
            <p className="line-label">Contact Filters</p>
            <p className="mt-2 text-sm text-white/56">
              Slice the repository by industry, contact state and owning sales agent.
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
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Company, contact, email…"
                className="admin-input h-10 rounded-xl px-3 text-sm text-white"
              />
            </label>

            <label className="flex min-w-[11rem] flex-col gap-2">
              <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
                Industry
              </span>
              <select
                value={industryFilter}
                onChange={(event) => {
                  setIndustryFilter(event.target.value);
                  setPage(1);
                }}
                className="admin-input admin-select h-10 rounded-xl px-3 text-sm font-medium text-white"
              >
                <option value={ALL} className="bg-zinc-950 text-white">
                  All industries
                </option>
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
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
                className="admin-input admin-select h-10 rounded-xl px-3 text-sm font-medium text-white"
              >
                <option value={ALL} className="bg-zinc-950 text-white">
                  All statuses
                </option>
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
                onChange={(event) => {
                  setOwnerFilter(event.target.value);
                  setPage(1);
                }}
                className="admin-input admin-select h-10 rounded-xl px-3 text-sm font-medium text-white"
              >
                <option value={ALL} className="bg-zinc-950 text-white">
                  All agents
                </option>
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
                onChange={(event) => {
                  setOriginFilter(event.target.value);
                  setPage(1);
                }}
                className="admin-input admin-select h-10 rounded-xl px-3 text-sm font-medium text-white"
              >
                <option value={ALL} className="bg-zinc-950 text-white">
                  All sources
                </option>
                {adminLeadOrigins.map((origin) => (
                  <option key={origin} value={origin} className="bg-zinc-950 text-white">
                    {adminLeadOriginLabels[origin]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-w-[11rem] flex-col gap-2">
              <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
                Partner
              </span>
              <select
                value={partnerFilter}
                onChange={(event) => {
                  setPartnerFilter(event.target.value);
                  setPage(1);
                }}
                className="admin-input admin-select h-10 rounded-xl px-3 text-sm font-medium text-white"
              >
                <option value={ALL} className="bg-zinc-950 text-white">
                  All partners
                </option>
                {adminLeadPartners.map((partner) => (
                  <option key={partner} value={partner} className="bg-zinc-950 text-white">
                    {partner}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.08] px-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/88 transition hover:border-white/28 hover:bg-white/[0.14]"
            >
              <Upload className="size-3.5" />
              Import CSV
            </button>
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
                <th className="px-3 py-3 text-left font-medium">Industry</th>
                <th className="px-3 py-3 text-left font-medium">Contact</th>
                <th className="px-3 py-3 text-left font-medium">Email</th>
                <th className="px-3 py-3 text-left font-medium">Phone</th>
                <th className="px-3 py-3 text-left font-medium">Suburb</th>
                <th className="px-3 py-3 text-left font-medium">Province</th>
                <th className="px-3 py-3 text-left font-medium">Assigned to</th>
                <th className="px-3 py-3 text-left font-medium">Partner</th>
                <th className="px-3 py-3 text-left font-medium">Contact status</th>
                <th className="px-3 py-3 text-left font-medium">Email status</th>
                <th className="px-3 py-3 text-left font-medium">Stage</th>
                <th className="px-3 py-3 text-left font-medium">Last touched</th>
                <th className="px-3 py-3 text-left font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleContacts.length === 0 ? (
                <tr className="border-t border-white/8">
                  <td colSpan={14} className="px-3 py-8 text-center text-sm text-white/46">
                    No contacts match the current filters.
                  </td>
                </tr>
              ) : (
                pagedContacts.map((lead) => (
                  <tr key={lead.id} className="border-t border-white/8 align-top hover:bg-white/[0.04]">
                    <td className="px-3 py-3 font-medium text-white">{lead.company}</td>
                    <td className="px-3 py-3 text-white/62">{lead.industry}</td>
                    <td className="px-3 py-3 text-white/72">
                      <div>{lead.contactName}</div>
                    </td>
                    <td className="px-3 py-3 text-white/72">
                      {lead.userProfile.email ? (
                        <a
                          href={`mailto:${lead.userProfile.email}`}
                          className="text-white hover:text-white/85"
                        >
                          {lead.userProfile.email}
                        </a>
                      ) : (
                        <span className="text-white/35">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-white/72">
                      {lead.userProfile.phone ? (
                        <a
                          href={`tel:${lead.userProfile.phone.replace(/\s+/g, "")}`}
                          className="text-white hover:text-white/85"
                        >
                          {lead.userProfile.phone}
                        </a>
                      ) : (
                        <span className="text-white/35">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-white/62">{lead.city || "—"}</td>
                    <td className="px-3 py-3 text-white/62">{lead.province}</td>
                    <td className="px-3 py-3">
                      <select
                        value={lead.ownerId}
                        onChange={(event) => updateLeadOwner(lead.id, event.target.value)}
                        className="admin-input admin-select h-9 w-full rounded-lg px-2 text-xs font-medium text-white"
                        aria-label={`Assign ${lead.company} to`}
                      >
                        {agents.map((agent) => (
                          <option
                            key={agent.id}
                            value={agent.id}
                            className="bg-zinc-950 text-white"
                          >
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={lead.partner ?? ""}
                        onChange={(event) =>
                          updateLeadPartner(
                            lead.id,
                            event.target.value === ""
                              ? null
                              : (event.target.value as AdminLeadPartner),
                          )
                        }
                        className="admin-input admin-select h-9 w-full rounded-lg px-2 text-xs font-medium text-white"
                        aria-label={`Set partner for ${lead.company}`}
                      >
                        <option value="" className="bg-zinc-950 text-white">
                          Unassigned
                        </option>
                        {adminLeadPartners.map((partner) => (
                          <option key={partner} value={partner} className="bg-zinc-950 text-white">
                            {partner}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={lead.contactStatus}
                        onChange={(event) =>
                          updateLeadContactStatus(
                            lead.id,
                            event.target.value as AdminLeadContactStatus,
                          )
                        }
                        className="admin-input admin-select h-9 w-full rounded-lg px-2 text-xs font-medium text-white"
                        aria-label={`Update contact status for ${lead.company}`}
                      >
                        {contactStatuses.map((status) => (
                          <option key={status} value={status} className="bg-zinc-950 text-white">
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      {(() => {
                        const engagement = engagementByLeadId[lead.id] ?? null;
                        if (engagement?.state === "responded") {
                          return (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/35 bg-emerald-500/10 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-emerald-100">
                              <MessageCircle className="size-3" />
                              Responded
                            </span>
                          );
                        }
                        if (engagement?.state === "awaiting_reply") {
                          return (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/35 bg-amber-500/10 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-amber-100">
                              <Clock3 className="size-3" />
                              Awaiting reply
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/14 bg-white/[0.04] px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-white/68">
                            <Mail className="size-3" />
                            Not emailed
                          </span>
                        );
                      })()}
                      {engagementByLeadId[lead.id]?.lastMessageAt ? (
                        <div className="mt-1 text-[0.68rem] text-white/40">
                          {formatEngagementTime(engagementByLeadId[lead.id].lastMessageAt)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-white/62">{lead.stage}</td>
                    <td className="px-3 py-3 text-white/52">{lead.lastTouched}</td>
                    <td className="px-3 py-3">
                      {lead.userProfile.email ? (
                        <Link
                          href={buildInboxHref(lead, engagementByLeadId[lead.id] ?? null)}
                          className="inline-flex items-center gap-1.5 rounded-[0.65rem] border border-white/12 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.14em] text-white/72 transition hover:border-white/26 hover:text-white"
                        >
                          <Mail className="size-3" />
                          {engagementByLeadId[lead.id]?.state === "responded"
                            ? "Open reply"
                            : engagementByLeadId[lead.id]?.state === "awaiting_reply"
                              ? "Follow up"
                              : "Email"}
                        </Link>
                      ) : (
                        <span className="text-xs text-white/35">No email</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {visibleContacts.length > PAGE_SIZE ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-white/55">
            <span>
              Showing{" "}
              <span className="text-white">
                {(currentPage - 1) * PAGE_SIZE + 1}
                –{Math.min(currentPage * PAGE_SIZE, visibleContacts.length)}
              </span>{" "}
              of <span className="text-white">{visibleContacts.length}</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-white/14 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white/80 transition hover:border-white/28 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-white/70">
                Page <span className="text-white">{currentPage}</span> /{" "}
                {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-white/14 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white/80 transition hover:border-white/28 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {importOpen ? (
        <ImportCsvModal
          agents={agents}
          defaultOwnerId={actorAgentId ?? agents[0]?.id ?? ""}
          onClose={() => setImportOpen(false)}
          onImport={(rows, partner) => {
            let imported = 0;
            const failures: { row: number; reason: string }[] = [];
            rows.forEach((row, index) => {
              const result = createLead({ ...row, origin: "imported", partner });
              if (result) {
                imported += 1;
              } else {
                failures.push({ row: index + 2, reason: "Validation failed (check reg number, monthly spend, required fields)" });
              }
            });
            return { imported, failures };
          }}
        />
      ) : null}
    </div>
  );
}

type CsvImportRow = {
  businessName: string;
  businessRegistrationNumber: string;
  industry: string;
  contactFirstName: string;
  contactSurname: string;
  contactPosition: string;
  contactEmail: string;
  contactNumber: string;
  monthlyElectricitySpendEstimateZar: number;
  isBusinessRegistered: boolean;
  isBusinessOperational: boolean;
  hasSixMonthUtilityBill: boolean;
  physicalAddress: string;
  city: string;
  province: string;
  source: AdminLead["source"];
  ownerId: string;
};

const CSV_TEMPLATE_HEADERS = [
  "Company",
  "Reg Number",
  "Industry",
  "First Name",
  "Surname",
  "Position",
  "Email",
  "Phone",
  "Address",
  "City",
  "Province",
  "Monthly Spend",
  "Source",
  "Owner",
];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim().length > 0)) {
      rows.push(row);
    }
  }
  return rows;
}

function headerIndex(headers: string[], name: string) {
  const target = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return headers.findIndex(
    (header) => header.toLowerCase().replace(/[^a-z0-9]/g, "") === target,
  );
}

function normalizeSource(value: string): AdminLead["source"] {
  const v = value.trim().toLowerCase();
  if (v.includes("referral")) return "Referral";
  if (v.includes("portal") || v.includes("migrate")) return "Migrate Portal";
  return "Outbound";
}

function resolveOwnerId(
  raw: string,
  agents: { id: string; name: string }[],
  fallback: string,
) {
  const value = raw.trim();
  if (!value) return fallback;
  const lower = value.toLowerCase();
  const byId = agents.find((agent) => agent.id.toLowerCase() === lower);
  if (byId) return byId.id;
  const byName = agents.find((agent) => agent.name.toLowerCase() === lower);
  if (byName) return byName.id;
  return fallback;
}

function ImportCsvModal({
  agents,
  defaultOwnerId,
  onClose,
  onImport,
}: {
  agents: { id: string; name: string }[];
  defaultOwnerId: string;
  onClose: () => void;
  onImport: (
    rows: CsvImportRow[],
    partner: AdminLeadPartner,
  ) => {
    imported: number;
    failures: { row: number; reason: string }[];
  };
}) {
  const [csvText, setCsvText] = useState("");
  const [partner, setPartner] = useState<AdminLeadPartner>(adminLeadPartners[0]);
  const [result, setResult] = useState<{
    imported: number;
    failures: { row: number; reason: string }[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { rows: parsed, error: parseError } = useMemo<{
    rows: CsvImportRow[] | null;
    error: string | null;
  }>(() => {
    if (!csvText.trim()) return { rows: null, error: null };
    try {
      const rows = parseCsv(csvText);
      if (rows.length < 2) return { rows: [], error: null };
      const [headerRow, ...dataRows] = rows;
      const headers = headerRow.map((header) => header.trim());
      const idx = {
        company: headerIndex(headers, "Company"),
        reg: headerIndex(headers, "Reg Number"),
        industry: headerIndex(headers, "Industry"),
        first: headerIndex(headers, "First Name"),
        surname: headerIndex(headers, "Surname"),
        position: headerIndex(headers, "Position"),
        email: headerIndex(headers, "Email"),
        phone: headerIndex(headers, "Phone"),
        address: headerIndex(headers, "Address"),
        city: headerIndex(headers, "City"),
        province: headerIndex(headers, "Province"),
        spend: headerIndex(headers, "Monthly Spend"),
        source: headerIndex(headers, "Source"),
        owner: headerIndex(headers, "Owner"),
      };
      const required = ["company", "reg", "industry", "email"] as const;
      const missing = required.filter((key) => idx[key] === -1);
      if (missing.length > 0) {
        return {
          rows: null,
          error: `Missing required column(s): ${missing.join(", ")}. Required: Company, Reg Number, Industry, Email.`,
        };
      }
      const mapped = dataRows.map((cells) => {
        const cell = (i: number) => (i >= 0 && i < cells.length ? cells[i].trim() : "");
        const spend = Number.parseFloat(cell(idx.spend).replace(/[^0-9.]/g, ""));
        return {
          businessName: cell(idx.company),
          businessRegistrationNumber: cell(idx.reg),
          industry: cell(idx.industry),
          contactFirstName: cell(idx.first),
          contactSurname: cell(idx.surname),
          contactPosition: cell(idx.position) || "Decision Maker",
          contactEmail: cell(idx.email),
          contactNumber: cell(idx.phone),
          monthlyElectricitySpendEstimateZar: Number.isFinite(spend) && spend > 0 ? spend : 0,
          isBusinessRegistered: true,
          isBusinessOperational: true,
          hasSixMonthUtilityBill: false,
          physicalAddress: cell(idx.address),
          city: cell(idx.city),
          province: cell(idx.province),
          source: normalizeSource(cell(idx.source)),
          ownerId: resolveOwnerId(cell(idx.owner), agents, defaultOwnerId),
        };
      });
      return { rows: mapped, error: null };
    } catch (error) {
      return {
        rows: null,
        error: error instanceof Error ? error.message : "Failed to parse CSV.",
      };
    }
  }, [csvText, agents, defaultOwnerId]);

  const handleFile = async (file: File) => {
    const text = await file.text();
    setCsvText(text);
    setResult(null);
  };

  const handleImport = () => {
    if (!parsed || parsed.length === 0) return;
    setResult(onImport(parsed, partner));
  };

  const handleDownloadTemplate = () => {
    downloadCsvFile(
      `${sanitizeFileSegment("repository-import-template")}.csv`,
      [
        CSV_TEMPLATE_HEADERS,
        [
          "Acme Manufacturing",
          "2019/123456/07",
          "Manufacturing",
          "Jane",
          "Doe",
          "CEO",
          "jane@acme.co.za",
          "+27 82 000 0000",
          "1 Main St",
          "Johannesburg",
          "Gauteng",
          "45000",
          "Cold Outreach",
          "Karman",
        ],
      ],
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="app-surface relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-full border border-white/60 bg-white/[0.06] text-white/68 transition hover:border-white/28 hover:bg-white/[0.12]"
          aria-label="Close import dialog"
        >
          <X className="size-4" />
        </button>
        <p className="line-label">Import Leads</p>
        <h2 className="mt-2 text-xl font-semibold text-white">Bulk import via CSV</h2>
        <p className="mt-2 text-sm text-white/56">
          Upload a CSV file or paste rows below. Required columns: Company, Reg Number, Industry, Email. Owner can be an agent name (e.g. “Karman”) or agent ID; defaults to you.
        </p>

        <label className="mt-4 flex max-w-xs flex-col gap-2">
          <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
            Partner
          </span>
          <select
            value={partner}
            onChange={(event) => setPartner(event.target.value as AdminLeadPartner)}
            className="admin-input admin-select h-10 rounded-xl px-3 text-sm font-medium text-white"
          >
            {adminLeadPartners.map((p) => (
              <option key={p} value={p} className="bg-zinc-950 text-white">
                {p}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.08] px-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/88 transition hover:border-white/28 hover:bg-white/[0.14]"
          >
            <Upload className="size-3.5" />
            Choose CSV file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleFile(file);
              }
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.04] px-3.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/76 transition hover:border-white/28 hover:bg-white/[0.10]"
          >
            <Download className="size-3.5" />
            Download template
          </button>
        </div>

        <label className="mt-4 flex flex-col gap-2">
          <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
            Or paste CSV
          </span>
          <textarea
            value={csvText}
            onChange={(event) => {
              setCsvText(event.target.value);
              setResult(null);
            }}
            rows={8}
            placeholder={CSV_TEMPLATE_HEADERS.join(",")}
            className="admin-input w-full rounded-xl px-3 py-2 font-mono text-xs text-white"
          />
        </label>

        {parseError ? (
          <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {parseError}
          </p>
        ) : null}

        {parsed && parsed.length > 0 && !parseError ? (
          <div className="mt-4 rounded-2xl border border-white/60 bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-white/52">
              Preview — {parsed.length} row{parsed.length === 1 ? "" : "s"}
            </p>
            <div className="mt-2 max-h-48 overflow-auto">
              <table className="w-full text-xs text-white/72">
                <thead className="text-[0.62rem] uppercase tracking-[0.18em] text-white/46">
                  <tr>
                    <th className="px-2 py-1 text-left">Company</th>
                    <th className="px-2 py-1 text-left">Industry</th>
                    <th className="px-2 py-1 text-left">Email</th>
                    <th className="px-2 py-1 text-left">Spend</th>
                    <th className="px-2 py-1 text-left">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-t border-white/8">
                      <td className="px-2 py-1">{row.businessName}</td>
                      <td className="px-2 py-1">{row.industry}</td>
                      <td className="px-2 py-1">{row.contactEmail}</td>
                      <td className="px-2 py-1">
                        {row.monthlyElectricitySpendEstimateZar > 0
                          ? `R ${row.monthlyElectricitySpendEstimateZar.toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="px-2 py-1">
                        {agents.find((agent) => agent.id === row.ownerId)?.name ?? row.ownerId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 10 ? (
                <p className="mt-1 px-2 text-[0.62rem] text-white/44">
                  +{parsed.length - 10} more row{parsed.length - 10 === 1 ? "" : "s"}…
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="mt-4 rounded-2xl border border-white/60 bg-white/[0.03] p-3 text-xs">
            <p className="text-emerald-300">
              Imported {result.imported} lead{result.imported === 1 ? "" : "s"}.
            </p>
            {result.failures.length > 0 ? (
              <div className="mt-2 text-red-200">
                <p>{result.failures.length} row(s) failed:</p>
                <ul className="mt-1 list-disc pl-5 text-white/68">
                  {result.failures.slice(0, 8).map((f) => (
                    <li key={f.row}>
                      Row {f.row}: {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/60 bg-white/[0.04] px-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/76 transition hover:border-white/28 hover:bg-white/[0.10]"
          >
            {result ? "Close" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!parsed || parsed.length === 0 || Boolean(parseError)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/16 bg-white/[0.10] px-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/88 transition hover:border-white/28 hover:bg-white/[0.16] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="size-3.5" />
            Import {parsed && parsed.length > 0 ? `(${parsed.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

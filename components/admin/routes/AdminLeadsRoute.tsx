"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Download, Mail, MessageCircle, Plus, Upload, X } from "lucide-react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { downloadCsvFile, sanitizeFileSegment } from "@/lib/download-utils";
import type {
  AdminLead,
  AdminLeadContactStatus,
  AdminLeadOrigin,
  AdminLeadPartner,
  AdminLeadStage,
} from "@/lib/admin-types";
import { adminLeadOriginLabels, adminLeadOrigins, adminLeadPartners } from "@/lib/admin-types";

const ALL = "all" as const;
const OUTREACH_EMAIL_SUBJECT = "Zero-Cost Solar Proposal";
const leadStatusOptions = [
  "Not Contacted",
  "Contacted",
  "Interested",
  "Not Interested",
  "Follow Up",
  "Qualified",
  "Disqualified",
] as const;

type LeadStatusOption = (typeof leadStatusOptions)[number];

const qualifiedStages = new Set<AdminLeadStage>([
  "EOI Generated",
  "EOI Signed",
  "Utility Bills Uploaded",
  "Compliance Pack Uploaded",
  "Term Sheet Uploaded",
  "Onboarding Complete",
]);

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

function hasValidLeadEmail(lead: AdminLead) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.userProfile.email.trim());
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

function formatLeadTimestamp(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-ZA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function leadTimestampRows(lead: AdminLead) {
  const rows: Array<{ label: string; value: string }> = [];
  if (lead.registeredAt) {
    rows.push({ label: "Registered", value: formatLeadTimestamp(lead.registeredAt) });
  }
  if (lead.manuallyAddedAt) {
    rows.push({ label: "Admin added", value: formatLeadTimestamp(lead.manuallyAddedAt) });
  }
  if (rows.length === 0) {
    rows.push({ label: "Created", value: formatLeadTimestamp(lead.createdAt) });
  }
  return rows;
}

function buildInboxHref(
  lead: AdminLead,
  engagement: LeadEngagement | null,
  basePath: "/admin" | "/sales",
) {
  const params = new URLSearchParams();
  if (engagement?.state === "responded" && engagement.latestThreadId) {
    params.set("thread", engagement.latestThreadId);
    return `${basePath}/inbox?${params.toString()}`;
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
  return `${basePath}/inbox?${params.toString()}`;
}

function getLeadBoardStatus(lead: AdminLead): LeadStatusOption {
  if (lead.stage === "Disqualified") return "Disqualified";
  if (lead.contactStatus === "Converted" || qualifiedStages.has(lead.stage)) {
    return "Qualified";
  }
  if (lead.contactStatus === "Follow Up") return "Follow Up";
  return lead.contactStatus;
}

export function AdminLeadsRoute({
  basePath = "/admin",
  showOwnerControls = true,
  showPartnerControls = true,
  allowImport = true,
}: {
  basePath?: "/admin" | "/sales";
  showOwnerControls?: boolean;
  showPartnerControls?: boolean;
  allowImport?: boolean;
}) {
  const {
    leads,
    agents,
    actorAgentId,
    updateLeadOwner,
    updateLeadContactStatus,
    updateLeadStage,
    updateLeadPartner,
    createLeadShell,
    importLeadShells,
  } = useAdminPortal();

  const ownerNameById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent.name])),
    [agents],
  );

  const emailLeads = useMemo(() => leads.filter(hasValidLeadEmail), [leads]);

  const industries = useMemo(() => {
    const set = new Set<string>();
    emailLeads.forEach((lead) => {
      if (lead.industry) {
        set.add(lead.industry);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [emailLeads]);

  const [industryFilter, setIndustryFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<LeadStatusOption | typeof ALL>(ALL);
  const [ownerFilter, setOwnerFilter] = useState<string>(ALL);
  const [originFilter, setOriginFilter] = useState<string>(ALL);
  const [partnerFilter, setPartnerFilter] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [quickLead, setQuickLead] = useState({
    company: "",
    contactName: "",
    email: "",
    phone: "",
    industry: "",
  });
  const [quickLeadError, setQuickLeadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [engagementByLeadId, setEngagementByLeadId] = useState<Record<string, LeadEngagement>>({});
  const PAGE_SIZE = 30;

  const visibleContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return emailLeads.filter((lead) => {
      if (industryFilter !== ALL && lead.industry !== industryFilter) {
        return false;
      }
      if (statusFilter !== ALL && getLeadBoardStatus(lead) !== statusFilter) {
        return false;
      }
      if (showOwnerControls && ownerFilter !== ALL && lead.ownerId !== ownerFilter) {
        return false;
      }
      if (originFilter !== ALL && (lead.origin ?? "created") !== originFilter) {
        return false;
      }
      if (showPartnerControls && partnerFilter !== ALL && (lead.partner ?? "") !== partnerFilter) {
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
  }, [
    emailLeads,
    industryFilter,
    statusFilter,
    ownerFilter,
    originFilter,
    partnerFilter,
    search,
    showOwnerControls,
    showPartnerControls,
  ]);

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
    const counts: Record<string, number> = { total: emailLeads.length };
    leadStatusOptions.forEach((status) => {
      counts[status] = 0;
    });
    emailLeads.forEach((lead) => {
      const boardStatus = getLeadBoardStatus(lead);
      counts[boardStatus] = (counts[boardStatus] ?? 0) + 1;
    });
    return counts;
  }, [emailLeads]);

  const handleLeadStatusChange = (lead: AdminLead, status: LeadStatusOption) => {
    if (status === "Qualified") {
      if (lead.stage === "Disqualified") {
        updateLeadStage(lead.id, "Client Registered");
      }
      updateLeadContactStatus(lead.id, "Converted");
      return;
    }

    if (status === "Disqualified") {
      updateLeadStage(lead.id, "Disqualified");
      updateLeadContactStatus(lead.id, "Not Interested");
      return;
    }

    if (lead.stage === "Disqualified") {
      updateLeadStage(lead.id, "Client Registered");
    }
    updateLeadContactStatus(lead.id, status as AdminLeadContactStatus);
  };

  const handleExport = () => {
    const dateTag = new Date().toISOString().slice(0, 10);
    const filename = `${sanitizeFileSegment(`leads-${industryFilter}-${statusFilter}`)}-${dateTag}.csv`;
    const headers = [
      "Lead ID",
      "Company",
      "Industry",
      "Contact Name",
      "Email",
      "Phone",
      "Province",
      "City",
      "Contact Status",
      "Stage",
      "Registered At",
      "Manual Admin Added At",
      "Created At",
      "Last Touched",
      "Source",
    ];
    if (showOwnerControls) {
      headers.splice(8, 0, "Owner");
    }
    const rows = [
      headers,
      ...visibleContacts.map((lead) => {
        const row = [
          lead.id,
          lead.company,
          lead.industry,
          lead.contactName,
          lead.userProfile.email,
          lead.userProfile.phone,
          lead.province,
          lead.city,
          lead.contactStatus,
          lead.stage,
          formatLeadTimestamp(lead.registeredAt),
          formatLeadTimestamp(lead.manuallyAddedAt),
          formatLeadTimestamp(lead.createdAt),
          lead.lastTouched,
          adminLeadOriginLabels[(lead.origin ?? "created") as AdminLeadOrigin],
        ];
        if (showOwnerControls) {
          row.splice(8, 0, ownerNameById.get(lead.ownerId) ?? lead.ownerId);
        }
        return row;
      }),
    ];
    downloadCsvFile(filename, rows);
  };

  const defaultOwnerId = actorAgentId ?? agents[0]?.id ?? "";
  const tableColumnCount =
    13 + (showOwnerControls ? 1 : 0) + (showPartnerControls ? 1 : 0);
  const handleCreateLead = () => {
    setQuickLeadError(null);
    const created = createLeadShell({
      company: quickLead.company,
      contactName: quickLead.contactName || quickLead.company,
      email: quickLead.email,
      contactNumber: quickLead.phone,
      industry: quickLead.industry,
      ownerId: defaultOwnerId,
      source: "Outbound",
      origin: "created",
    });

    if (!created) {
      setQuickLeadError("Company and a valid email address are required.");
      return;
    }

    setQuickLead({
      company: "",
      contactName: "",
      email: "",
      phone: "",
      industry: "",
    });
    setPage(1);
  };

  return (
    <div className="min-w-0 space-y-6 pb-8">
      <AdminHeader
        eyebrow="Lead Book"
        title="Leads"
        description="Your working lead list for outreach, qualification, onboarding, and client handover."
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminBadge label={`${totals.total} Leads`} />
            <AdminBadge label={`${totals["Not Contacted"] ?? 0} Not Contacted`} tone="muted" />
            <AdminBadge label={`${totals["Interested"] ?? 0} Interested`} tone="muted" />
            <AdminBadge label={`${totals["Qualified"] ?? 0} Qualified`} tone="muted" />
          </div>
        }
      />

      <section className="app-surface min-w-0 rounded-[1.4rem] p-4">
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto]">
          <input
            value={quickLead.company}
            onChange={(event) => setQuickLead((lead) => ({ ...lead, company: event.target.value }))}
            placeholder="Company"
            className="admin-input min-w-0 rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <input
            value={quickLead.contactName}
            onChange={(event) => setQuickLead((lead) => ({ ...lead, contactName: event.target.value }))}
            placeholder="Contact name"
            className="admin-input min-w-0 rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <input
            value={quickLead.email}
            onChange={(event) => setQuickLead((lead) => ({ ...lead, email: event.target.value }))}
            placeholder="Email"
            className="admin-input min-w-0 rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <input
            value={quickLead.phone}
            onChange={(event) => setQuickLead((lead) => ({ ...lead, phone: event.target.value }))}
            placeholder="Phone"
            className="admin-input min-w-0 rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <input
            value={quickLead.industry}
            onChange={(event) => setQuickLead((lead) => ({ ...lead, industry: event.target.value }))}
            placeholder="Industry"
            className="admin-input min-w-0 rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleCreateLead}
            className="inline-flex items-center justify-center gap-2 rounded-[0.8rem] border border-white/16 bg-white/[0.08] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/88 transition hover:border-white/28 hover:bg-white/[0.14] md:col-span-2 xl:col-span-1"
          >
            <Plus className="size-3.5" />
            Add
          </button>
        </div>
        {quickLeadError ? (
          <p className="mt-2 text-xs text-red-200">{quickLeadError}</p>
        ) : null}
      </section>

      <section className="app-surface min-w-0 rounded-[2rem] p-5">
        <div className="border-b border-white/8 pb-5">
          <p className="line-label">Contact Filters</p>
          <p className="mt-2 text-sm text-white/56">
            {showOwnerControls
              ? "Slice the repository by industry, contact state and owning sales agent."
              : "Slice your lead book by industry, contact state and source."}
          </p>

          <div className="mt-5 grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.8fr)_minmax(0,0.85fr)_minmax(0,0.85fr)]">
            <label className="flex min-w-0 flex-col gap-2">
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
                className="admin-input h-12 min-w-0 rounded-xl px-4 text-sm text-white"
              />
            </label>

            <label className="flex min-w-0 flex-col gap-2">
              <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
                Industry
              </span>
              <select
                value={industryFilter}
                onChange={(event) => {
                  setIndustryFilter(event.target.value);
                  setPage(1);
                }}
                className="admin-input admin-select h-12 min-w-0 rounded-xl px-4 text-sm font-medium text-white"
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

            <label className="flex min-w-0 flex-col gap-2">
              <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
                Contact status
              </span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as LeadStatusOption | typeof ALL);
                  setPage(1);
                }}
                className="admin-input admin-select h-12 min-w-0 rounded-xl px-4 text-sm font-medium text-white"
              >
                <option value={ALL} className="bg-zinc-950 text-white">
                  All statuses
                </option>
                {leadStatusOptions.map((status) => (
                  <option key={status} value={status} className="bg-zinc-950 text-white">
                    {status}
                  </option>
                ))}
              </select>
            </label>

            {showOwnerControls ? (
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
                  Sales agent
                </span>
                <select
                  value={ownerFilter}
                  onChange={(event) => {
                    setOwnerFilter(event.target.value);
                    setPage(1);
                  }}
                  className="admin-input admin-select h-12 min-w-0 rounded-xl px-4 text-sm font-medium text-white"
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
            ) : null}
          </div>

          <div className="mt-4 flex min-w-0 flex-wrap items-end gap-3">
            <label className="flex min-w-[10rem] flex-1 flex-col gap-2 sm:flex-none">
              <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
                Source
              </span>
              <select
                value={originFilter}
                onChange={(event) => {
                  setOriginFilter(event.target.value);
                  setPage(1);
                }}
                className="admin-input admin-select h-12 min-w-0 rounded-xl px-4 text-sm font-medium text-white"
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

            {showPartnerControls ? (
              <label className="flex min-w-[10rem] flex-1 flex-col gap-2 sm:flex-none">
                <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
                  Partner
                </span>
                <select
                  value={partnerFilter}
                  onChange={(event) => {
                    setPartnerFilter(event.target.value);
                    setPage(1);
                  }}
                  className="admin-input admin-select h-12 min-w-0 rounded-xl px-4 text-sm font-medium text-white"
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
            ) : null}

            {allowImport ? (
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-white/16 bg-white/[0.08] px-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/88 transition hover:border-white/28 hover:bg-white/[0.14] sm:flex-none"
              >
                <Upload className="size-3.5" />
                Import Leads
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-white/16 bg-white/[0.08] px-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/88 transition hover:border-white/28 hover:bg-white/[0.14] sm:flex-none"
            >
              <Download className="size-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="mt-5 max-w-full overflow-x-auto rounded-2xl border border-white/60 bg-white/[0.03]">
          <table className="min-w-[102rem] border-collapse text-sm text-white/75">
            <thead>
              <tr className="bg-white/[0.03] text-xs uppercase tracking-[0.2em] text-white/52">
                <th className="px-3 py-3 text-left font-medium">Company</th>
                <th className="px-3 py-3 text-left font-medium">Industry</th>
                <th className="px-3 py-3 text-left font-medium">Contact</th>
                <th className="px-3 py-3 text-left font-medium">Email</th>
                <th className="px-3 py-3 text-left font-medium">Phone</th>
                <th className="px-3 py-3 text-left font-medium">Suburb</th>
                <th className="px-3 py-3 text-left font-medium">Province</th>
                {showOwnerControls ? (
                  <th className="px-3 py-3 text-left font-medium">Assigned to</th>
                ) : null}
                {showPartnerControls ? (
                  <th className="px-3 py-3 text-left font-medium">Partner</th>
                ) : null}
                <th className="px-3 py-3 text-left font-medium">Lead status</th>
                <th className="px-3 py-3 text-left font-medium">Email status</th>
                <th className="px-3 py-3 text-left font-medium">Stage</th>
                <th className="px-3 py-3 text-left font-medium">Registered / Added</th>
                <th className="px-3 py-3 text-left font-medium">Last touched</th>
                <th className="px-3 py-3 text-left font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleContacts.length === 0 ? (
                <tr className="border-t border-white/8">
                  <td colSpan={tableColumnCount} className="px-3 py-8 text-center text-sm text-white/46">
                    No leads match the current filters.
                  </td>
                </tr>
              ) : (
                pagedContacts.map((lead) => (
                  <tr key={lead.id} className="border-t border-white/8 align-top hover:bg-white/[0.04]">
                    <td className="px-3 py-3 font-medium text-white">
                      <Link
                        href={`${basePath}/leads/${lead.clientProfileId || lead.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {lead.company}
                      </Link>
                    </td>
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
                    {showOwnerControls ? (
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
                    ) : null}
                    {showPartnerControls ? (
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
                    ) : null}
                    <td className="px-3 py-3">
                      <select
                        value={getLeadBoardStatus(lead)}
                        onChange={(event) =>
                          handleLeadStatusChange(
                            lead,
                            event.target.value as LeadStatusOption,
                          )
                        }
                        className="admin-input admin-select h-9 w-full rounded-lg px-2 text-xs font-medium text-white"
                        aria-label={`Update contact status for ${lead.company}`}
                      >
                        {leadStatusOptions.map((status) => (
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
                    <td className="px-3 py-3 text-white/58">
                      <div className="space-y-1">
                        {leadTimestampRows(lead).map((row) => (
                          <div key={`${lead.id}-${row.label}`}>
                            <div className="text-[0.62rem] uppercase tracking-[0.16em] text-white/35">
                              {row.label}
                            </div>
                            <div className="whitespace-nowrap text-xs text-white/66">{row.value}</div>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-white/52">{lead.lastTouched}</td>
                    <td className="px-3 py-3">
                      {lead.userProfile.email ? (
                        <Link
                          href={buildInboxHref(lead, engagementByLeadId[lead.id] ?? null, basePath)}
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
            return importLeadShells(
              rows.map((row, index) => ({
                company: row.businessName,
                contactName: row.contactName || row.businessName,
                email: row.contactEmail,
                contactNumber: row.contactNumber,
                industry: row.industry,
                ownerId: row.ownerId,
                source: row.source,
                origin: "imported",
                partner,
                businessRegistrationNumber: row.businessRegistrationNumber,
                contactFirstName: row.contactFirstName,
                contactSurname: row.contactSurname,
                contactPosition: row.contactPosition,
                contactEmail: row.contactEmail,
                monthlyElectricitySpendEstimateZar: row.monthlyElectricitySpendEstimateZar,
                isBusinessRegistered: row.isBusinessRegistered,
                isBusinessOperational: row.isBusinessOperational,
                hasSixMonthUtilityBill: row.hasSixMonthUtilityBill,
                physicalAddress: row.physicalAddress,
                city: row.city,
                province: row.province,
                rowNumber: index + 2,
              })),
            );
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
  contactName: string;
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
  "Contact Name",
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

function headerIndexAny(headers: string[], names: string[]) {
  for (const name of names) {
    const index = headerIndex(headers, name);
    if (index !== -1) return index;
  }
  return -1;
}

function firstText(...values: string[]) {
  return values.find((value) => value.trim().length > 0)?.trim() ?? "";
}

function cellValue(cells: string[], index: number) {
  return index >= 0 && index < cells.length ? cells[index].trim() : "";
}

function companyFromEmail(email: string) {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  const root = domain.replace(/^www\./, "").split(".")[0] ?? "";
  if (!root || ["gmail", "yahoo", "hotmail", "outlook", "icloud", "live"].includes(root)) {
    return "";
  }
  return root
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function companyFromHeadline(value: string) {
  const match = value.trim().match(/\b(?:at|@)\s+(.+)$/i);
  return match?.[1]?.replace(/\s+[-–—].*$/, "").trim() ?? "";
}

function parseSpend(value: string) {
  const matches = Array.from(value.replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)\s*([kKmM])?/g));
  if (matches.length === 0) return 0;
  const values = matches
    .map((match) => {
      const base = Number.parseFloat(match[1] ?? "");
      if (!Number.isFinite(base)) return 0;
      const suffix = (match[2] ?? "").toLowerCase();
      if (suffix === "m") return base * 1_000_000;
      if (suffix === "k") return base * 1_000;
      return base;
    })
    .filter((number) => number > 0);
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, number) => sum + number, 0) / values.length);
}

const provinceAliases = new Map(
  [
    ["easterncape", "Eastern Cape"],
    ["freestate", "Free State"],
    ["gauteng", "Gauteng"],
    ["kwazulunatal", "KwaZulu-Natal"],
    ["kwazulu natal", "KwaZulu-Natal"],
    ["kzn", "KwaZulu-Natal"],
    ["limpopo", "Limpopo"],
    ["mpumalanga", "Mpumalanga"],
    ["northwest", "North West"],
    ["north west", "North West"],
    ["northerncape", "Northern Cape"],
    ["westerncape", "Western Cape"],
    ["western cape", "Western Cape"],
  ].map(([key, label]) => [key.replace(/[^a-z0-9]/gi, "").toLowerCase(), label]),
);

function normalizeProvince(...values: string[]) {
  for (const value of values) {
    const key = value.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const label = provinceAliases.get(key);
    if (label) return label;
  }
  return firstText(...values);
}

function columnIndexFromReference(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0] ?? "";
  if (!letters) return 0;
  return letters
    .toUpperCase()
    .split("")
    .reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function getXmlText(files: Record<string, Uint8Array>, path: string, strFromU8: (data: Uint8Array) => string) {
  const file = files[path];
  if (!file) throw new Error(`Missing ${path} in workbook.`);
  return strFromU8(file);
}

function parseXml(text: string) {
  return new DOMParser().parseFromString(text, "application/xml");
}

function relationshipTargetPath(target: string) {
  if (target.startsWith("/")) return target.slice(1);
  if (target.startsWith("xl/")) return target;
  return `xl/${target}`;
}

async function readXlsxRows(file: File) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const workbook = parseXml(getXmlText(files, "xl/workbook.xml", strFromU8));
  const sheet = workbook.getElementsByTagName("sheet")[0];
  if (!sheet) throw new Error("The workbook does not contain a worksheet.");

  const relId =
    sheet.getAttribute("r:id") ??
    sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ??
    "";
  const rels = parseXml(getXmlText(files, "xl/_rels/workbook.xml.rels", strFromU8));
  const rel = Array.from(rels.getElementsByTagName("Relationship")).find(
    (entry) => entry.getAttribute("Id") === relId,
  );
  const sheetPath = relationshipTargetPath(rel?.getAttribute("Target") ?? "worksheets/sheet1.xml");

  const sharedStringsPath = files["xl/sharedStrings.xml"] ? "xl/sharedStrings.xml" : null;
  const sharedStrings = sharedStringsPath
    ? Array.from(parseXml(getXmlText(files, sharedStringsPath, strFromU8)).getElementsByTagName("si")).map(
        (entry) =>
          Array.from(entry.getElementsByTagName("t"))
            .map((node) => node.textContent ?? "")
            .join(""),
      )
    : [];

  const worksheet = parseXml(getXmlText(files, sheetPath, strFromU8));
  return Array.from(worksheet.getElementsByTagName("row"))
    .map((row) => {
      const values: string[] = [];
      Array.from(row.getElementsByTagName("c")).forEach((cell) => {
        const columnIndex = columnIndexFromReference(cell.getAttribute("r") ?? "");
        const type = cell.getAttribute("t");
        const rawValue = cell.getElementsByTagName("v")[0]?.textContent ?? "";
        let value = rawValue;
        if (type === "s") {
          value = sharedStrings[Number.parseInt(rawValue, 10)] ?? "";
        } else if (type === "inlineStr") {
          value = Array.from(cell.getElementsByTagName("t"))
            .map((node) => node.textContent ?? "")
            .join("");
        }
        values[columnIndex] = value;
      });
      return values.map((value) => value ?? "");
    })
    .filter((row) => row.some((value) => value.trim().length > 0));
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
  const [workbookRows, setWorkbookRows] = useState<string[][] | null>(null);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
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
    if (!csvText.trim() && !workbookRows) return { rows: null, error: null };
    try {
      const rows = workbookRows ?? parseCsv(csvText);
      if (rows.length < 2) return { rows: [], error: null };
      const [headerRow, ...dataRows] = rows;
      const headers = headerRow.map((header) => header.trim());
      const idx = {
        company: headerIndexAny(headers, [
          "Company",
          "Company Name",
          "Business Name",
          "company_name",
          "raw_company_name",
          "raw_companyName",
          "raw_organizationName",
        ]),
        headline: headerIndexAny(headers, ["raw_headline", "Headline", "contact_headline"]),
        reg: headerIndexAny(headers, [
          "Reg Number",
          "Registration Number",
          "company_registration_number",
          "raw_companyRegistrationNumber",
        ]),
        industry: headerIndexAny(headers, ["Industry", "industry", "raw_industry", "raw_organizationIndustry"]),
        contact: headerIndexAny(headers, [
          "Contact Name",
          "contact_full_name",
          "raw_full_name",
          "raw_fullName",
          "raw_decisionMakerName",
        ]),
        first: headerIndexAny(headers, ["First Name", "contact_first_name", "raw_first_name", "raw_firstName"]),
        surname: headerIndexAny(headers, ["Surname", "Last Name", "contact_last_name", "raw_last_name", "raw_lastName"]),
        position: headerIndexAny(headers, [
          "Position",
          "Title",
          "contact_title",
          "raw_position",
          "raw_job_title",
          "raw_decisionMakerTitle",
        ]),
        email: headerIndexAny(headers, ["Email", "email", "raw_email", "raw_emailAddress", "contact_email"]),
        phone: headerIndexAny(headers, [
          "Phone",
          "company_phone",
          "raw_company_phone",
          "raw_phoneNumber",
          "raw_mobile_number",
          "raw_phone_numbers",
        ]),
        address: headerIndexAny(headers, [
          "Address",
          "company_address",
          "raw_companyAddress",
          "raw_company_full_address",
          "raw_company_street_address",
        ]),
        city: headerIndexAny(headers, [
          "City",
          "city_or_municipality",
          "raw_city",
          "raw_company_city",
          "raw_organizationCity",
          "raw_municipality",
        ]),
        province: headerIndexAny(headers, ["raw_province", "Province", "raw_company_state", "raw_organizationState", "raw_state"]),
        spend: headerIndexAny(headers, [
          "Monthly Spend",
          "likely_electricity_spend_band",
          "raw_likelyElectricitySpendBand",
          "estimated_electricity_intensity",
        ]),
        source: headerIndexAny(headers, ["Source", "source_types", "source_files", "raw_sourceUrls"]),
        owner: headerIndexAny(headers, ["Owner", "Sales Agent", "Agent"]),
      };
      const required = ["email"] as const;
      const missing = required.filter((key) => idx[key] === -1);
      if (missing.length > 0) {
        return {
          rows: null,
          error: `Missing required column(s): ${missing.join(", ")}. Required: Email.`,
        };
      }
      const mapped = dataRows.map((cells) => {
        const email = cellValue(cells, idx.email);
        const headline = cellValue(cells, idx.headline);
        const position = cellValue(cells, idx.position) || "Decision Maker";
        const contactName = cellValue(cells, idx.contact);
        const firstName = cellValue(cells, idx.first) || contactName.trim().split(/\s+/)[0] || "";
        const surname =
          cellValue(cells, idx.surname) ||
          contactName.trim().split(/\s+/).slice(1).join(" ");
        const regNumber = cellValue(cells, idx.reg);
        const businessName = firstText(
          cellValue(cells, idx.company),
          companyFromHeadline(headline),
          companyFromEmail(email),
          contactName,
        );
        return {
          businessName,
          businessRegistrationNumber: regNumber,
          industry: cellValue(cells, idx.industry),
          contactName,
          contactFirstName: firstName,
          contactSurname: surname,
          contactPosition: position,
          contactEmail: email,
          contactNumber: cellValue(cells, idx.phone),
          monthlyElectricitySpendEstimateZar: parseSpend(cellValue(cells, idx.spend)),
          isBusinessRegistered: regNumber.length > 0,
          isBusinessOperational: false,
          hasSixMonthUtilityBill: false,
          physicalAddress: cellValue(cells, idx.address),
          city: cellValue(cells, idx.city),
          province: normalizeProvince(cellValue(cells, idx.province)),
          source: normalizeSource(cellValue(cells, idx.source)),
          ownerId: resolveOwnerId(cellValue(cells, idx.owner), agents, defaultOwnerId),
        };
      });
      return { rows: mapped, error: null };
    } catch (error) {
      return {
        rows: null,
        error: error instanceof Error ? error.message : "Failed to parse import file.",
      };
    }
  }, [csvText, workbookRows, agents, defaultOwnerId]);

  const handleFile = async (file: File) => {
    setResult(null);
    setFileError(null);
    setLoadedFileName(null);
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const rows = await readXlsxRows(file);
        setWorkbookRows(rows);
        setCsvText("");
        setLoadedFileName(`${file.name} • ${Math.max(0, rows.length - 1)} rows`);
        return;
      }

      const text = await file.text();
      setWorkbookRows(null);
      setCsvText(text);
      setLoadedFileName(file.name);
    } catch (error) {
      setWorkbookRows(null);
      setCsvText("");
      setFileError(error instanceof Error ? error.message : "Unable to read the selected file.");
    }
  };

  const handleImport = () => {
    if (!parsed || parsed.length === 0) return;
    setResult(onImport(parsed, partner));
  };

  const handleDownloadTemplate = () => {
    downloadCsvFile(
      `${sanitizeFileSegment("leads-import-template")}.csv`,
      [
        CSV_TEMPLATE_HEADERS,
        [
          "Acme Manufacturing",
          "2019/123456/07",
          "Manufacturing",
          "Jane Doe",
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
        <h2 className="mt-2 text-xl font-semibold text-white">Bulk import via CSV or XLSX</h2>
        <p className="mt-2 text-sm text-white/56">
          Upload a CSV/XLSX file or paste rows below. Email is required; company, contact, industry, phone, location, registration number, and spend are mapped when available.
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
            Choose CSV/XLSX file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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

        {loadedFileName ? (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/60">
            Loaded {loadedFileName}.
          </p>
        ) : null}

        <label className="mt-4 flex flex-col gap-2">
          <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
            Or paste CSV
          </span>
          <textarea
            value={csvText}
            onChange={(event) => {
              setWorkbookRows(null);
              setLoadedFileName(null);
              setFileError(null);
              setCsvText(event.target.value);
              setResult(null);
            }}
            rows={8}
            placeholder={CSV_TEMPLATE_HEADERS.join(",")}
            className="admin-input w-full rounded-xl px-3 py-2 font-mono text-xs text-white"
          />
        </label>

        {fileError || parseError ? (
          <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {fileError ?? parseError}
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

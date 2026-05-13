"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Clock3, Mail, MessageCircle } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminPrimitives";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { cn } from "@/lib/utils";
import type { SalesLead, SalesLeadQualificationStage } from "@/lib/admin-types";

type LeadEngagement = {
  leadId: string;
  latestThreadId: string;
  lastMessageAt: string;
  lastDirection: "inbound" | "outbound" | null;
  unreadCount: number;
  state: "awaiting_reply" | "responded";
};

type PartnerOrgOption = {
  id: string;
  name: string;
};

type SequenceState =
  | "not_contacted"
  | "contacted"
  | "awaiting_reply"
  | "responded"
  | "interested"
  | "not_interested"
  | "qualified"
  | "unqualified";

const sequenceFilters: Array<{ value: SequenceState | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "not_contacted", label: "Not contacted" },
  { value: "awaiting_reply", label: "Awaiting reply" },
  { value: "responded", label: "Responded" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not interested" },
  { value: "qualified", label: "Qualified" },
  { value: "unqualified", label: "Unqualified" },
];

const ALL_INDUSTRIES = "all" as const;

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-ZA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function requiresQualificationReason(stage: SalesLeadQualificationStage) {
  return stage === "Not Interested" || stage === "Does Not Qualify";
}

function shouldHideFromLeadsPage(lead: SalesLead) {
  if (
    lead.qualificationStage !== "Not Interested" &&
    lead.qualificationStage !== "Does Not Qualify"
  ) {
    return false;
  }

  return typeof lead.qualificationReason === "string" && lead.qualificationReason.trim().length > 0;
}

function sequenceStateForLead(
  lead: SalesLead,
  engagement: LeadEngagement | null,
): SequenceState {
  switch (lead.qualificationStage) {
    case "Qualifies":
      return "qualified";
    case "Does Not Qualify":
      return "unqualified";
    case "Interested":
      return "interested";
    case "Not Interested":
      return "not_interested";
    default:
      break;
  }

  if (engagement?.state === "responded") return "responded";
  if (engagement?.state === "awaiting_reply") return "awaiting_reply";
  if (lead.qualificationStage === "Contacted") return "contacted";
  return "not_contacted";
}

function sequenceLabel(state: SequenceState) {
  switch (state) {
    case "not_contacted":
      return "Not contacted";
    case "contacted":
      return "Contacted";
    case "awaiting_reply":
      return "Awaiting reply";
    case "responded":
      return "Responded";
    case "interested":
      return "Interested";
    case "not_interested":
      return "Not interested";
    case "qualified":
      return "Qualified";
    case "unqualified":
      return "Unqualified";
  }
}

function sequenceTone(state: SequenceState) {
  switch (state) {
    case "responded":
    case "interested":
    case "qualified":
      return "border-emerald-300/35 bg-emerald-500/10 text-emerald-100";
    case "awaiting_reply":
    case "contacted":
      return "border-amber-300/35 bg-amber-500/10 text-amber-100";
    case "not_interested":
    case "unqualified":
      return "border-rose-300/35 bg-rose-500/10 text-rose-100";
    default:
      return "border-white/14 bg-white/[0.04] text-white/68";
  }
}

function emailSubject(lead: SalesLead) {
  return `Foundation-1 - ${lead.company}`;
}

function followUpEmailBody(lead: SalesLead) {
  const firstName = lead.contactName.trim().split(/\s+/)[0] || lead.contactName;
  return [
    `Hi ${firstName},`,
    "",
    "Following up on my previous email. Is reducing electricity spend or improving power reliability something your team is currently looking at?",
    "",
    "A short reply is enough and I can route you to the right next step.",
    "",
    "Kind regards,",
  ].join("\n");
}

function buildInboxHref({
  inboxHref,
  lead,
  engagement,
  state,
}: {
  inboxHref: string;
  lead: SalesLead;
  engagement: LeadEngagement | null;
  state: SequenceState;
}) {
  const params = new URLSearchParams();
  if (state === "responded" && engagement?.latestThreadId) {
    params.set("thread", engagement.latestThreadId);
    return `${inboxHref}?${params.toString()}`;
  }

  if (lead.linkedAdminLeadId) params.set("lead", lead.linkedAdminLeadId);
  params.set("to", lead.email);
  params.set("subject", emailSubject(lead));
  params.set("company", lead.company);
  params.set("name", lead.contactName);
  if (state === "awaiting_reply" || state === "contacted") {
    params.set("body", followUpEmailBody(lead));
  } else {
    params.set("template", "outreach");
  }
  return `${inboxHref}?${params.toString()}`;
}

export function SalesLeadsRoute({
  agentId,
  registrationHref = "/sales/registration",
  clientHrefBase = "/sales/clients",
  inboxHref = "/sales/inbox",
  eyebrow = "Lead Management",
  title = "Sales Leads",
  description = "Leads are prospects only. Qualify each lead, then convert qualified leads into registered clients.",
  partnerOrgs = [],
  showPartnerAssignment = false,
  showAssignedTo = true,
  allowDelete = false,
}: {
  agentId: string | null;
  registrationHref?: string;
  clientHrefBase?: string;
  inboxHref?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  partnerOrgs?: PartnerOrgOption[];
  showPartnerAssignment?: boolean;
  showAssignedTo?: boolean;
  allowDelete?: boolean;
}) {
  const {
    agents,
    leads,
    salesLeads,
    salesLeadQualificationStages,
    createSalesLead,
    updateSalesLeadQualificationStage,
    updateSalesLeadOwner,
    deleteSalesLead,
  } = useAdminPortal();
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingQualificationPanels, setPendingQualificationPanels] = useState<
    Record<
      string,
      {
        stage: SalesLeadQualificationStage;
        reason: string;
        error: string | null;
      }
    >
  >({});
  const [newLead, setNewLead] = useState({
    contactName: "",
    company: "",
    email: "",
  });
  const [sequenceFilter, setSequenceFilter] = useState<SequenceState | "all">("all");
  const [industryFilter, setIndustryFilter] = useState<string>(ALL_INDUSTRIES);
  const [engagementByLeadId, setEngagementByLeadId] = useState<Record<string, LeadEngagement>>({});
  const [partnerAssignments, setPartnerAssignments] = useState<Record<string, string | null>>({});
  const [pendingPartnerAssignmentId, setPendingPartnerAssignmentId] = useState<string | null>(null);
  const adminLeadById = useMemo(
    () => new Map(leads.map((lead) => [lead.id, lead])),
    [leads],
  );

  const linkedLeadIds = useMemo(
    () =>
      Array.from(
        new Set(
          salesLeads
            .map((lead) => lead.linkedAdminLeadId)
            .filter((id): id is string => typeof id === "string" && id.length > 0),
        ),
      ),
    [salesLeads],
  );
  const linkedLeadIdsKey = linkedLeadIds.join(",");

  useEffect(() => {
    let cancelled = false;

    async function refreshEngagement() {
      if (!linkedLeadIdsKey) {
        setEngagementByLeadId({});
        return;
      }

      try {
        const url = new URL("/api/email/lead-engagement", window.location.origin);
        url.searchParams.set("leadIds", linkedLeadIdsKey);
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
  }, [linkedLeadIdsKey]);

  const baseSalesLeads = useMemo(
    () =>
      (agentId ? salesLeads.filter((lead) => lead.ownerId === agentId) : salesLeads).filter(
        (lead) => !shouldHideFromLeadsPage(lead),
      ),
    [agentId, salesLeads],
  );
  const salesLeadIndustryById = useMemo(() => {
    const industries: Record<string, string> = {};
    for (const lead of baseSalesLeads) {
      industries[lead.id] = lead.linkedAdminLeadId
        ? adminLeadById.get(lead.linkedAdminLeadId)?.industry?.trim() ?? ""
        : "";
    }
    return industries;
  }, [adminLeadById, baseSalesLeads]);
  const industryOptions = useMemo(() => {
    const set = new Set<string>();
    Object.values(salesLeadIndustryById).forEach((industry) => {
      if (industry) set.add(industry);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [salesLeadIndustryById]);
  const sequenceStateBySalesLeadId = useMemo(() => {
    const states: Record<string, SequenceState> = {};
    for (const lead of baseSalesLeads) {
      const engagement = lead.linkedAdminLeadId
        ? engagementByLeadId[lead.linkedAdminLeadId] ?? null
        : null;
      states[lead.id] = sequenceStateForLead(lead, engagement);
    }
    return states;
  }, [baseSalesLeads, engagementByLeadId]);
  const sequenceCounts = useMemo(() => {
    const counts: Record<SequenceState | "total", number> = {
      total: baseSalesLeads.length,
      not_contacted: 0,
      contacted: 0,
      awaiting_reply: 0,
      responded: 0,
      interested: 0,
      not_interested: 0,
      qualified: 0,
      unqualified: 0,
    };
    for (const lead of baseSalesLeads) {
      const state = sequenceStateBySalesLeadId[lead.id] ?? "not_contacted";
      counts[state] += 1;
    }
    return counts;
  }, [baseSalesLeads, sequenceStateBySalesLeadId]);
  const visibleSalesLeads = useMemo(
    () =>
      baseSalesLeads.filter((lead) => {
        if (
          sequenceFilter !== "all" &&
          sequenceStateBySalesLeadId[lead.id] !== sequenceFilter
        ) {
          return false;
        }
        if (
          industryFilter !== ALL_INDUSTRIES &&
          salesLeadIndustryById[lead.id] !== industryFilter
        ) {
          return false;
        }
        return true;
      }),
    [baseSalesLeads, industryFilter, salesLeadIndustryById, sequenceFilter, sequenceStateBySalesLeadId],
  );
  const selectedOwnerId = agentId ?? agents[0]?.id ?? "";

  const isNewLeadFormComplete =
    newLead.contactName.trim().length > 0 &&
    newLead.company.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newLead.email.trim()) &&
    selectedOwnerId.length > 0;

  const handleCreateLead = () => {
    if (!selectedOwnerId) {
      setFormError("Select a sales owner before adding this lead.");
      return;
    }

    if (!isNewLeadFormComplete) {
      setFormError("Lead requires contact name, company, and a valid email address.");
      return;
    }

    const created = createSalesLead({
      contactName: newLead.contactName,
      company: newLead.company,
      email: newLead.email,
      ownerId: selectedOwnerId,
    });

    if (!created) {
      setFormError("Unable to create lead. Check fields and try again.");
      return;
    }

    setFormError(null);
    setNewLead({
      contactName: "",
      company: "",
      email: "",
    });
  };

  const getDeleteError = (lead: SalesLead) => {
    if (lead.status === "Converted" || lead.convertedClientProfileId) {
      return "Converted leads must be managed from Clients.";
    }

    const linkedAdminLead = lead.linkedAdminLeadId
      ? leads.find((entry) => entry.id === lead.linkedAdminLeadId) ?? null
      : null;
    if (linkedAdminLead?.isClientRegistered) {
      return "Registered client profiles cannot be deleted from My Leads.";
    }

    return null;
  };

  const handleDeleteLead = (lead: SalesLead) => {
    const deleteError = getDeleteError(lead);
    if (deleteError) {
      setActionError(deleteError);
      return;
    }

    const linkedAdminLead = lead.linkedAdminLeadId
      ? leads.find((entry) => entry.id === lead.linkedAdminLeadId) ?? null
      : null;
    const confirmMessage =
      linkedAdminLead && !linkedAdminLead.isClientRegistered
        ? `Delete lead "${lead.company}"? This also removes the mirrored admin prospect record.`
        : `Delete lead "${lead.company}"?`;

    if (typeof window !== "undefined" && !window.confirm(confirmMessage)) {
      return;
    }

    const result = deleteSalesLead(lead.id);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }

    setActionError(null);
  };

  const handlePartnerAssignment = async (lead: SalesLead, partnerOrgId: string | null) => {
    const previousValue = Object.prototype.hasOwnProperty.call(partnerAssignments, lead.id)
      ? partnerAssignments[lead.id]
      : lead.partnerOrgId ?? null;

    setActionError(null);
    setPendingPartnerAssignmentId(lead.id);
    setPartnerAssignments((current) => ({
      ...current,
      [lead.id]: partnerOrgId,
    }));

    try {
      const response = await fetch(`/api/admin/sales-leads/${encodeURIComponent(lead.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerOrgId }),
      });
      const json = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !json.ok) {
        setActionError(json.error ?? "Could not update partner assignment.");
        setPartnerAssignments((current) => ({
          ...current,
          [lead.id]: previousValue,
        }));
      }
    } catch {
      setActionError("Could not update partner assignment.");
      setPartnerAssignments((current) => ({
        ...current,
        [lead.id]: previousValue,
      }));
    } finally {
      setPendingPartnerAssignmentId(null);
    }
  };

  const handleQualificationChange = (
    lead: SalesLead,
    nextStage: SalesLeadQualificationStage,
  ) => {
    if (lead.status === "Converted") {
      return;
    }

    if (requiresQualificationReason(nextStage)) {
      setPendingQualificationPanels((current) => ({
        ...current,
        [lead.id]: {
          stage: nextStage,
          reason:
            lead.qualificationStage === nextStage
              ? lead.qualificationReason ?? ""
              : "",
          error: null,
        },
      }));
      return;
    }

    const updated = updateSalesLeadQualificationStage(
      lead.id,
      nextStage,
    );

    if (!updated) {
      return;
    }

    setPendingQualificationPanels((current) => {
      const next = { ...current };
      delete next[lead.id];
      return next;
    });
  };

  const handleQualificationReasonSubmit = (lead: SalesLead) => {
    const pending = pendingQualificationPanels[lead.id];
    if (!pending) {
      return;
    }

    const updated = updateSalesLeadQualificationStage(
      lead.id,
      pending.stage,
      pending.reason,
    );

    if (!updated) {
      setPendingQualificationPanels((current) => ({
        ...current,
        [lead.id]: {
          ...pending,
          error:
            "Reason is required when marking a lead as Not Interested or Does Not Qualify.",
        },
      }));
      return;
    }

    setPendingQualificationPanels((current) => {
      const next = { ...current };
      delete next[lead.id];
      return next;
    });
  };

  return (
    <div className="space-y-6 pb-8">
      <AdminHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
      />

      <section className="grid gap-3 md:grid-cols-4">
        <SequenceStat label="Total leads" value={sequenceCounts.total} />
        <SequenceStat label="Not contacted" value={sequenceCounts.not_contacted} />
        <SequenceStat label="Awaiting reply" value={sequenceCounts.awaiting_reply + sequenceCounts.contacted} />
        <SequenceStat label="Responded" value={sequenceCounts.responded} />
      </section>

      <section className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="line-label">Add Lead</p>
            <p className="mt-2 text-sm text-white/52">
              Add a prospect, send the first sequence email from Inbox, then track replies here.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="flex min-w-[12rem] flex-col gap-2">
              <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
                Industry
              </span>
              <select
                value={industryFilter}
                onChange={(event) => setIndustryFilter(event.target.value)}
                className="admin-input admin-select h-10 rounded-xl px-3 text-sm font-medium text-white"
              >
                <option value={ALL_INDUSTRIES}>All industries</option>
                {industryOptions.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[12rem] flex-col gap-2">
              <span className="text-[0.64rem] font-medium uppercase tracking-[0.2em] text-white/46">
                Sequence view
              </span>
              <select
                value={sequenceFilter}
                onChange={(event) => setSequenceFilter(event.target.value as SequenceState | "all")}
                className="admin-input admin-select h-10 rounded-xl px-3 text-sm font-medium text-white"
              >
                {sequenceFilters.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {formError ? <p className="mt-2 text-sm text-white/56">{formError}</p> : null}
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <input
            placeholder="Contact Name"
            value={newLead.contactName}
            onChange={(event) =>
              setNewLead((current) => ({ ...current, contactName: event.target.value }))
            }
            className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <input
            placeholder="Company"
            value={newLead.company}
            onChange={(event) =>
              setNewLead((current) => ({ ...current, company: event.target.value }))
            }
            className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <input
            placeholder="Email Address"
            value={newLead.email}
            onChange={(event) =>
              setNewLead((current) => ({ ...current, email: event.target.value }))
            }
            className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={handleCreateLead}
            disabled={!isNewLeadFormComplete}
            className="rounded-[0.8rem] border border-white/16 bg-white/[0.08] px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/84 transition hover:border-white/28 hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Add Lead
          </button>
        </div>
      </section>

      <div className="overflow-x-auto rounded-2xl border border-white/12 bg-white/[0.03]">
        {actionError ? (
          <p className="border-b border-white/8 px-4 py-3 text-sm text-white/56">{actionError}</p>
        ) : null}
        <table className="w-full border-collapse text-sm text-white/75">
          <thead>
            <tr className="bg-white/[0.03] text-xs uppercase tracking-[0.2em] text-white/52">
              <th className="px-3 py-3 text-left font-medium">Name</th>
              <th className="px-3 py-3 text-left font-medium">Company</th>
              <th className="px-3 py-3 text-left font-medium">Industry</th>
              <th className="px-3 py-3 text-left font-medium">Email</th>
              {showAssignedTo ? (
                <th className="px-3 py-3 text-left font-medium">Assigned to</th>
              ) : null}
              {showPartnerAssignment ? (
                <th className="px-3 py-3 text-left font-medium">Partner</th>
              ) : null}
              <th className="px-3 py-3 text-left font-medium">Sequence</th>
              <th className="px-3 py-3 text-left font-medium">Qualification</th>
              <th className="px-3 py-3 text-left font-medium">Status</th>
              <th className="px-3 py-3 text-left font-medium">Updated</th>
              <th className="px-3 py-3 text-left font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleSalesLeads.map((lead) => (
              <tr key={lead.id} className="border-t border-white/8 align-top hover:bg-white/[0.04]">
                <td className="px-3 py-3">{lead.contactName}</td>
                <td className="px-3 py-3">{lead.company}</td>
                <td className="px-3 py-3 text-white/62">
                  {salesLeadIndustryById[lead.id] || "—"}
                </td>
                <td className="px-3 py-3 text-white/62">{lead.email}</td>
                {showAssignedTo ? (
                  <td className="px-3 py-3">
                    <select
                      value={lead.ownerId}
                      onChange={(event) => updateSalesLeadOwner(lead.id, event.target.value)}
                      disabled={lead.status === "Converted"}
                      aria-label={`Assign ${lead.company} to`}
                      className="admin-input admin-select w-full min-w-[10rem] rounded-[0.7rem] px-2.5 py-1.5 text-xs"
                    >
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </td>
                ) : null}
                {showPartnerAssignment ? (
                  <td className="px-3 py-3">
                    {(() => {
                      const hasLocalAssignment = Object.prototype.hasOwnProperty.call(
                        partnerAssignments,
                        lead.id,
                      );
                      const partnerValue = hasLocalAssignment
                        ? partnerAssignments[lead.id] ?? ""
                        : lead.partnerOrgId ?? "";
                      return (
                        <select
                          value={partnerValue}
                          onChange={(event) => {
                            void handlePartnerAssignment(
                              lead,
                              event.target.value.length > 0 ? event.target.value : null,
                            );
                          }}
                          disabled={pendingPartnerAssignmentId === lead.id}
                          aria-label={`Assign ${lead.company} to partner`}
                          className="admin-input admin-select w-full min-w-[11rem] rounded-[0.7rem] px-2.5 py-1.5 text-xs"
                        >
                          <option value="">No partner</option>
                          {partnerOrgs.map((org) => (
                            <option key={org.id} value={org.id}>
                              {org.name}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </td>
                ) : null}
                <td className="px-3 py-3">
                  {(() => {
                    const state = sequenceStateBySalesLeadId[lead.id] ?? "not_contacted";
                    const engagement = lead.linkedAdminLeadId
                      ? engagementByLeadId[lead.linkedAdminLeadId] ?? null
                      : null;
                    return (
                      <div className="min-w-[12rem] space-y-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.16em]",
                            sequenceTone(state),
                          )}
                        >
                          {state === "responded" ? (
                            <MessageCircle className="size-3" />
                          ) : state === "awaiting_reply" || state === "contacted" ? (
                            <Clock3 className="size-3" />
                          ) : (
                            <Mail className="size-3" />
                          )}
                          {sequenceLabel(state)}
                        </span>
                        <div>
                          <Link
                            href={buildInboxHref({
                              inboxHref,
                              lead,
                              engagement,
                              state,
                            })}
                            className="inline-flex items-center gap-1.5 rounded-[0.65rem] border border-white/12 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.14em] text-white/72 transition hover:border-white/26 hover:text-white"
                          >
                            <Mail className="size-3" />
                            {state === "responded"
                              ? "Open reply"
                              : state === "awaiting_reply" || state === "contacted"
                                ? "Follow up"
                                : "Send email"}
                          </Link>
                        </div>
                      </div>
                    );
                  })()}
                </td>
                <td className="px-3 py-3">
                  {(() => {
                    const pending = pendingQualificationPanels[lead.id] ?? null;
                    const selectValue = pending?.stage ?? lead.qualificationStage;
                    return (
                      <div className="min-w-[17rem] space-y-2">
                        <select
                          value={selectValue}
                          onChange={(event) =>
                            handleQualificationChange(
                              lead,
                              event.target.value as (typeof salesLeadQualificationStages)[number],
                            )
                          }
                          disabled={lead.status === "Converted"}
                          className="admin-input admin-select w-full rounded-[0.7rem] px-2.5 py-1.5 text-xs"
                        >
                          {salesLeadQualificationStages.map((stage) => (
                            <option key={stage} value={stage}>
                              {stage}
                            </option>
                          ))}
                        </select>
                        {pending ? (
                          <div className="rounded-[0.75rem] border border-white/10 bg-black/30 p-2.5">
                            <textarea
                              rows={2}
                              value={pending.reason}
                              onChange={(event) =>
                                setPendingQualificationPanels((current) => ({
                                  ...current,
                                  [lead.id]: {
                                    ...pending,
                                    reason: event.target.value,
                                    error: null,
                                  },
                                }))
                              }
                              disabled={lead.status === "Converted"}
                              placeholder="Reason is required"
                              className="admin-input w-full rounded-[0.7rem] px-2.5 py-1.5 text-xs"
                            />
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleQualificationReasonSubmit(lead)}
                                disabled={pending.reason.trim().length === 0}
                                className="rounded-[0.65rem] border border-white/12 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.16em] text-white/72 transition hover:border-white/26 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                Submit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingQualificationPanels((current) => {
                                    const next = { ...current };
                                    delete next[lead.id];
                                    return next;
                                  })
                                }
                                className="rounded-[0.65rem] border border-white/10 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.16em] text-white/58 transition hover:border-white/20 hover:text-white"
                              >
                                Cancel
                              </button>
                            </div>
                            {pending.error ? (
                              <p className="mt-2 text-xs text-white/50">{pending.error}</p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}
                </td>
                <td className="px-3 py-3 text-white/62">{lead.status}</td>
                <td className="px-3 py-3 text-white/52">{formatDateTime(lead.lastUpdatedAt)}</td>
                <td className="px-3 py-3">
                  <div className="flex min-w-[10rem] flex-col items-start gap-2">
                    {lead.status === "Converted" && lead.convertedClientProfileId ? (
                      <Link
                        href={`${clientHrefBase}/${lead.convertedClientProfileId}`}
                        className="inline-flex items-center justify-center rounded-[0.72rem] border border-white/12 bg-white/[0.06] px-3 py-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-white/88 transition hover:border-white/26 hover:bg-white/[0.12]"
                      >
                        Open Client
                      </Link>
                    ) : lead.qualificationStage === "Qualifies" ? (
                      <Link
                        href={registrationHref}
                        style={{ whiteSpace: "nowrap" }}
                        className="inline-flex items-center justify-center rounded-full border border-white/18 bg-white/[0.16] px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.08em] leading-none text-white transition hover:border-white/34 hover:bg-white/[0.24]"
                      >
                        Register Client
                      </Link>
                    ) : (
                      <span className="text-xs text-white/48">Qualify lead first</span>
                    )}
                    {allowDelete && !getDeleteError(lead) ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteLead(lead)}
                        className="rounded-[0.65rem] border border-white/10 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.16em] text-white/58 transition hover:border-white/20 hover:text-white"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {visibleSalesLeads.length === 0 ? (
          <p className="border-t border-white/8 px-4 py-6 text-sm text-white/58">
            {baseSalesLeads.length === 0
              ? "No leads are assigned to this profile yet."
              : "No leads match the current filters."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SequenceStat({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
      <p className="line-label">{label}</p>
      <p className="mt-2 text-3xl font-medium tracking-[-0.04em] text-white">
        {value}
      </p>
    </article>
  );
}

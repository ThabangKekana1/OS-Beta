"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminPrimitives";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import type { SalesLead, SalesLeadQualificationStage } from "@/lib/admin-types";

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

export function SalesLeadsRoute({
  agentId,
  registrationHref = "/sales/registration",
  clientHrefBase = "/sales/clients",
}: {
  agentId: string | null;
  registrationHref?: string;
  clientHrefBase?: string;
}) {
  const {
    agents,
    salesLeads,
    salesLeadQualificationStages,
    createSalesLead,
    updateSalesLeadQualificationStage,
    updateSalesLeadOwner,
  } = useAdminPortal();
  const [formError, setFormError] = useState<string | null>(null);
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

  const visibleSalesLeads = useMemo(
    () =>
      (agentId ? salesLeads.filter((lead) => lead.ownerId === agentId) : salesLeads).filter(
        (lead) => !shouldHideFromLeadsPage(lead),
      ),
    [agentId, salesLeads],
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
        eyebrow="Lead Management"
        title="Sales Leads"
        description="Leads are prospects only. Qualify each lead, then convert qualified leads into registered clients."
      />

      <section className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
        <p className="line-label">Add Lead</p>
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
        <table className="w-full border-collapse text-sm text-white/75">
          <thead>
            <tr className="bg-white/[0.03] text-xs uppercase tracking-[0.2em] text-white/52">
              <th className="px-3 py-3 text-left font-medium">Name</th>
              <th className="px-3 py-3 text-left font-medium">Company</th>
              <th className="px-3 py-3 text-left font-medium">Email</th>
              <th className="px-3 py-3 text-left font-medium">Assigned to</th>
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
                <td className="px-3 py-3 text-white/62">{lead.email}</td>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {visibleSalesLeads.length === 0 ? (
          <p className="border-t border-white/8 px-4 py-6 text-sm text-white/58">
            No leads are assigned to this profile yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}

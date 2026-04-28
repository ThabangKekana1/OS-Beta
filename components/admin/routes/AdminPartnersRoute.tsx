"use client";

import { useEffect, useMemo, useState, type FormEvent, Fragment } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import type { PartnerOrg, PartnerOrgStatus, PartnerOrgTier } from "@/lib/admin-types";
import { partnerOrgStatuses, partnerOrgTiers } from "@/lib/admin-types";

type FormState = {
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  tier: PartnerOrgTier;
  commissionPct: string;
  notes: string;
};

const emptyForm: FormState = {
  name: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  tier: "Standard",
  commissionPct: "5",
  notes: "",
};

export function AdminPartnersRoute() {
  const [partnerOrgs, setPartnerOrgs] = useState<PartnerOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [statusFilter, setStatusFilter] = useState<PartnerOrgStatus | "All">("All");
  const [userFormOpenId, setUserFormOpenId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<{ email: string; name: string; password: string }>({
    email: "",
    name: "",
    password: "",
  });
  const [userSubmitting, setUserSubmitting] = useState(false);
  const [userMessage, setUserMessage] = useState<
    { tone: "ok" | "err"; text: string } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/partner-orgs", { cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean; partnerOrgs?: PartnerOrg[]; error?: string };
        if (cancelled) return;
        if (!res.ok || !data.ok || !Array.isArray(data.partnerOrgs)) {
          setError(data.error ?? "Failed to load partner orgs.");
        } else {
          setPartnerOrgs(data.partnerOrgs);
        }
      } catch {
        if (!cancelled) setError("Failed to load partner orgs.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () =>
      statusFilter === "All"
        ? partnerOrgs
        : partnerOrgs.filter((org) => org.status === statusFilter),
    [partnerOrgs, statusFilter],
  );

  const activeCount = useMemo(
    () => partnerOrgs.filter((org) => org.status === "Active").length,
    [partnerOrgs],
  );

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const name = form.name.trim();
    const contactEmail = form.contactEmail.trim().toLowerCase();
    if (!name || !contactEmail.includes("@")) {
      setError("Org name and a valid contact email are required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/partner-orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          contactName: form.contactName.trim(),
          contactEmail,
          contactPhone: form.contactPhone.trim(),
          tier: form.tier,
          commissionPct: Number(form.commissionPct),
          notes: form.notes.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; partnerOrg?: PartnerOrg; error?: string };
      if (!res.ok || !data.ok || !data.partnerOrg) {
        setError(data.error ?? "Failed to create partner org.");
        return;
      }
      setPartnerOrgs((prev) => [data.partnerOrg!, ...prev]);
      setForm(emptyForm);
    } catch {
      setError("Failed to create partner org.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (org: PartnerOrg, status: PartnerOrgStatus) => {
    const previous = partnerOrgs;
    setPartnerOrgs((prev) =>
      prev.map((entry) => (entry.id === org.id ? { ...entry, status } : entry)),
    );
    try {
      const res = await fetch("/api/admin/partner-orgs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: org.id, status }),
      });
      const data = (await res.json()) as { ok?: boolean; partnerOrg?: PartnerOrg; error?: string };
      if (!res.ok || !data.ok || !data.partnerOrg) {
        setPartnerOrgs(previous);
        setError(data.error ?? "Failed to update partner org.");
      }
    } catch {
      setPartnerOrgs(previous);
      setError("Failed to update partner org.");
    }
  };

  const handleDelete = async (org: PartnerOrg) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete partner org "${org.name}"?`)) {
      return;
    }
    const previous = partnerOrgs;
    setPartnerOrgs((prev) => prev.filter((entry) => entry.id !== org.id));
    try {
      const res = await fetch(`/api/admin/partner-orgs?id=${encodeURIComponent(org.id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setPartnerOrgs(previous);
        setError(data.error ?? "Failed to delete partner org.");
      }
    } catch {
      setPartnerOrgs(previous);
      setError("Failed to delete partner org.");
    }
  };

  const openUserForm = (org: PartnerOrg) => {
    setUserMessage(null);
    setUserForm({
      email: org.contactEmail ?? "",
      name: org.contactName || org.name,
      password: "",
    });
    setUserFormOpenId(org.id);
  };

  const handleCreateUser = async (org: PartnerOrg, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUserMessage(null);
    if (!userForm.email.includes("@") || !userForm.name.trim() || userForm.password.length < 10) {
      setUserMessage({ tone: "err", text: "Email, name, and password (min 10 chars) required." });
      return;
    }
    setUserSubmitting(true);
    try {
      const res = await fetch(`/api/admin/partner-orgs/${encodeURIComponent(org.id)}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userForm.email.trim().toLowerCase(),
          name: userForm.name.trim(),
          password: userForm.password,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setUserMessage({ tone: "err", text: data.error ?? "Failed to create user." });
        return;
      }
      setUserMessage({ tone: "ok", text: `Login created for ${userForm.email}.` });
      setUserForm((prev) => ({ ...prev, password: "" }));
    } catch {
      setUserMessage({ tone: "err", text: "Failed to create user." });
    } finally {
      setUserSubmitting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-4 lg:gap-5">
      <section className="app-surface rounded-[1.6rem] px-5 py-5 lg:px-6 lg:py-6">
        <AdminHeader
          eyebrow="Partners"
          title="Partner organisations."
          description="Onboard introducer partners. Each org will get its own portal seat to submit and manage leads."
          actions={
            <div className="flex flex-wrap gap-2">
              <AdminBadge label={`${partnerOrgs.length} Total`} />
              <AdminBadge label={`${activeCount} Active`} tone="muted" />
            </div>
          }
        />
      </section>

      <section className="app-surface rounded-[1.4rem] p-4 lg:p-5">
        <p className="line-label">Add Partner Org</p>
        <form onSubmit={handleCreate} className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.2em] text-white/45">Org Name *</span>
            <input
              required
              value={form.name}
              onChange={(event) => updateForm("name", event.target.value)}
              placeholder="Acme Capital"
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.2em] text-white/45">Contact Person</span>
            <input
              value={form.contactName}
              onChange={(event) => updateForm("contactName", event.target.value)}
              placeholder="Jane Doe"
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.2em] text-white/45">Contact Email *</span>
            <input
              required
              type="email"
              value={form.contactEmail}
              onChange={(event) => updateForm("contactEmail", event.target.value)}
              placeholder="jane@acme.co.za"
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.2em] text-white/45">Contact Phone</span>
            <input
              value={form.contactPhone}
              onChange={(event) => updateForm("contactPhone", event.target.value)}
              placeholder="+27 ..."
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.2em] text-white/45">Tier</span>
            <select
              value={form.tier}
              onChange={(event) => updateForm("tier", event.target.value as PartnerOrgTier)}
              className="admin-input admin-select rounded-[0.8rem] px-3 py-2 text-sm"
            >
              {partnerOrgTiers.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.2em] text-white/45">
              Commission %
            </span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={form.commissionPct}
              onChange={(event) => updateForm("commissionPct", event.target.value)}
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-xs uppercase tracking-[0.2em] text-white/45">Notes</span>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(event) => updateForm("notes", event.target.value)}
              placeholder="Internal notes about agreement, region, etc."
              className="admin-input rounded-[0.8rem] px-3 py-2 text-sm"
            />
          </label>
          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
            {error ? <p className="text-xs text-rose-300/80">{error}</p> : <span />}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-[0.8rem] border border-white/16 bg-white/[0.08] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-white/28 hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {submitting ? "Adding…" : "Add Partner"}
            </button>
          </div>
        </form>
      </section>

      <section className="app-surface rounded-[1.4rem] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="line-label">Partner Directory</p>
          <label className="flex items-center gap-2">
            <span className="text-[0.62rem] uppercase tracking-[0.18em] text-white/45">Status</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as PartnerOrgStatus | "All")
              }
              className="admin-input admin-select rounded-[0.7rem] px-2.5 py-1.5 text-xs"
            >
              <option value="All">All</option>
              {partnerOrgStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 overflow-auto rounded-[0.9rem] border border-white/10">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-black/70 text-[0.64rem] uppercase tracking-[0.18em] text-white/50">
              <tr>
                <th className="px-3 py-2">Org</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Commission</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-sm text-white/52">
                    Loading…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-sm text-white/52">
                    No partner organisations yet.
                  </td>
                </tr>
              ) : (
                visible.map((org) => (
                  <Fragment key={org.id}>
                  <tr className="border-t border-white/8 bg-black/35 align-top">
                    <td className="px-3 py-2 text-white/82">
                      <div className="font-medium text-white">{org.name}</div>
                      {org.notes ? (
                        <div className="mt-0.5 text-xs text-white/45">{org.notes}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-white/72">
                      <div>{org.contactName || "—"}</div>
                      <div className="text-xs text-white/52">{org.contactEmail}</div>
                      {org.contactPhone ? (
                        <div className="text-xs text-white/45">{org.contactPhone}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-white/72">{org.tier}</td>
                    <td className="px-3 py-2 text-white/72">{org.commissionPct}%</td>
                    <td className="px-3 py-2">
                      <select
                        value={org.status}
                        onChange={(event) =>
                          handleStatusChange(org, event.target.value as PartnerOrgStatus)
                        }
                        className="admin-input admin-select rounded-[0.65rem] px-2.5 py-1 text-xs"
                      >
                        {partnerOrgStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-white/52 text-xs">
                      {new Date(org.createdAt).toLocaleDateString("en-ZA")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (userFormOpenId === org.id) {
                              setUserFormOpenId(null);
                            } else {
                              openUserForm(org);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-[0.65rem] border border-white/12 px-2 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-white/64 transition hover:border-emerald-300/40 hover:text-emerald-200"
                        >
                          <UserPlus className="size-3" />
                          Login
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(org)}
                          className="inline-flex items-center gap-1.5 rounded-[0.65rem] border border-white/12 px-2 py-1 text-[0.62rem] uppercase tracking-[0.16em] text-white/64 transition hover:border-rose-300/40 hover:text-rose-200"
                        >
                          <Trash2 className="size-3" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {userFormOpenId === org.id ? (
                    <tr key={`${org.id}-userform`} className="border-t border-white/8 bg-black/55">
                      <td colSpan={7} className="px-3 py-3">
                        <form
                          onSubmit={(event) => handleCreateUser(org, event)}
                          className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]"
                        >
                          <label className="flex flex-col gap-1">
                            <span className="text-[0.62rem] uppercase tracking-[0.18em] text-white/45">
                              Login Email
                            </span>
                            <input
                              required
                              type="email"
                              value={userForm.email}
                              onChange={(event) =>
                                setUserForm((prev) => ({ ...prev, email: event.target.value }))
                              }
                              className="admin-input rounded-[0.7rem] px-3 py-1.5 text-sm"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[0.62rem] uppercase tracking-[0.18em] text-white/45">
                              Display Name
                            </span>
                            <input
                              required
                              value={userForm.name}
                              onChange={(event) =>
                                setUserForm((prev) => ({ ...prev, name: event.target.value }))
                              }
                              className="admin-input rounded-[0.7rem] px-3 py-1.5 text-sm"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[0.62rem] uppercase tracking-[0.18em] text-white/45">
                              Password (min 10)
                            </span>
                            <input
                              required
                              type="text"
                              minLength={10}
                              value={userForm.password}
                              onChange={(event) =>
                                setUserForm((prev) => ({ ...prev, password: event.target.value }))
                              }
                              placeholder="Share securely with partner"
                              className="admin-input rounded-[0.7rem] px-3 py-1.5 text-sm"
                            />
                          </label>
                          <div className="flex items-end gap-2">
                            <button
                              type="submit"
                              disabled={userSubmitting}
                              className="rounded-[0.7rem] border border-white/16 bg-white/[0.08] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:border-white/28 hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              {userSubmitting ? "Creating…" : "Create"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setUserFormOpenId(null)}
                              className="rounded-[0.7rem] border border-white/12 px-3 py-1.5 text-xs uppercase tracking-[0.16em] text-white/64 transition hover:text-white"
                            >
                              Close
                            </button>
                          </div>
                          {userMessage ? (
                            <p
                              className={`md:col-span-4 text-xs ${userMessage.tone === "ok" ? "text-emerald-300/85" : "text-rose-300/85"}`}
                            >
                              {userMessage.text}
                            </p>
                          ) : (
                            <p className="md:col-span-4 text-[0.66rem] text-white/40">
                              Creates a partner-role login linked to this org. Share the password securely — it cannot be retrieved later.
                            </p>
                          )}
                        </form>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

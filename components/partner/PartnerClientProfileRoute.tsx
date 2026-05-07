import Link from "next/link";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import type { AdminLead } from "@/lib/admin-types";

function toCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSignedAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-ZA");
}

function detailRows(lead: AdminLead) {
  return [
    ["Primary contact", lead.userProfile.fullName || lead.contactName],
    ["Contact position", lead.contactPosition || lead.userProfile.role || "Not captured"],
    ["Email", lead.userProfile.email || "Not captured"],
    ["Phone", lead.userProfile.phone || "Not captured"],
    ["Registration number", lead.businessRegistrationNumber || "Not captured"],
    ["Industry", lead.industry || "Not captured"],
    ["Address", [lead.physicalAddress, lead.city, lead.province].filter(Boolean).join(", ")],
    ["Monthly electricity spend", toCurrency(lead.monthlyElectricitySpendEstimateZar)],
    ["Business registered", lead.isBusinessRegistered ? "Yes" : "No"],
    ["Business operational", lead.isBusinessOperational ? "Yes" : "No"],
    ["6-month utility bill", lead.hasSixMonthUtilityBill ? "Yes" : "No"],
  ];
}

export function PartnerClientProfileRoute({ lead }: { lead: AdminLead }) {
  const eoiSigningPath = lead.eoiSigningToken ? `/eoi/${lead.eoiSigningToken}` : null;
  const signedAt = formatSignedAt(lead.eoiSignedAt);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 py-6">
      <section className="app-surface rounded-[1.6rem] px-5 py-5 lg:px-6 lg:py-6">
        <AdminHeader
          eyebrow="Partner Client Profile"
          title={`${lead.company} • ${lead.clientProfileId}`}
          description="Read-only client profile for the business registered through your partner channel."
          actions={
            <Link
              href="/partner/clients"
              className="rounded-[0.8rem] border border-white/16 px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/78 transition hover:border-white/26 hover:text-white"
            >
              Back to Clients
            </Link>
          }
        />
      </section>

      <section className="app-surface rounded-[1.4rem] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="line-label">Profile Overview</p>
            <h2 className="mt-2 text-2xl font-medium tracking-[-0.04em] text-white">
              {lead.company}
            </h2>
            <p className="mt-1 text-sm text-white/52">
              {lead.userProfile.fullName || lead.contactName} • Profile No: {lead.clientProfileId}
            </p>
            {lead.registrationSource ? (
              <p className="mt-1 text-xs text-white/42">
                Registered via {lead.registrationSource.profileName}&apos;s unique {lead.registrationSource.profileRole} link{" "}
                ({lead.registrationSource.channel === "public_link" ? "client-submitted" : "dashboard"})
              </p>
            ) : null}
            <p className="mt-1 text-xs text-white/42">Last touched: {lead.lastTouched}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AdminBadge label={lead.stage} />
            <AdminBadge label={lead.priority} tone={lead.priority === "Standard" ? "muted" : "neutral"} />
            {lead.disqualification ? <AdminBadge label="Disqualified" tone="bright" /> : null}
            {lead.userProfile.email ? (
              <Link
                href={`/partner/inbox?lead=${encodeURIComponent(lead.id)}&to=${encodeURIComponent(lead.userProfile.email)}&subject=${encodeURIComponent(`Foundation-1 — ${lead.company}`)}`}
                className="rounded-[0.7rem] border border-white/16 px-2.5 py-1.5 text-[0.64rem] uppercase tracking-[0.2em] text-white/82 transition hover:border-white/30 hover:text-white"
              >
                Email client
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="app-surface rounded-[1.4rem] p-4">
          <p className="line-label">Business Details</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {detailRows(lead).map(([label, value]) => (
              <div key={label} className="rounded-[0.85rem] border border-white/10 bg-black/25 px-3 py-2">
                <dt className="text-[0.62rem] uppercase tracking-[0.2em] text-white/42">{label}</dt>
                <dd className="mt-1 text-sm text-white/72">{value || "Not captured"}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="app-surface rounded-[1.4rem] p-4">
          <p className="line-label">Onboarding Workflow</p>
          <div className="mt-3 rounded-[0.9rem] border border-white/10 bg-black/35 p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">
              Client EOI Signing Link
            </p>
            <p className="mt-2 break-all text-sm text-white/70">
              {eoiSigningPath ?? "EOI signing link has not been generated yet."}
            </p>
            {eoiSigningPath ? (
              <Link
                href={eoiSigningPath}
                target="_blank"
                className="mt-3 inline-flex rounded-[0.7rem] border border-white/14 px-2.5 py-1.5 text-[0.64rem] uppercase tracking-[0.18em] text-white/76 transition hover:border-white/26 hover:text-white"
              >
                Open Signing Page
              </Link>
            ) : null}
            <p className="mt-3 text-xs text-white/48">
              {lead.eoiSignedAt
                ? `Signed by ${lead.eoiSignedBy ?? "Client"}${signedAt ? ` • ${signedAt}` : ""}`
                : "Awaiting client digital signature and terms acceptance."}
            </p>
          </div>
          <div className="mt-3 rounded-[0.9rem] border border-white/10 bg-black/30 p-3">
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">Next Action</p>
            <p className="mt-2 text-sm leading-6 text-white/68">{lead.nextAction || "No next action captured."}</p>
          </div>
        </div>
      </section>

      <section className="app-surface rounded-[1.4rem] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="line-label">Client File Vault</p>
          <AdminBadge label={`${lead.documents.length} Documents`} tone="muted" />
        </div>
        <p className="mt-2 text-sm text-white/60">
          Files attached to client profile {lead.clientProfileId}. Downloads are scoped to your partner organisation.
        </p>
        <div className="mt-3 overflow-auto rounded-[0.8rem] border border-white/10">
          <table className="w-full min-w-[940px] text-left">
            <thead className="bg-black/70">
              <tr className="text-[0.64rem] uppercase tracking-[0.18em] text-white/50">
                <th className="px-3 py-2">Document</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Uploaded By</th>
                <th className="px-3 py-2">Uploader Type</th>
                <th className="px-3 py-2">Uploaded At</th>
                <th className="px-3 py-2">Download</th>
              </tr>
            </thead>
            <tbody>
              {lead.documents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-sm text-white/54">
                    No documents have been attached to this client profile yet.
                  </td>
                </tr>
              ) : (
                lead.documents.map((doc) => (
                  <tr key={doc.id} className="border-t border-white/8 bg-black/35 text-sm">
                    <td className="px-3 py-2 text-white/74">
                      {doc.title} <span className="text-xs text-white/42">({doc.fileType})</span>
                      <span className="block text-xs text-white/38">{doc.category}</span>
                    </td>
                    <td className="px-3 py-2 text-white/64">{doc.status}</td>
                    <td className="px-3 py-2 text-white/64">{doc.uploadedBy}</td>
                    <td className="px-3 py-2 text-white/64">{doc.uploadedByType}</td>
                    <td className="px-3 py-2 text-white/52">{doc.uploadedAt}</td>
                    <td className="px-3 py-2">
                      {doc.storagePath ? (
                        <Link
                          href={`/api/admin/leads/${encodeURIComponent(lead.id)}/documents?documentId=${encodeURIComponent(doc.id)}`}
                          className="rounded-[0.65rem] border border-white/12 px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.16em] text-white/72 transition hover:border-white/26 hover:text-white"
                        >
                          Download
                        </Link>
                      ) : (
                        <span className="text-xs text-white/38">Metadata only</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="app-surface rounded-[1.4rem] p-4">
          <p className="line-label">Open Tasks</p>
          <div className="mt-3 flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
            {lead.tasks.length === 0 ? (
              <p className="text-sm text-white/56">No tasks captured for this client.</p>
            ) : (
              lead.tasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-[0.8rem] border border-white/10 bg-black/35 px-3 py-2 text-sm text-white/72"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={task.status === "done" ? "line-through text-white/38" : ""}>{task.title}</span>
                    <span className="text-[0.62rem] uppercase tracking-[0.16em] text-white/42">{task.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-white/42">{task.owner} • {task.dueLabel}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="app-surface rounded-[1.4rem] p-4">
          <p className="line-label">Recent Activity</p>
          <div className="mt-3 flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
            {lead.events.length === 0 ? (
              <p className="text-sm text-white/56">No activity captured for this client.</p>
            ) : (
              lead.events.slice(0, 8).map((event) => (
                <div key={event.id} className="rounded-[0.8rem] border border-white/10 bg-black/35 px-3 py-2">
                  <p className="text-sm text-white/76">{event.title}</p>
                  <p className="mt-1 text-xs leading-5 text-white/46">{event.detail}</p>
                  <p className="mt-1 text-[0.6rem] uppercase tracking-[0.16em] text-white/34">{event.createdAt}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
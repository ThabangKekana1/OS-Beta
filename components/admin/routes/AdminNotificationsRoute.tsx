"use client";

import { useMemo } from "react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { LiveNotificationsPanel } from "@/components/admin/LiveNotificationsPanel";

function isDocumentExchangeEvent(title: string) {
  return /(eoi|utility|proposal|term sheet|document)/i.test(title) &&
    /(issued|uploaded|submitted|signed|downloaded|generated)/i.test(title);
}

export function AdminNotificationsRoute() {
  const { leads, salesLeads } = useAdminPortal();

  const notifications = useMemo(
    () =>
      leads
        .flatMap((lead) =>
          lead.events
            .filter((event) => isDocumentExchangeEvent(event.title))
            .map((event) => ({
              notificationId: `${lead.id}-${event.id}`,
              company: lead.company,
              stage: lead.stage,
              ...event,
            })),
        )
        .slice(0, 120),
    [leads],
  );

  const partnerActivity = useMemo(() => {
    const submissions = salesLeads
      .filter((lead) => lead.createdByRole === "partner")
      .map((lead) => ({
        id: `partner-sub-${lead.id}`,
        title: lead.ownerId
          ? `Partner referral assigned: ${lead.contactName}`
          : `New partner referral: ${lead.contactName}`,
        detail: `${lead.company} • Stage: ${lead.qualificationStage}`,
        createdAt: new Date(lead.createdAt).toLocaleString(),
        rawTime: lead.createdAt,
      }));

    const handovers = leads
      .filter((lead) => Boolean(lead.partnerOrgId))
      .flatMap((lead) =>
        lead.events
          .filter((event) => /handover|qualified/i.test(event.title))
          .map((event) => ({
            id: `partner-handover-${lead.id}-${event.id}`,
            title: `Partner lead handed over: ${lead.company}`,
            detail: event.detail,
            createdAt: event.createdAt,
            rawTime: event.createdAt,
          })),
      );

    return [...submissions, ...handovers]
      .sort((a, b) => (a.rawTime < b.rawTime ? 1 : -1))
      .slice(0, 80);
  }, [leads, salesLeads]);

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="Notifications"
        title="Document exchange activity"
        description="Admin and sales notifications for onboarding document exchanges only."
        actions={<AdminBadge label={`${notifications.length} Notifications`} tone="bright" />}
      />

      <LiveNotificationsPanel />

      <section className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
        <div className="space-y-2">
          {notifications.map((notification) => (
            <article
              key={notification.notificationId}
              className="rounded-xl border border-white/10 bg-black/25 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-white">{notification.title}</p>
                <span className="text-xs text-white/56">{notification.createdAt}</span>
              </div>
              <p className="mt-1 text-xs text-white/52">
                {notification.company} • {notification.stage}
              </p>
              <p className="mt-2 text-sm text-white/72">{notification.detail}</p>
            </article>
          ))}

          {notifications.length === 0 ? (
            <p className="rounded-xl border border-white/8 bg-black/20 p-4 text-sm text-white/58">
              No document exchange notifications yet.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <p className="line-label">Partner channel</p>
            <h2 className="mt-1 text-base font-medium text-white">
              Partner activity
            </h2>
          </div>
          <AdminBadge label={`${partnerActivity.length} Events`} tone="muted" />
        </header>
        <div className="space-y-2">
          {partnerActivity.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-white/10 bg-black/25 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-white">{item.title}</p>
                <span className="text-xs text-white/56">{item.createdAt}</span>
              </div>
              <p className="mt-2 text-sm text-white/72">{item.detail}</p>
            </article>
          ))}
          {partnerActivity.length === 0 ? (
            <p className="rounded-xl border border-white/8 bg-black/20 p-4 text-sm text-white/58">
              No partner activity yet.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

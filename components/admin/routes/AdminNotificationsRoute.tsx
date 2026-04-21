"use client";

import { useMemo } from "react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";

function isDocumentExchangeEvent(title: string) {
  return /(eoi|utility|proposal|term sheet|document)/i.test(title) &&
    /(issued|uploaded|submitted|signed|downloaded|generated)/i.test(title);
}

export function AdminNotificationsRoute() {
  const { leads } = useAdminPortal();

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

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="Notifications"
        title="Document exchange activity"
        description="Admin and sales notifications for onboarding document exchanges only."
        actions={<AdminBadge label={`${notifications.length} Notifications`} tone="bright" />}
      />

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
    </div>
  );
}

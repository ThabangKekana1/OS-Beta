import { requireServerAuthSession } from "@/lib/auth-server";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";

type Notification = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  tone: "system" | "agent" | "client";
  company: string;
};

export default async function PartnerNotificationsPage() {
  const session = await requireServerAuthSession("partner");

  if (!session.partnerOrgId) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <div className="rounded-[1.6rem] border border-amber-400/30 bg-amber-400/5 p-6">
          <h1 className="text-lg font-medium tracking-[-0.02em] text-white">
            Account not linked
          </h1>
        </div>
      </div>
    );
  }

  const { snapshot } = await readAdminStateSnapshot();

  // 1. Events from converted admin leads (post-handover).
  const adminLeadNotifications: Notification[] = snapshot.leads
    .filter((lead) => lead.partnerOrgId === session.partnerOrgId)
    .flatMap((lead) =>
      lead.events.map((event) => ({
        id: `${lead.id}-${event.id}`,
        title: event.title,
        detail: event.detail,
        createdAt: event.createdAt,
        tone: event.tone,
        company: lead.company,
      })),
    );

  // 2. Per-sales-lead milestones (submitted + latest stage).
  const salesLeadNotifications: Notification[] = snapshot.salesLeads
    .filter((lead) => lead.partnerOrgId === session.partnerOrgId)
    .flatMap((lead) => {
      const items: Notification[] = [
        {
          id: `${lead.id}-submitted`,
          title: "Lead submitted",
          detail: `${lead.contactName} (${lead.email}) was added to the queue.`,
          createdAt: new Date(lead.createdAt).toLocaleString(),
          tone: "system",
          company: lead.company,
        },
      ];
      if (lead.qualificationStage !== "Havent Contacted") {
        items.push({
          id: `${lead.id}-stage`,
          title: `Stage: ${lead.qualificationStage}`,
          detail:
            lead.qualificationReason ??
            `Latest qualification status from sales.`,
          createdAt: new Date(lead.lastUpdatedAt).toLocaleString(),
          tone: "agent",
          company: lead.company,
        });
      }
      return items;
    });

  const notifications = [...adminLeadNotifications, ...salesLeadNotifications]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 120);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 py-6">
      <header>
        <p className="line-label">Partner</p>
        <h1 className="mt-1 text-2xl font-medium tracking-[-0.03em] text-white">
          Notifications
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/58">
          Status updates on the leads you&apos;ve referred.
        </p>
      </header>

      <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-col gap-2">
          {notifications.length === 0 ? (
            <p className="rounded-xl border border-white/8 bg-black/20 p-4 text-sm text-white/58">
              No notifications yet.
            </p>
          ) : (
            notifications.map((n) => (
              <article
                key={n.id}
                className="rounded-xl border border-white/10 bg-black/25 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">{n.title}</p>
                  <span className="text-xs text-white/56">{n.createdAt}</span>
                </div>
                <p className="mt-1 text-xs text-white/52">{n.company}</p>
                <p className="mt-2 text-sm text-white/72">{n.detail}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

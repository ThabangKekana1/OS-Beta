import { LiveNotificationsPanel } from "@/components/admin/LiveNotificationsPanel";
import { requireServerAuthSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  await requireServerAuthSession("admin");

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-1">
        <p className="line-label">Notifications</p>
        <h1 className="text-2xl font-medium tracking-[-0.03em] text-white">Activity feed</h1>
        <p className="max-w-2xl text-sm text-white/58">
          Real-time alerts for client replies, new leads, registrations, signed EOIs, and customer document uploads.
          Mark items read to keep the feed clean.
        </p>
      </header>
      <LiveNotificationsPanel />
    </div>
  );
}

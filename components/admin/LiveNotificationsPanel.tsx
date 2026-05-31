"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, BellRing, CheckCheck, Mail } from "lucide-react";
import { AdminBadge } from "@/components/admin/AdminPrimitives";
import type { NotificationRecord } from "@/lib/notifications";

const KIND_LABEL: Record<string, string> = {
  eoi_signed: "EOI signed",
  customer_uploaded_document: "Customer upload",
  admin_uploaded_document: "Admin upload",
  email_reply: "Email reply",
  new_lead: "New lead",
  client_registered: "Registration",
  system: "System",
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function LiveNotificationsPanel() {
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const res = await fetch("/api/notifications", { cache: "no-store" });
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const json = (await res.json()) as { notifications: NotificationRecord[] };
    setItems(json.notifications ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const t = setInterval(() => void refresh(), 30_000);
    return () => {
      clearTimeout(initial);
      clearInterval(t);
    };
  }, [refresh]);

  const unreadIds = items.filter((n) => !n.readAt).map((n) => n.id);
  const unreadCount = unreadIds.length;

  function markAllRead() {
    if (unreadIds.length === 0) return;
    startTransition(async () => {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unreadIds }),
      });
      await refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="line-label">Live alerts</p>
          <h2 className="mt-1 flex items-center gap-2 text-base font-medium text-white">
            {unreadCount > 0 ? (
              <BellRing className="size-4 text-amber-300" />
            ) : (
              <Bell className="size-4 text-white/64" />
            )}
            Real-time notifications
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <AdminBadge
            label={unreadCount > 0 ? `${unreadCount} Unread` : `${items.length} Total`}
            tone={unreadCount > 0 ? "bright" : "muted"}
          />
          <button
            type="button"
            onClick={markAllRead}
            disabled={pending || unreadCount === 0}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/14 bg-white/[0.04] px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.18em] text-white/82 transition hover:border-white/24 hover:bg-white/[0.06] disabled:opacity-40"
          >
            <CheckCheck className="size-3" />
            {pending ? "Marking…" : "Mark all read"}
          </button>
        </div>
      </header>

      <div className="space-y-2">
        {loading ? (
          <p className="rounded-xl border border-white/8 bg-black/20 p-4 text-sm text-white/58">
            Loading…
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-white/8 bg-black/20 p-4 text-sm text-white/58">
            No notifications yet. Signed EOIs, customer uploads, and admin uploads will appear here in real time.
          </p>
        ) : (
          items.map((n) => {
            const body = (
              <article
                className={`rounded-xl border p-3 transition ${
                  n.readAt
                    ? "border-white/10 bg-black/20"
                    : "border-amber-300/24 bg-amber-300/[0.04]"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.18em] text-white/68">
                      {KIND_LABEL[n.kind] ?? n.kind}
                    </span>
                    <p className="text-sm font-medium text-white">{n.title}</p>
                  </div>
                  <span className="flex items-center gap-2 text-xs text-white/56">
                    {n.emailedAt ? <Mail className="size-3 text-emerald-300" /> : null}
                    {formatTime(n.createdAt)}
                  </span>
                </div>
                {n.body ? <p className="mt-2 text-sm text-white/72">{n.body}</p> : null}
              </article>
            );
            return n.link ? (
              <Link key={n.id} href={n.link} className="block">
                {body}
              </Link>
            ) : (
              <div key={n.id}>{body}</div>
            );
          })
        )}
      </div>
    </section>
  );
}

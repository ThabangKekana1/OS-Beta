"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bell,
  ClipboardList,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { BrandMarkOneOS } from "@/components/sidebar/BrandMarkOneOS";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { cn } from "@/lib/utils";

type NotificationSummary = {
  unreadInboxCount: number;
  unreadNotificationCount: number;
};

function navItemsFor(rootPath: "/admin" | "/sales", showSales: boolean) {
  return [
  {
    id: "leads",
    label: "Leads",
    href: `${rootPath}/leads`,
    icon: ClipboardList,
  },
  ...(showSales
    ? [
        {
          id: "sales",
          label: "Sales",
          href: "/admin/sales",
          icon: Activity,
        },
        {
          id: "activity",
          label: "Activity",
          href: "/admin/activity",
          icon: BarChart3,
        },
      ]
    : []),
  {
    id: "inbox",
    label: "Inbox",
    href: `${rootPath}/inbox`,
    icon: Mail,
  },
  ...(rootPath === "/admin"
    ? [
        {
          id: "notifications",
          label: "Notifications",
          href: "/admin/notifications",
          icon: Bell,
        },
      ]
    : []),
  ] as const;
}

const SIDEBAR_STORAGE_KEY = "oneos:admin-sidebar";

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function hasValidLeadEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function AdminSidebar({
  mobile = false,
  rootPath = "/admin",
  portalRole = "admin",
  showSales = true,
}: {
  mobile?: boolean;
  rootPath?: "/admin" | "/sales";
  portalRole?: "admin" | "sales";
  showSales?: boolean;
}) {
  const pathname = usePathname();
  const { leads } = useAdminPortal();
  const navItems = navItemsFor(rootPath, showSales);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined" || mobile) return false;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "collapsed";
  });
  const [summary, setSummary] = useState<NotificationSummary>({
    unreadInboxCount: 0,
    unreadNotificationCount: 0,
  });

  useEffect(() => {
    if (mobile) return;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
    document.documentElement.dataset.adminSidebar = collapsed ? "collapsed" : "expanded";
  }, [collapsed, mobile]);

  useEffect(() => {
    let cancelled = false;

    async function refreshSummary() {
      try {
        const res = await fetch("/api/notifications/summary", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as Partial<NotificationSummary>;
        if (!cancelled) {
          setSummary({
            unreadInboxCount: Number(json.unreadInboxCount ?? 0),
            unreadNotificationCount: Number(json.unreadNotificationCount ?? 0),
          });
        }
      } catch {
        // Keep sidebar rendering even if notification polling fails.
      }
    }

    void refreshSummary();
    const interval = setInterval(() => void refreshSummary(), 30_000);
    const handleRefresh = () => void refreshSummary();
    window.addEventListener("oneos:notifications-changed", handleRefresh);
    window.addEventListener("focus", handleRefresh);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("oneos:notifications-changed", handleRefresh);
      window.removeEventListener("focus", handleRefresh);
    };
  }, []);

  const emailLeads = leads.filter((lead) => hasValidLeadEmail(lead.userProfile.email));
  const openLeads = emailLeads.filter(
    (lead) => !["Onboarding Complete", "Disqualified"].includes(lead.stage),
  ).length;
  const highPriority = emailLeads.filter((lead) => lead.priority !== "Standard").length;

  return (
    <aside className={mobile ? "block" : "hidden lg:block"}>
      <div className={cn(
        "flex flex-col gap-5 overflow-y-auto rounded-[2rem] border border-white/10 bg-black p-4 shadow-[0_30px_90px_rgba(0,0,0,0.5)]",
        mobile ? "max-h-[calc(100vh-5rem)]" : "sticky top-4 h-[calc(100vh-2rem)]",
      )}>
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-1 pb-4 pt-2">
          <div className={cn(collapsed && !mobile ? "hidden" : "block")}>
            <BrandMarkOneOS />
          </div>
          {!mobile ? (
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className="inline-flex size-9 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-white/70 transition hover:border-white/24 hover:text-white"
              aria-label={collapsed ? "Maximise sidebar" : "Minimise sidebar"}
              title={collapsed ? "Maximise sidebar" : "Minimise sidebar"}
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          ) : null}
        </div>

        <div className={cn("rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-4", collapsed && !mobile ? "hidden" : "block")}>
          <p className="line-label">{portalRole === "sales" ? "Sales Portal" : "Admin Portal"}</p>
          <h2 className="mt-2 text-lg font-medium tracking-[-0.03em] text-white">
            Lead Desk
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/56">
            One lead lifecycle from outreach through onboarding and client handover.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/14 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.22em] text-white/58">
              {openLeads} Open
            </span>
            <span className="rounded-full border border-white/14 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.22em] text-white/58">
              {highPriority} Priority
            </span>
          </div>
        </div>

        <nav className="flex flex-col gap-1.5">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            const badgeCount =
              item.id === "notifications"
                ? summary.unreadNotificationCount
                : item.id === "inbox"
                  ? summary.unreadInboxCount
                  : 0;
            const showBadge = badgeCount > 0;

            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-[0.95rem] border px-3 py-2.5 transition-all duration-200",
                  active
                    ? "border-white/20 bg-white/[0.06] text-white"
                    : "border-transparent bg-transparent text-white/62 hover:border-white/12 hover:bg-white/[0.03] hover:text-white/92",
                )}
                title={item.label}
              >
                <span
                  className={cn(
                    "relative flex size-8 items-center justify-center rounded-full border transition-colors",
                    active
                      ? "border-white/20 bg-white/[0.05]"
                      : "border-white/8 bg-white/[0.02] group-hover:border-white/16",
                  )}
                >
                  <Icon className="size-4" />
                  {showBadge && collapsed && !mobile ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full border border-black bg-amber-300 px-1 text-[0.6rem] font-semibold leading-none text-black">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  ) : null}
                </span>
                <span className={cn("flex flex-1 items-center justify-between gap-2 text-sm", collapsed && !mobile ? "sr-only" : "")}>
                  <span>{item.label}</span>
                  {showBadge ? (
                    <span className="rounded-full border border-amber-300/30 bg-amber-300/[0.08] px-2 py-0.5 text-[0.62rem] font-medium text-amber-100">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className={cn("mt-auto rounded-[1.2rem] border border-white/10 bg-white/[0.02] p-4", collapsed && !mobile ? "hidden" : "block")}>
          <p className="line-label">Session</p>
          <p className="mt-2 text-sm leading-6 text-white/58">
            {portalRole === "sales"
              ? "Sales session active. Your workspace is scoped to your own lead book and inbox."
              : "Internal admin session active. This portal is isolated from the migration client workspace and built for internal sales operations."}
          </p>
          <div className="mt-4">
            <SignOutButton />
          </div>
        </div>
      </div>
    </aside>
  );
}

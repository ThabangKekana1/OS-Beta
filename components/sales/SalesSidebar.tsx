"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChartNoAxesColumnIncreasing,
  ClipboardList,
  FolderDown,
  Settings2,
  UserPlus2,
  Users,
} from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { BrandMarkOneOS } from "@/components/sidebar/BrandMarkOneOS";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import { cn } from "@/lib/utils";

const navItems = [
  {
    id: "overview",
    label: "Overview",
    href: "/sales",
    icon: ChartNoAxesColumnIncreasing,
  },
  {
    id: "leads",
    label: "My Leads",
    href: "/sales/leads",
    icon: ClipboardList,
  },
  {
    id: "registration",
    label: "Register Client",
    href: "/sales/registration",
    icon: UserPlus2,
  },
  {
    id: "clients",
    label: "Clients",
    href: "/sales/clients",
    icon: Users,
  },
  {
    id: "notifications",
    label: "Notifications",
    href: "/sales/notifications",
    icon: Bell,
  },
  {
    id: "resources",
    label: "Resources",
    href: "/sales/resources",
    icon: FolderDown,
  },
  {
    id: "settings",
    label: "Settings",
    href: "/sales/settings",
    icon: Settings2,
  },
] as const;

export function SalesSidebar({
  profileName,
  agentId,
}: {
  profileName: string;
  agentId: string | null;
}) {
  const pathname = usePathname();
  const { leads, salesLeads } = useAdminPortal();
  const visibleClients = agentId
    ? leads.filter((lead) => lead.ownerId === agentId)
    : leads;
  const visibleSalesLeads = agentId
    ? salesLeads.filter((lead) => lead.ownerId === agentId)
    : salesLeads;
  const openClients = visibleClients.filter(
    (lead) => !["Onboarding Complete", "Disqualified"].includes(lead.stage),
  ).length;

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col gap-5 overflow-y-auto rounded-[2rem] border border-white/10 bg-black p-4 shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
        <div className="border-b border-white/10 px-1 pb-4 pt-2">
          <BrandMarkOneOS />
        </div>

        <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-4">
          <p className="line-label">Sales Workspace</p>
          <h2 className="mt-2 text-lg font-medium tracking-[-0.03em] text-white">{profileName}</h2>
          <p className="mt-2 text-sm leading-6 text-white/56">
            Dedicated sales workspace for lead qualification and client onboarding.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/14 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.22em] text-white/58">
              {visibleSalesLeads.length} Leads
            </span>
            <span className="rounded-full border border-white/14 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.22em] text-white/58">
              {openClients} Active Clients
            </span>
          </div>
        </div>

        <nav className="flex flex-col gap-1.5">
          {navItems.map((item) => {
            const active = item.href === "/sales"
              ? pathname === "/sales"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

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
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border transition-colors",
                    active
                      ? "border-white/20 bg-white/[0.05]"
                      : "border-white/8 bg-white/[0.02] group-hover:border-white/16",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-[1.2rem] border border-white/10 bg-white/[0.02] p-4">
          <p className="line-label">Session</p>
          <p className="mt-2 text-sm leading-6 text-white/58">
            Signed in as {profileName}. Admin routes are isolated from this profile.
          </p>
          <div className="mt-4">
            <SignOutButton />
          </div>
        </div>
      </div>
    </aside>
  );
}

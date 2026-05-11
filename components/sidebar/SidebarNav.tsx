"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, FileText, House, Inbox, LifeBuoy, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const iconMap = {
  home: House,
  inbox: Inbox,
  notifications: Bell,
  documents: FileText,
  support: LifeBuoy,
  profile: UserCircle,
} as const;

type SidebarNavProps = {
  items: Array<{
    id: string;
    label: string;
    href: string;
    icon: keyof typeof iconMap;
    unreadCount?: number;
  }>;
};

export function SidebarNav({ items }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1.5">
      {items.map((item) => {
        const Icon = iconMap[item.icon];
        const showUnread = typeof item.unreadCount === "number" && item.unreadCount > 0;
        const active =
          item.href === "/workspace"
            ? pathname === "/" || pathname === "/workspace"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.id}
            href={item.href}
            className={cn(
              "group flex items-center justify-between rounded-[0.95rem] border px-3 py-2.5 transition-all duration-200",
              active
                ? "border-white/20 bg-white/[0.06] text-white"
                : "border-transparent bg-transparent text-white/62 hover:border-white/12 hover:bg-white/[0.03] hover:text-white/92",
            )}
          >
            <span className="flex items-center gap-3">
              <span
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-full border transition-colors",
                  active
                    ? "border-white/20 bg-white/[0.05]"
                    : "border-white/8 bg-white/[0.02] group-hover:border-white/16",
                )}
              >
                <Icon className="size-4" />
                {showUnread ? (
                  <span className="absolute right-0.5 top-0.5 size-2.5 rounded-full border border-black bg-red-500" />
                ) : null}
              </span>
              <span className="text-sm">{item.label}</span>
            </span>
            {showUnread ? (
              <span className="rounded-full border border-white/12 bg-white/[0.05] px-2 py-0.5 text-[0.62rem] text-white/70">
                {item.unreadCount && item.unreadCount > 9 ? "9+" : item.unreadCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, FileText, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const iconMap = {
  home: House,
  documents: FileText,
  profile: UserCircle,
} as const;

type SidebarNavProps = {
  items: Array<{
    id: string;
    label: string;
    href: string;
    icon: keyof typeof iconMap;
  }>;
};

export function SidebarNav({ items }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1.5">
      {items.map((item) => {
        const Icon = iconMap[item.icon];
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
                  "flex size-8 items-center justify-center rounded-full border transition-colors",
                  active
                    ? "border-white/20 bg-white/[0.05]"
                    : "border-white/8 bg-white/[0.02] group-hover:border-white/16",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="text-sm">{item.label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

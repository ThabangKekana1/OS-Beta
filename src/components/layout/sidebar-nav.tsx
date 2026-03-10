"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  FileText,
  BarChart3,
  Settings,
  ListTodo,
  Building2,
  UserPlus,
  Zap,
  ClipboardList,
  AlertTriangle,
  MessageSquare,
  Wallet,
  BookOpen,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const adminNav: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: <LayoutDashboard size={18} /> },
  { label: "Pipeline", href: "/admin/pipeline", icon: <Zap size={18} /> },
  { label: "Businesses", href: "/admin/businesses", icon: <Building2 size={18} /> },
  { label: "Tasks", href: "/admin/tasks", icon: <ListTodo size={18} /> },
  { label: "Documents", href: "/admin/documents", icon: <FileText size={18} /> },
  { label: "Communications", href: "/admin/communications", icon: <MessageSquare size={18} /> },
  { label: "Analytics", href: "/admin/analytics", icon: <BarChart3 size={18} /> },
];

const superAdminNav: NavItem[] = [
  ...adminNav,
  { label: "Payments", href: "/super-admin/payments", icon: <Wallet size={18} /> },
  { label: "Users", href: "/super-admin/users", icon: <Users size={18} /> },
  { label: "Stage Config", href: "/super-admin/settings/stages", icon: <ClipboardList size={18} /> },
  { label: "Doc Config", href: "/super-admin/settings/documents", icon: <FileText size={18} /> },
  { label: "Stall Reasons", href: "/super-admin/settings/stall-reasons", icon: <AlertTriangle size={18} /> },
  { label: "Settings", href: "/super-admin/settings", icon: <Settings size={18} /> },
];

const salesNav: NavItem[] = [
  { label: "Dashboard", href: "/sales/dashboard", icon: <LayoutDashboard size={18} /> },
  { label: "Leads", href: "/sales/leads", icon: <UserPlus size={18} /> },
  { label: "My Businesses", href: "/sales/businesses", icon: <Building2 size={18} /> },
  { label: "Earnings", href: "/sales/earnings", icon: <Wallet size={18} /> },
  { label: "Resources", href: "/sales/resources", icon: <BookOpen size={18} /> },
];

const businessNav: NavItem[] = [
  { label: "Dashboard", href: "/business/dashboard", icon: <LayoutDashboard size={18} /> },
  { label: "Documents", href: "/business/documents", icon: <FileText size={18} /> },
  { label: "Resources", href: "/business/resources", icon: <BookOpen size={18} /> },
  { label: "Profile", href: "/business/profile", icon: <Building2 size={18} /> },
];

export function SidebarNav({ role }: { role: string }) {
  const pathname = usePathname();

  let items: NavItem[] = [];
  switch (role) {
    case "SUPER_ADMIN":
      items = superAdminNav;
      break;
    case "ADMINISTRATOR":
      items = adminNav;
      break;
    case "SALES_REPRESENTATIVE":
      items = salesNav;
      break;
    case "BUSINESS_USER":
      items = businessNav;
      break;
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-56 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center border-b border-border px-4">
        <Link href="/" className="flex items-center">
          <span className="font-centauri text-sm tracking-[0.22em]">OS-BETA</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 p-3">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <div className="rounded-md bg-accent/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Pilot Command Centre</p>
        </div>
      </div>
    </aside>
  );
}

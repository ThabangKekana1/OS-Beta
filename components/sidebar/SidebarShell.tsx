"use client";

import { useState } from "react";
import { Menu, PanelLeftClose } from "lucide-react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { cn } from "@/lib/utils";
import { BrandMarkOneOS } from "./BrandMarkOneOS";
import { SidebarNav } from "./SidebarNav";
import { SidebarRecentCases } from "./SidebarRecentCases";
import { SidebarUtilityCard } from "./SidebarUtilityCard";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

function SidebarContent() {
  const navItems = [
    { id: "home", label: "Home", href: "/workspace", icon: "home" as const },
    { id: "documents", label: "Documents", href: "/documents", icon: "documents" as const },
    { id: "support", label: "Support", href: "/support", icon: "support" as const },
    { id: "profile", label: "Profile", href: "/settings", icon: "profile" as const },
  ];

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto rounded-[2rem] border border-white/10 bg-black p-4 shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
      <div className="border-b border-white/10 px-1 pb-4 pt-2">
        <BrandMarkOneOS />
      </div>
      <WorkspaceSwitcher />
      <SidebarNav items={navItems} />
      <SidebarRecentCases />
      <div className="mt-auto space-y-4">
        <SidebarUtilityCard />
        <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.02] p-4">
          <p className="line-label">Session</p>
          <p className="mt-2 text-sm leading-6 text-white/58">
            Sign out of the Dawn workspace and return to the main login screen.
          </p>
          <div className="mt-4">
            <SignOutButton />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SidebarShell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/95 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between">
          <BrandMarkOneOS />
          <button
            type="button"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            className="flex size-11 items-center justify-center rounded-full border border-white/14 bg-white/[0.03] text-white"
            onClick={() => setMobileOpen((current) => !current)}
          >
            {mobileOpen ? <PanelLeftClose className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity duration-200 lg:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileOpen(false)}
      />

      <aside
        data-testid="workspace-sidebar"
        className={cn(
          "fixed bottom-4 left-4 top-[4.5rem] z-50 w-[19rem] transition-transform duration-200 lg:top-4",
          mobileOpen ? "translate-x-0" : "-translate-x-[120%] lg:translate-x-0",
        )}
      >
        <SidebarContent />
      </aside>
    </>
  );
}

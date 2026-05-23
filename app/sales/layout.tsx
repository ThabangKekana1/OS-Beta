import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BrandMarkOneOS } from "@/components/sidebar/BrandMarkOneOS";
import { AdminPortalProvider } from "@/components/admin/AdminPortalProvider";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminThemeShell } from "@/components/admin/AdminThemeShell";
import { SaveStatusBanner } from "@/components/admin/SaveStatusBanner";
import { MobileSidebarToggle } from "@/components/MobileSidebarToggle";
import { requireServerAuthSession } from "@/lib/auth-server";

export const metadata: Metadata = {
  title: "1OS Sales | Leads",
  description: "Scoped 1OS sales lead workspace for outreach and qualification.",
};

export default async function SalesLayout({ children }: { children: ReactNode }) {
  const session = await requireServerAuthSession("sales");

  return (
    <AdminPortalProvider
      actorRole="sales"
      actorEmail={session.email}
      actorName={session.name}
      actorAgentId={session.agentId}
      includeSalesLeads={false}
      includeRegistrationDrafts={false}
      leadOwnerScopeId={session.agentId}
    >
      <AdminThemeShell>
        <div className="admin-layout-grid min-h-screen bg-[var(--black)] text-[var(--ink)] lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-4 lg:px-4 lg:py-4">
          <div className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/95 px-4 py-3 backdrop-blur-xl lg:hidden">
            <div className="flex items-center justify-between">
              <BrandMarkOneOS />
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-white/12 px-3 py-1 text-[0.62rem] uppercase tracking-[0.22em] text-white/58">
                  Sales
                </span>
                <MobileSidebarToggle>
                  <AdminSidebar mobile rootPath="/sales" portalRole="sales" showSales={false} />
                </MobileSidebarToggle>
              </div>
            </div>
          </div>

          <AdminSidebar rootPath="/sales" portalRole="sales" showSales={false} />

          <main className="min-w-0 overflow-hidden px-4 pb-20 pt-20 lg:min-h-0 lg:px-2 lg:pb-20 lg:pt-0">
            {children}
          </main>
        </div>
      </AdminThemeShell>
      <SaveStatusBanner />
    </AdminPortalProvider>
  );
}

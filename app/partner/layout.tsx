import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BrandMarkOneOS } from "@/components/sidebar/BrandMarkOneOS";
import { PartnerSidebar } from "@/components/partner/PartnerSidebar";
import { MobileSidebarToggle } from "@/components/MobileSidebarToggle";
import { requireServerAuthSession } from "@/lib/auth-server";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";

export const metadata: Metadata = {
  title: "1OS Partner | Dashboard",
  description: "Partner workspace for submitting and tracking referred leads.",
};

export default async function PartnerLayout({ children }: { children: ReactNode }) {
  const session = await requireServerAuthSession("partner");

  let partnerOrgName: string | null = null;
  if (session.partnerOrgId) {
    const { snapshot } = await readAdminStateSnapshot();
    const org = (snapshot.partnerOrgs ?? []).find(
      (entry) => entry.id === session.partnerOrgId,
    );
    partnerOrgName = org?.name ?? null;
  }

  return (
    <div className="min-h-screen bg-[var(--black)] text-[var(--ink)] lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-4 lg:px-4 lg:py-4">
      <div className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/95 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between">
          <BrandMarkOneOS />
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-white/12 px-3 py-1 text-[0.62rem] uppercase tracking-[0.22em] text-white/58">
              Partner
            </span>
            <MobileSidebarToggle>
              <PartnerSidebar
                profileName={session.name}
                partnerOrgName={partnerOrgName}
              />
            </MobileSidebarToggle>
          </div>
        </div>
      </div>

      <PartnerSidebar profileName={session.name} partnerOrgName={partnerOrgName} />

      <main className="min-h-screen px-4 pb-6 pt-20 lg:min-h-0 lg:px-2 lg:pb-2 lg:pt-0">
        {children}
      </main>
    </div>
  );
}

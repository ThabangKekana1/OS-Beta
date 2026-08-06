import PartnerDashboard from "@/components/partner/PartnerDashboard";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { requireServerAuthSession } from "@/lib/auth-server";
import {
  calculatePartnerMissionMetrics,
  getPartnerOrganisationForSession,
  listPartnerMembersForSession,
  listPartnerRevenuesForSession,
  partnerCampaignUrl,
} from "@/lib/partner-distribution";

export const dynamic = "force-dynamic";

export default async function PartnerHomePage() {
  const session = await requireServerAuthSession("partner");
  const organisation = await getPartnerOrganisationForSession(session);
  const [members, revenues] = await Promise.all([
    listPartnerMembersForSession(session),
    listPartnerRevenuesForSession(session),
  ]);
  const metrics = calculatePartnerMissionMetrics(members, revenues);

  return (
    <main className="flex min-h-screen flex-col bg-[#060606] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#060606]/95 backdrop-blur">
        <div className="flex h-16 items-center justify-between gap-4 px-4 md:px-6">
          <span className="inline-flex flex-col items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/foundation-1-wordmark.png"
              alt="Foundation-1"
              width={163}
              height={9}
              className="h-[9px] w-[163px]"
            />
            <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-white/35">
              Partner portal
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-3">
            <span className="hidden min-w-0 flex-col items-end sm:flex">
              <span className="max-w-[34vw] truncate text-[12px] font-medium text-white/80">
                {organisation.name}
              </span>
              <span className="font-mono text-[8px] uppercase tracking-[0.13em] text-white/35">
                {organisation.referralCode}
              </span>
            </span>
            <SignOutButton className="inline-flex h-9 shrink-0 items-center rounded-[6px] border border-white/12 bg-white/[0.035] px-3 text-[11px] text-white/60 transition hover:text-white" />
          </span>
        </div>
      </header>

      <div className="flex-1 px-4 py-6 md:px-6 md:py-7">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
          {organisation.name}
        </p>
        <h1 className="mt-1.5 text-[26px] font-medium tracking-[-0.045em] md:text-[30px]">
          Your members.
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-white/50">
          Every member who starts an assessment through your link appears here, with the
          stage they have reached. Foundation-1 does the work; you can see the progress.
        </p>

        <div className="mt-7">
          <PartnerDashboard
            organisationName={organisation.name}
            referralCode={organisation.referralCode}
            campaignUrl={partnerCampaignUrl(organisation.referralCode)}
            members={members}
            metrics={metrics}
          />
        </div>
      </div>

      <footer className="border-t border-white/10 px-4 py-5 md:px-6">
        <div className="flex flex-col gap-2 font-mono text-[8px] uppercase tracking-[0.12em] text-white/28 md:flex-row md:items-center md:justify-between">
          <span>Foundation-1 (Pty) Ltd · partner portal</span>
          <span>sales@1os.foundation-1.co.za · 069 811 7112</span>
        </div>
      </footer>
    </main>
  );
}

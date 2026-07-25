import { SignOutButton } from "@/components/auth/SignOutButton";
import { requireServerAuthSession } from "@/lib/auth-server";
import {
  getPartnerOrganisationForSession,
  partnerCampaignUrl,
} from "@/lib/partner-distribution";

export default async function PartnerHomePage() {
  const session = await requireServerAuthSession("partner");
  const organisation = await getPartnerOrganisationForSession(session);
  const campaignUrl = partnerCampaignUrl(organisation.referralCode);

  return (
    <main className="min-h-screen bg-[#050505] px-6 py-8 text-white sm:px-10 lg:px-14">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-white/42">
              Foundation-1
            </p>
            <p className="mt-2 text-lg font-medium">Migration Leaders</p>
          </div>
          <SignOutButton className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/65" />
        </header>

        <section className="py-16 sm:py-24">
          <p className="text-sm text-lime-300">Partner access active</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-medium tracking-[-0.055em] sm:text-7xl">
            Welcome back.
          </h1>
          <p className="mt-5 max-w-2xl text-xl leading-8 text-white/58">
            You are leading the migration of your members.
          </p>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/12 bg-white/[0.03] p-7">
              <p className="text-xs uppercase tracking-[0.18em] text-white/42">
                Organisation
              </p>
              <p className="mt-3 text-2xl font-medium">
                {organisation.name}
              </p>
            </div>
            <div className="rounded-3xl border border-white/12 bg-white/[0.03] p-7">
              <p className="text-xs uppercase tracking-[0.18em] text-white/42">
                Campaign code
              </p>
              <p className="mt-3 font-mono text-2xl">
                {organisation.referralCode}
              </p>
              <a
                href={campaignUrl}
                className="mt-4 block break-all text-sm text-cyan-200/70 underline underline-offset-4"
              >
                {campaignUrl}
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

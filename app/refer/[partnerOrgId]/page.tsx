import { notFound } from "next/navigation";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { PublicReferralForm } from "@/components/partner/PublicReferralForm";

export default async function PublicReferralPage({
  params,
}: {
  params: Promise<{ partnerOrgId: string }>;
}) {
  const { partnerOrgId } = await params;
  const { snapshot } = await readAdminStateSnapshot();
  const org = (snapshot.partnerOrgs ?? []).find(
    (entry) => entry.id === partnerOrgId,
  );

  if (!org || org.status !== "Active") {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[var(--black)] text-[var(--ink)] px-4 py-12">
      <div className="mx-auto max-w-xl">
        <header className="text-center">
          <p className="line-label">Referred by</p>
          <h1 className="mt-2 text-3xl font-medium tracking-[-0.03em] text-white">
            {org.name}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/60">
            Tell us a bit about your business and the 1OS team will be in touch
            within one business day.
          </p>
        </header>

        <div className="mt-8">
          <PublicReferralForm partnerOrgId={org.id} />
        </div>

        <p className="mt-10 text-center text-[0.7rem] uppercase tracking-[0.22em] text-white/40">
          Powered by 1OS
        </p>
      </div>
    </div>
  );
}

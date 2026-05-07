import { notFound } from "next/navigation";
import { PartnerClientProfileRoute } from "@/components/partner/PartnerClientProfileRoute";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { requireServerAuthSession } from "@/lib/auth-server";
import { findPartnerClientLead } from "@/lib/partner-client-access";

export const dynamic = "force-dynamic";

export default async function PartnerClientProfilePage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const session = await requireServerAuthSession("partner");

  if (!session.partnerOrgId) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <div className="rounded-[1.6rem] border border-amber-400/30 bg-amber-400/5 p-6">
          <h1 className="text-lg font-medium tracking-[-0.02em] text-white">
            Account not linked
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/58">
            Your partner account is not yet linked to a partner organisation.
            Contact your account manager to complete activation.
          </p>
        </div>
      </div>
    );
  }

  const { profileId } = await params;
  const { snapshot } = await readAdminStateSnapshot();
  const lead = findPartnerClientLead(snapshot, session.partnerOrgId, profileId);

  if (!lead) {
    notFound();
  }

  return <PartnerClientProfileRoute lead={lead} />;
}
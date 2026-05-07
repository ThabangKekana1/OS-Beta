import { PartnerRegistrationRoute } from "@/components/partner/PartnerRegistrationRoute";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { ADMIN_AGENTS } from "@/lib/admin-mock-data";
import { requireServerAuthSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function PartnerRegistrationPage() {
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

  const { snapshot } = await readAdminStateSnapshot();
  const partnerOrg = (snapshot.partnerOrgs ?? []).find(
    (entry) => entry.id === session.partnerOrgId,
  );

  return (
    <div className="mx-auto max-w-6xl py-6">
      <PartnerRegistrationRoute
        defaultOwnerId={ADMIN_AGENTS[0]?.id ?? ""}
        partnerOrgName={partnerOrg?.name ?? null}
      />
    </div>
  );
}

import Link from "next/link";
import { requireServerAuthSession } from "@/lib/auth-server";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { PartnerLeadsTable } from "@/components/partner/PartnerLeadsTable";

export default async function PartnerLeadsPage() {
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
  const leads = snapshot.salesLeads
    .filter((lead) => lead.partnerOrgId === session.partnerOrgId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 py-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="line-label">Partner</p>
          <h1 className="mt-1 text-2xl font-medium tracking-[-0.03em] text-white">
            My Leads
          </h1>
        </div>
        <Link
          href="/partner/submit"
          className="rounded-full border border-white/20 bg-white/[0.06] px-4 py-2 text-sm text-white transition hover:bg-white/[0.1]"
        >
          + Submit Lead
        </Link>
      </header>

      <PartnerLeadsTable leads={leads} />
    </div>
  );
}

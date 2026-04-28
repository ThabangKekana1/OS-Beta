import { requireServerAuthSession } from "@/lib/auth-server";
import { PartnerSubmitLeadForm } from "@/components/partner/PartnerSubmitLeadForm";
import { PartnerBulkImport } from "@/components/partner/PartnerBulkImport";
import { PartnerReferralLinkCard } from "@/components/partner/PartnerReferralLinkCard";

export default async function PartnerSubmitPage() {
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-6">
      <header>
        <p className="line-label">Partner</p>
        <h1 className="mt-1 text-2xl font-medium tracking-[-0.03em] text-white">
          Submit leads
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/58">
          Refer business contacts one at a time, or upload a CSV for batch imports.
          The 1OS team will qualify and progress each lead on your behalf.
        </p>
      </header>

      <PartnerSubmitLeadForm />
      <PartnerBulkImport />
      <PartnerReferralLinkCard partnerOrgId={session.partnerOrgId} />
    </div>
  );
}

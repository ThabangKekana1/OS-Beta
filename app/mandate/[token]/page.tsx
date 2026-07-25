import type { Metadata } from "next";
import Link from "next/link";
import { MandateSigningForm } from "@/components/mandate/MandateSigningForm";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";

export const metadata: Metadata = {
  title: "1OS | Foundation-1 Mandate",
  description: "Sign the Foundation-1 mandate authorising submission of your funding file.",
};

export default async function MandateSigningPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { snapshot } = await readAdminStateSnapshot();
  const lead = snapshot.leads.find((entry) => entry.mandateSigningToken === token);

  if (!lead) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black p-6 text-white">
        <p className="text-[0.66rem] uppercase tracking-[0.26em] text-white/46">
          Foundation-1 Mandate
        </p>
        <h1 className="text-3xl font-medium tracking-[-0.04em]">
          Mandate link not found
        </h1>
        <p className="max-w-lg text-center text-sm leading-7 text-white/62">
          This mandate link is invalid or has been removed from the onboarding profile. Mandate
          links are issued after your Migration Proposal is accepted.
        </p>
        <Link
          href="/migration/dashboard"
          className="rounded-full border border-white/14 bg-white/[0.04] px-6 py-2.5 text-[0.66rem] uppercase tracking-[0.22em] text-white/72 transition hover:border-white/22 hover:bg-white/[0.08] hover:text-white"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black p-6 text-white">
      <MandateSigningForm
        token={token}
        initialLead={{
          clientProfileId: lead.clientProfileId,
          company: lead.company,
          businessRegistrationNumber: lead.businessRegistrationNumber,
          contactName: lead.contactName,
          stage: lead.stage,
          proposalAcceptedAt: lead.proposalAcceptedAt ?? null,
          mandateSignedBy: lead.mandateSignedBy ?? null,
          mandateSignedAt: lead.mandateSignedAt ?? null,
          isSigned: Boolean(lead.mandateSignedAt),
        }}
      />
      <Link
        href="/migration/dashboard"
        className="rounded-full border border-white/14 bg-white/[0.04] px-6 py-2.5 text-[0.66rem] uppercase tracking-[0.22em] text-white/72 transition hover:border-white/22 hover:bg-white/[0.08] hover:text-white"
      >
        Return to Dashboard
      </Link>
    </div>
  );
}

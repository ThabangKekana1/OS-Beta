import type { Metadata } from "next";
import Link from "next/link";
import { EoiSigningForm } from "@/components/eoi/EoiSigningForm";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";

export const metadata: Metadata = {
  title: "1OS | EOI Signing",
  description: "Digital signature page for your 1OS Expression of Interest.",
};

export default async function EoiSigningPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { snapshot } = await readAdminStateSnapshot();
  const lead = snapshot.leads.find((entry) => entry.eoiSigningToken === token);

  if (!lead) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black p-6 text-white">
        <p className="text-[0.66rem] uppercase tracking-[0.26em] text-white/46">
          Expression of Interest
        </p>
        <h1 className="text-3xl font-medium tracking-[-0.04em]">
          EOI link not found
        </h1>
        <p className="max-w-lg text-center text-sm leading-7 text-white/62">
          This signing link is invalid or has been removed from the onboarding profile.
        </p>
        <Link
          href="/"
          className="rounded-full border border-white/14 bg-white/[0.04] px-6 py-2.5 text-[0.66rem] uppercase tracking-[0.22em] text-white/72 transition hover:border-white/22 hover:bg-white/[0.08] hover:text-white"
        >
          Return to Workspace
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black p-6 text-white">
      <EoiSigningForm
        token={token}
        initialLead={{
          clientProfileId: lead.clientProfileId,
          company: lead.company,
          businessRegistrationNumber: lead.businessRegistrationNumber,
          contactName: lead.contactName,
          physicalAddress: lead.physicalAddress,
          userProfile: {
            phone: lead.userProfile.phone,
            role: lead.userProfile.role,
          },
          stage: lead.stage,
          eoiSignedBy: lead.eoiSignedBy,
          eoiSignedAt: lead.eoiSignedAt,
          isSigned: Boolean(lead.eoiSignedAt),
        }}
      />
      <Link
        href="/"
        className="rounded-full border border-white/14 bg-white/[0.04] px-6 py-2.5 text-[0.66rem] uppercase tracking-[0.22em] text-white/72 transition hover:border-white/22 hover:bg-white/[0.08] hover:text-white"
      >
        Return to Workspace
      </Link>
    </div>
  );
}

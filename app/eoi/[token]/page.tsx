import type { Metadata } from "next";
import Link from "next/link";
import { EoiSigningForm } from "@/components/eoi/EoiSigningForm";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { buildDevEoiPreviewLead, isDevEoiPreviewToken } from "@/lib/dev-migration-preview";
import { hasCompletedFoundationAssessment } from "@/lib/post-assessment-eoi";

export const metadata: Metadata = {
  title: "Sign Expression of Interest | Foundation-1",
  description: "Review and sign the non-binding Expression of Interest after the Foundation-1 assessment is complete.",
};

export default async function EoiSigningPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = isDevEoiPreviewToken(token);
  const lead = preview
    ? buildDevEoiPreviewLead()
    : (await readAdminStateSnapshot()).snapshot.leads.find((entry) => entry.eoiSigningToken === token);

  if (!lead) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black p-6 text-white">
        <p className="text-[0.66rem] uppercase tracking-[0.26em] text-white/46">
          Expression of Interest
        </p>
        <h1 className="text-3xl font-medium tracking-[-0.04em]">
          EOI link not found
        </h1>
        <p className="max-w-lg text-center text-sm leading-7 text-white/62">
          This secure EOI signing link is invalid or has been removed from the onboarding profile.
        </p>
        <Link
          href="/migration/dashboard"
          className="rounded-full border border-white/14 bg-white/[0.04] px-6 py-2.5 text-[0.66rem] uppercase tracking-[0.22em] text-white/72 transition hover:border-white/22 hover:bg-white/[0.08] hover:text-white"
        >
          Return to Workspace
        </Link>
      </main>
    );
  }

  if (!preview && !hasCompletedFoundationAssessment(lead as import("@/lib/admin-types").AdminLead)) {
    return (
      <main className="relative grid min-h-screen place-items-center overflow-hidden bg-black p-6 text-white">
        <div className="ambient-grid absolute inset-0" />
        <div className="relative max-w-xl rounded-[8px] border border-white/12 bg-[#080808] p-7 text-center shadow-[0_30px_100px_rgba(0,0,0,.45)] md:p-10">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-violet-200/65">Post-assessment gate</p>
          <h1 className="mt-5 text-4xl font-medium leading-[0.95] tracking-[-0.055em]">The EOI is not open yet.</h1>
          <p className="mt-5 text-sm leading-7 text-white/48">The non-binding Expression of Interest follows the completed bill-audited Foundation-1 assessment. Review that decision report first; no signature is requested before it is ready.</p>
          <Link href="/migration/proposal-status" className="mt-7 inline-flex h-11 items-center rounded-[6px] bg-white px-5 text-xs font-medium text-black transition hover:bg-white/88">Open assessment status</Link>
        </div>
      </main>
    );
  }

  return (
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
          eoiSignatureId: lead.eoiSignatureId,
          eoiSignedBy: lead.eoiSignedBy,
          eoiSignedAt: lead.eoiSignedAt,
          eoiAcceptedTermsAt: lead.eoiAcceptedTermsAt,
          isSigned: Boolean(lead.eoiSignedAt),
        }}
      />
  );
}

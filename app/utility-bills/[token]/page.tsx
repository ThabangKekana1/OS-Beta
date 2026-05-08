import type { Metadata } from "next";
import Link from "next/link";
import { UtilityBillUploadForm } from "@/components/utility-bills/UtilityBillUploadForm";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { findUtilityBillUploadLead, utilityBillDocumentCount } from "@/lib/utility-bill-upload";

export const metadata: Metadata = {
  title: "1OS | Utility Bill Upload",
  description: "Secure utility bill upload page for 1OS client qualification.",
};

export default async function UtilityBillUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { snapshot } = await readAdminStateSnapshot();
  const lead = findUtilityBillUploadLead(snapshot, token);

  if (!lead) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black p-6 text-center text-white">
        <p className="text-[0.66rem] uppercase tracking-[0.26em] text-white/46">Utility Bill Upload</p>
        <h1 className="text-3xl font-medium tracking-[-0.04em]">Upload link not found</h1>
        <p className="max-w-lg text-sm leading-7 text-white/62">
          This utility bill upload link is invalid or has been removed from the client profile.
        </p>
        <Link
          href="/"
          className="rounded-full border border-white/14 bg-white/[0.04] px-6 py-2.5 text-[0.66rem] uppercase tracking-[0.22em] text-white/72 transition hover:border-white/22 hover:bg-white/[0.08] hover:text-white"
        >
          Return to 1OS
        </Link>
      </div>
    );
  }

  if (!lead.eoiSignedAt) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black p-6 text-center text-white">
        <section className="w-full max-w-2xl rounded-[2rem] border border-amber-400/25 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_34%),rgba(255,255,255,0.045)] p-8 shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
          <p className="text-[0.66rem] uppercase tracking-[0.26em] text-amber-100/60">Locked</p>
          <h1 className="mt-4 text-3xl font-medium tracking-[-0.04em]">EOI approval required first</h1>
          <p className="mt-4 text-sm leading-7 text-white/62">
            {lead.company} must approve the Expression of Interest before utility bills can be uploaded.
          </p>
          <p className="mt-3 text-xs uppercase tracking-[0.18em] text-white/38">
            Profile {lead.clientProfileId}
          </p>
        </section>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_42%),#000] p-4 text-white md:p-8">
      <UtilityBillUploadForm
        token={token}
        initialLead={{
          clientProfileId: lead.clientProfileId,
          company: lead.company,
          contactName: lead.contactName,
          stage: lead.stage,
          eoiSignedAt: lead.eoiSignedAt,
          eoiSignedBy: lead.eoiSignedBy,
          uploadedCount: utilityBillDocumentCount(lead),
        }}
      />
    </main>
  );
}

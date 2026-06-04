import type { Metadata } from "next";
import Link from "next/link";
import { ClientProposalDownloadPortal } from "@/components/proposal/ClientProposalDownloadPortal";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { proposalDownloadLinkIdForLead } from "@/lib/registration-links";
import type { AdminLead, AdminLeadDocument } from "@/lib/admin-types";

export const metadata: Metadata = {
  title: "Proposal Download | Foundation-1",
  description: "Secure Foundation-1 proposal download portal connected to a client profile.",
};

function findLeadByProposalToken(leads: AdminLead[], token: string): AdminLead | null {
  return (
    leads.find(
      (lead) =>
        proposalDownloadLinkIdForLead({
          leadId: lead.id,
          clientProfileId: lead.clientProfileId,
          email: lead.userProfile.email,
        }) === token,
    ) ?? null
  );
}

function isIssuedProposal(document: AdminLeadDocument) {
  const joined = `${document.title} ${document.category}`.toLowerCase();
  return (
    document.uploadedByType === "Admin Team" &&
    document.status === "issued" &&
    joined.includes("proposal") &&
    !joined.includes("signed")
  );
}

export default async function PublicProposalDownloadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { snapshot } = await readAdminStateSnapshot();
  const lead = findLeadByProposalToken(snapshot.leads, token);

  if (!lead) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black p-6 text-center text-white">
        <p className="text-[0.66rem] uppercase tracking-[0.26em] text-white/46">Proposal Download</p>
        <h1 className="text-3xl font-medium tracking-[-0.04em]">Proposal link not found</h1>
        <p className="max-w-lg text-sm leading-7 text-white/62">
          This proposal download link is invalid or has been removed from the client profile.
        </p>
        <Link
          href="/"
          className="rounded-full border border-white/14 bg-white/[0.04] px-6 py-2.5 text-[0.66rem] uppercase tracking-[0.22em] text-white/72 transition hover:border-white/22 hover:bg-white/[0.08] hover:text-white"
        >
          Return to Foundation-1
        </Link>
      </div>
    );
  }

  const proposalDocuments = lead.documents.filter(isIssuedProposal).map((document) => ({
    id: document.id,
    title: document.title,
    fileName: document.fileName ?? null,
    uploadedAt: document.uploadedAt,
  }));

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(215,255,75,0.12),transparent_38%),#000] p-4 text-white md:p-8">
      <ClientProposalDownloadPortal
        token={token}
        initialLead={{
          clientProfileId: lead.clientProfileId,
          company: lead.company,
          contactName: lead.contactName,
          proposalCount: proposalDocuments.length,
        }}
        initialDocuments={proposalDocuments}
      />
    </main>
  );
}

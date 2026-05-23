import type { Metadata } from "next";
import Link from "next/link";
import { ClientDocumentUploadPortal } from "@/components/upload/ClientDocumentUploadPortal";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { documentUploadLinkIdForLead } from "@/lib/registration-links";
import type { AdminLead } from "@/lib/admin-types";

export const metadata: Metadata = {
  title: "Document Upload | Foundation-1",
  description: "Secure Foundation-1 document upload portal connected to a client profile.",
};

function findLeadByUploadToken(leads: AdminLead[], token: string): AdminLead | null {
  return (
    leads.find(
      (lead) =>
        documentUploadLinkIdForLead({
          leadId: lead.id,
          clientProfileId: lead.clientProfileId,
          email: lead.userProfile.email,
        }) === token,
    ) ?? null
  );
}

function documentCounts(lead: AdminLead) {
  const joinedDocuments = lead.documents.map((document) => `${document.title} ${document.category}`.toLowerCase());
  return {
    expression_of_interest: joinedDocuments.filter((value) => value.includes("expression of interest") && !value.includes("signed")).length,
    signed_eoi: joinedDocuments.filter((value) => value.includes("signed expression of interest") || value.includes("signed eoi")).length,
    utility_bills: joinedDocuments.filter((value) => value.includes("utility") || value.includes("electricity")).length,
    signed_proposal: joinedDocuments.filter((value) => value.includes("signed proposal")).length,
  };
}

export default async function PublicDocumentUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { snapshot } = await readAdminStateSnapshot();
  const lead = findLeadByUploadToken(snapshot.leads, token);

  if (!lead) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black p-6 text-center text-white">
        <p className="text-[0.66rem] uppercase tracking-[0.26em] text-white/46">Document Upload</p>
        <h1 className="text-3xl font-medium tracking-[-0.04em]">Upload link not found</h1>
        <p className="max-w-lg text-sm leading-7 text-white/62">
          This document upload link is invalid or has been removed from the client profile.
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(215,255,75,0.12),transparent_38%),#000] p-4 text-white md:p-8">
      <ClientDocumentUploadPortal
        token={token}
        initialLead={{
          clientProfileId: lead.clientProfileId,
          company: lead.company,
          contactName: lead.contactName,
          email: lead.userProfile.email,
          stage: lead.stage,
          documentCounts: documentCounts(lead),
        }}
      />
    </main>
  );
}

import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { downloadPrivateObject } from "@/lib/server-json-store";
import { proposalDownloadLinkIdForLead } from "@/lib/registration-links";
import type { AdminLead, AdminLeadDocument } from "@/lib/admin-types";

export const runtime = "nodejs";

const DOCUMENT_BUCKET = "oneos-client-documents";

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

function cleanFilename(value: string) {
  return value.replace(/"/g, "").trim() || "foundation-1-proposal.pdf";
}

function fileTypeExtension(fileType: AdminLeadDocument["fileType"]) {
  if (fileType === "DOCX") return "docx";
  if (fileType === "XLSX") return "xlsx";
  if (fileType === "PNG") return "png";
  if (fileType === "TXT") return "txt";
  return "pdf";
}

function fallbackFilename(document: AdminLeadDocument) {
  const slug = document.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "foundation-1-proposal"}.${fileTypeExtension(document.fileType)}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; documentId: string }> },
) {
  const { token, documentId } = await params;
  const acceptanceId = request.nextUrl.searchParams.get("acceptance")?.trim() ?? "";

  if (!/^nda-/.test(acceptanceId)) {
    return NextResponse.json(
      { ok: false, error: "Accept the non-disclosure agreement before downloading." },
      { status: 403 },
    );
  }

  const { snapshot } = await readAdminStateSnapshot();
  const lead = findLeadByProposalToken(snapshot.leads, token);
  if (!lead) {
    return NextResponse.json({ ok: false, error: "Proposal link not found." }, { status: 404 });
  }

  const hasAccepted = lead.events.some(
    (event) =>
      event.title === "Proposal NDA accepted" &&
      event.detail.includes(`Acceptance ID ${acceptanceId}.`),
  );
  if (!hasAccepted) {
    return NextResponse.json(
      { ok: false, error: "Proposal NDA acceptance could not be verified." },
      { status: 403 },
    );
  }

  const document = lead.documents.find((entry) => entry.id === documentId);
  if (!document || !isIssuedProposal(document)) {
    return NextResponse.json({ ok: false, error: "Proposal document not found." }, { status: 404 });
  }

  if (!document.storagePath) {
    return NextResponse.json(
      { ok: false, error: "This proposal file has no stored payload. Re-upload the proposal." },
      { status: 409 },
    );
  }

  const storedFile = await downloadPrivateObject(DOCUMENT_BUCKET, document.storagePath);
  if (!storedFile) {
    return NextResponse.json(
      { ok: false, error: "Stored proposal file was not found. Re-upload the proposal." },
      { status: 404 },
    );
  }

  return new NextResponse(storedFile, {
    headers: {
      "Content-Type": document.contentType ?? storedFile.type ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${cleanFilename(document.fileName ?? fallbackFilename(document))}"`,
      "Cache-Control": "no-store",
    },
  });
}

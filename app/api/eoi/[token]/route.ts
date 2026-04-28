import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import {
  buildEoiTemplatePdf,
  buildEoiTemplatePdfFilename,
} from "@/lib/eoi-template";
import { makeId, timelineLabel } from "@/lib/formatting";
import { uploadPrivateObject } from "@/lib/server-json-store";
import { createNotification } from "@/lib/notifications";
import type { AdminLead, AdminLeadDocument } from "@/lib/admin-types";

export const runtime = "nodejs";

const DOC_TITLE_SIGNED_EOI = "Signed Expression of Interest";
const DOCUMENT_BUCKET = "oneos-client-documents";

function toPublicEoiLead(lead: AdminLead) {
  return {
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
  };
}

function upsertDocument(
  lead: AdminLead,
  document: Omit<AdminLeadDocument, "id"> & { id?: string },
) {
  const existing = lead.documents.find((entry) => entry.title === document.title);
  const nextDocument: AdminLeadDocument = {
    ...existing,
    id: existing?.id ?? document.id ?? makeId("doc"),
    ...document,
    storagePath: document.storagePath ?? existing?.storagePath ?? null,
    fileName: document.fileName ?? existing?.fileName ?? null,
    contentType: document.contentType ?? existing?.contentType ?? null,
  };

  if (!existing) {
    return [nextDocument, ...lead.documents];
  }

  return lead.documents.map((entry) =>
    entry.id === existing.id ? nextDocument : entry,
  );
}

async function signLeadEoi(lead: AdminLead, signedBy: string) {
  if (lead.stage === "Disqualified" || lead.stage === "Onboarding Complete") {
    return lead;
  }

  const signedAtIso = new Date().toISOString();
  const signerName = signedBy.trim() || lead.contactName;
  const nextStage =
    lead.stage === "Client Registered" || lead.stage === "EOI Generated"
      ? ("EOI Signed" as const)
      : lead.stage;

  const nextLead: AdminLead = {
    ...lead,
    stage: nextStage,
    eoiSignedBy: signerName,
    eoiSignedAt: signedAtIso,
    eoiAcceptedTermsAt: signedAtIso,
    readinessScore: Math.max(lead.readinessScore, 58),
    nextAction: "Submit 6-month utility bills from the sales onboarding desk.",
    lastTouched: "Just now",
    tasks: lead.tasks.map((task) =>
      task.title === "Submit signed EOI"
        ? {
            ...task,
            status: "done" as const,
          }
        : task,
    ),
    events: [
      {
        id: makeId("event"),
        title: "EOI digitally signed",
        detail: "Client completed digital signature and accepted the EOI terms.",
        createdAt: timelineLabel(),
        tone: "client",
      },
      ...lead.events,
    ],
  };

  const signedDocumentId = makeId("doc");
  const signedFilename = buildEoiTemplatePdfFilename(lead.company).replace(
    "expression-of-interest",
    "signed-expression-of-interest",
  );
  const pdfBytes = await buildEoiTemplatePdf(nextLead, {
    signedBy: signerName,
    signedAt: signedAtIso,
  });
  const signedFile = new File([pdfBytes as BlobPart], signedFilename, {
    type: "application/pdf",
  });
  const storagePath = await uploadPrivateObject(
    DOCUMENT_BUCKET,
    `${lead.clientProfileId}/${signedDocumentId}-${signedFilename}`,
    signedFile,
  );

  return {
    ...nextLead,
    documents: upsertDocument(nextLead, {
      id: signedDocumentId,
      title: DOC_TITLE_SIGNED_EOI,
      category: "Onboarding",
      fileType: "PDF",
      status: "signed",
      uploadedAt: timelineLabel(),
      uploadedBy: `${signerName} (Client)`,
      uploadedByType: "Client",
      sourceAccount: lead.migrateAccountId,
      sourceWorkspace: `1OS Migrate / ${lead.company}`,
      storagePath,
      fileName: signedFilename,
      contentType: "application/pdf",
    }),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { backend, snapshot } = await readAdminStateSnapshot();
  const lead = snapshot.leads.find((entry) => entry.eoiSigningToken === token);

  if (!lead) {
    return NextResponse.json({ ok: false, error: "EOI link not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    backend,
    lead: toPublicEoiLead(lead),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  let payload: { signedBy?: string; acceptedTerms?: boolean };

  try {
    payload = (await request.json()) as { signedBy?: string; acceptedTerms?: boolean };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!payload.acceptedTerms) {
    return NextResponse.json(
      { ok: false, error: "Expression of Interest approval is required before submitting." },
      { status: 400 },
    );
  }

  const signedBy = payload.signedBy?.trim() ?? "";
  if (!signedBy) {
    return NextResponse.json(
      { ok: false, error: "Signer name is required." },
      { status: 400 },
    );
  }

  const { snapshot } = await readAdminStateSnapshot();
  let updatedLead: AdminLead | null = null;

  const nextLeads = await Promise.all(snapshot.leads.map(async (lead) => {
    if (lead.eoiSigningToken !== token) {
      return lead;
    }

    updatedLead = await signLeadEoi(lead, signedBy);
    return updatedLead;
  }));

  if (!updatedLead) {
    return NextResponse.json({ ok: false, error: "EOI link not found." }, { status: 404 });
  }

  const signedLead = updatedLead as AdminLead;
  const nextSnapshot = {
    ...snapshot,
    leads: nextLeads,
    activeLeadId: signedLead.id,
  };
  const backend = await writeAdminStateSnapshot(nextSnapshot, "public-eoi-signing");

  void createNotification({
    audience: "admin",
    kind: "eoi_signed",
    title: `EOI signed by ${signedLead.contactName}`,
    body: `${signedLead.company} accepted the Expression of Interest. Stage is now "${signedLead.stage}". Signed by ${signedLead.eoiSignedBy ?? signedLead.contactName} at ${signedLead.eoiSignedAt ?? "just now"}.`,
    link: `/admin/leads/${signedLead.id}`,
    metadata: {
      leadId: signedLead.id,
      company: signedLead.company,
      contactEmail: signedLead.userProfile.email,
    },
  });

  return NextResponse.json({
    ok: true,
    backend,
    lead: toPublicEoiLead(signedLead),
  });
}

import { NextResponse } from "next/server";
import { normalizeAdminLead } from "@/lib/admin-storage";
import { buildSignedEoiPdf } from "@/lib/eoi-pdf";
import {
  buildDevEoiPreviewLead,
  isDevEoiPreviewToken,
} from "@/lib/dev-migration-preview";
import { makeId, timelineLabel } from "@/lib/formatting";
import { promoteLeadStage } from "@/lib/lead-stage";
import { hasCompletedFoundationAssessment } from "@/lib/post-assessment-eoi";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { upsertSingleLeadToDatabase } from "@/lib/supabase-db-store";
import type { AdminLead } from "@/lib/admin-types";

export const runtime = "nodejs";

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
    eoiSignatureId: lead.eoiSignatureId,
    eoiSignedBy: lead.eoiSignedBy,
    eoiSignedAt: lead.eoiSignedAt,
    eoiAcceptedTermsAt: lead.eoiAcceptedTermsAt,
    isSigned: Boolean(lead.eoiSignedAt),
  };
}

function signedDocument(lead: AdminLead, signedBy: string) {
  const existing = lead.documents.find((document) => document.title === "Signed Expression of Interest");
  const document = {
    ...existing,
    id: existing?.id ?? makeId("doc"),
    title: "Signed Expression of Interest",
    category: "Onboarding",
    fileType: "PDF" as const,
    status: "signed" as const,
    uploadedAt: timelineLabel(),
    uploadedBy: `${signedBy} (Client)`,
    uploadedByType: "Client" as const,
    sourceAccount: lead.migrateAccountId,
    sourceWorkspace: `1-MI Digital EOI / ${lead.company}`,
    storagePath: existing?.storagePath ?? null,
    fileName: existing?.fileName ?? null,
    contentType: "application/pdf",
  };
  return existing
    ? lead.documents.map((entry) => entry.id === existing.id ? document : entry)
    : [document, ...lead.documents];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (isDevEoiPreviewToken(token)) {
    return NextResponse.json({ ok: true, backend: "local", lead: buildDevEoiPreviewLead() });
  }
  const { backend, snapshot } = await readAdminStateSnapshot();
  const lead = snapshot.leads.find((entry) => entry.eoiSigningToken === token);

  if (!lead) {
    return NextResponse.json({ ok: false, error: "EOI signing link not found." }, { status: 404 });
  }
  if (!hasCompletedFoundationAssessment(lead)) {
    return NextResponse.json(
      {
        ok: false,
        error: "The non-binding EOI becomes available only after the bill-audited Foundation-1 assessment is completed.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    backend,
    lead: toPublicEoiLead(lead),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const payload = (await request.json().catch(() => null)) as {
    signedBy?: unknown;
    acceptedTerms?: unknown;
  } | null;
  const signedBy = typeof payload?.signedBy === "string" ? payload.signedBy.trim() : "";
  if (signedBy.length < 2 || payload?.acceptedTerms !== true) {
    return NextResponse.json(
      { ok: false, error: "Enter the authorised signatory's name and accept the EOI terms." },
      { status: 400 },
    );
  }

  if (isDevEoiPreviewToken(token)) {
    return NextResponse.json({
      ok: true,
      alreadySigned: false,
      lead: buildDevEoiPreviewLead({ signedBy, signedAt: new Date().toISOString() }),
    });
  }

  const { snapshot } = await readAdminStateSnapshot();
  const stored = snapshot.leads.find((entry) => entry.eoiSigningToken === token);
  if (!stored) {
    return NextResponse.json({ ok: false, error: "EOI signing link not found." }, { status: 404 });
  }
  if (stored.eoiSignedAt) {
    return NextResponse.json({ ok: true, alreadySigned: true, lead: toPublicEoiLead(stored) });
  }
  if (!hasCompletedFoundationAssessment(stored)) {
    return NextResponse.json(
      {
        ok: false,
        error: "The non-binding EOI becomes available only after the bill-audited Foundation-1 assessment is completed.",
      },
      { status: 409 },
    );
  }

  const lead = normalizeAdminLead(stored);
  const signedAt = new Date().toISOString();
  const signatureId = crypto.randomUUID();
  const nextLead: AdminLead = {
    ...lead,
    stage: promoteLeadStage(lead, "EOI Signed"),
    eoiSignatureId: signatureId,
    eoiSignedBy: signedBy,
    eoiSignedAt: signedAt,
    eoiAcceptedTermsAt: signedAt,
    readinessScore: Math.max(lead.readinessScore, 58),
    nextAction: "Prepare the formal UFMS proposal from the completed Foundation-1 assessment and signed non-binding EOI.",
    lastTouched: "Just now",
    documents: signedDocument(lead, signedBy),
    tasks: lead.tasks.map((task) => task.title === "Submit signed EOI" ? { ...task, status: "done" } : task),
    events: [
      {
        id: makeId("event"),
        title: "Digital EOI signed",
        detail: `${signedBy} accepted the post-assessment non-binding EOI terms at ${signedAt}. Signature record: ${signatureId}.`,
        createdAt: timelineLabel(),
        tone: "client",
      },
      ...lead.events,
    ],
  };
  await upsertSingleLeadToDatabase(nextLead, "client-digital-eoi");
  return NextResponse.json({ ok: true, alreadySigned: false, lead: toPublicEoiLead(nextLead) });
}

export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (isDevEoiPreviewToken(token)) {
    const signedAt = new Date().toISOString();
    const preview = buildDevEoiPreviewLead({ signedBy: "Authorised Director", signedAt });
    const result = buildSignedEoiPdf({
      ...preview,
      eoiSignatureId: preview.eoiSignatureId!,
      eoiSignedBy: preview.eoiSignedBy!,
      eoiSignedAt: preview.eoiSignedAt!,
      eoiAcceptedTermsAt: preview.eoiAcceptedTermsAt!,
    });
    return new NextResponse(Buffer.from(result.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const { snapshot } = await readAdminStateSnapshot();
  const lead = snapshot.leads.find((entry) => entry.eoiSigningToken === token);
  if (!lead || !lead.eoiSignatureId || !lead.eoiSignedBy || !lead.eoiSignedAt || !lead.eoiAcceptedTermsAt) {
    return NextResponse.json({ ok: false, error: "The signed EOI is not available yet." }, { status: 409 });
  }
  const result = buildSignedEoiPdf({
    ...lead,
    eoiSignatureId: lead.eoiSignatureId,
    eoiSignedBy: lead.eoiSignedBy,
    eoiSignedAt: lead.eoiSignedAt,
    eoiAcceptedTermsAt: lead.eoiAcceptedTermsAt,
  });
  return new NextResponse(Buffer.from(result.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

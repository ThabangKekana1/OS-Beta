import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import { createNotification } from "@/lib/notifications";
import { makeId, timelineLabel } from "@/lib/formatting";
import { consumeRateLimit } from "@/lib/rate-limit";
import { documentUploadLinkIdForLead } from "@/lib/registration-links";
import { uploadPrivateObject } from "@/lib/server-json-store";
import type { AdminLead, AdminLeadDocument } from "@/lib/admin-types";

export const runtime = "nodejs";

const DOCUMENT_BUCKET = "oneos-client-documents";
const MAX_FILES = 12;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "docx", "xlsx", "txt"]);
const DOCUMENT_TYPES = ["expression_of_interest", "signed_eoi", "utility_bills", "signed_proposal"] as const;
type PublicDocumentType = (typeof DOCUMENT_TYPES)[number];

type PublicUploadLead = {
  clientProfileId: string;
  company: string;
  contactName: string;
  email: string;
  stage: string;
  documentCounts: Record<PublicDocumentType, number>;
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

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function cleanFileSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function fileExtension(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function toFileType(file: File): AdminLeadDocument["fileType"] {
  const extension = fileExtension(file);
  if (extension === "docx") return "DOCX";
  if (extension === "xlsx") return "XLSX";
  if (extension === "png" || extension === "jpg" || extension === "jpeg") return "PNG";
  if (extension === "txt") return "TXT";
  return "PDF";
}

function baseFileTitle(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validateFile(file: File) {
  const extension = fileExtension(file);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return `${file.name} is not supported. Upload PDF, PNG, JPG, DOCX, XLSX, or TXT files.`;
  }
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name} is larger than 15MB.`;
  return null;
}

function isDocumentType(value: FormDataEntryValue | null): value is PublicDocumentType {
  return typeof value === "string" && DOCUMENT_TYPES.includes(value as PublicDocumentType);
}

function setTaskStatus(lead: AdminLead, title: string, done: boolean): AdminLead["tasks"] {
  return lead.tasks.map((task) =>
    task.title === title
      ? {
          ...task,
          status: done ? ("done" as const) : ("open" as const),
        }
      : task,
  );
}

function stageRank(stage: AdminLead["stage"]) {
  const rank: Record<AdminLead["stage"], number> = {
    "Client Registered": 1,
    "EOI Generated": 2,
    "EOI Signed": 3,
    "Utility Bills Uploaded": 4,
    "Compliance Pack Uploaded": 5,
    "Term Sheet Uploaded": 6,
    "Onboarding Complete": 7,
    Disqualified: 99,
  };
  return rank[stage] ?? 0;
}

function promoteStage(lead: AdminLead, target: AdminLead["stage"]): AdminLead["stage"] {
  if (lead.stage === "Disqualified" || lead.stage === "Onboarding Complete") return lead.stage;
  return stageRank(lead.stage) < stageRank(target) ? target : lead.stage;
}

function titleForUpload(type: PublicDocumentType, file: File, index: number) {
  const base = baseFileTitle(file.name);
  if (type === "expression_of_interest") return base ? `Expression of Interest - ${base}` : "Expression of Interest";
  if (type === "signed_eoi") return base ? `Signed Expression of Interest - ${base}` : "Signed Expression of Interest";
  if (type === "signed_proposal") return base ? `Signed Proposal - ${base}` : "Signed Proposal";
  return base ? `Utility Bill - ${base}` : `Utility Bill - Month ${index + 1}`;
}

function documentCategory(type: PublicDocumentType) {
  if (type === "utility_bills") return "Qualification";
  if (type === "signed_proposal") return "Commercial";
  return "Onboarding";
}

function documentStatus(type: PublicDocumentType): AdminLeadDocument["status"] {
  return type === "signed_eoi" || type === "signed_proposal" ? "signed" : "received";
}

function publicLead(lead: AdminLead): PublicUploadLead {
  const joinedDocuments = lead.documents.map((document) => `${document.title} ${document.category}`.toLowerCase());
  return {
    clientProfileId: lead.clientProfileId,
    company: lead.company,
    contactName: lead.contactName,
    email: lead.userProfile.email,
    stage: lead.stage,
    documentCounts: {
      expression_of_interest: joinedDocuments.filter((value) => value.includes("expression of interest") && !value.includes("signed")).length,
      signed_eoi: joinedDocuments.filter((value) => value.includes("signed expression of interest") || value.includes("signed eoi")).length,
      utility_bills: joinedDocuments.filter((value) => value.includes("utility") || value.includes("electricity")).length,
      signed_proposal: joinedDocuments.filter((value) => value.includes("signed proposal")).length,
    },
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { backend, snapshot } = await readAdminStateSnapshot();
  const lead = findLeadByUploadToken(snapshot.leads, token);
  if (!lead) {
    return NextResponse.json({ ok: false, error: "Document upload link not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, backend, lead: publicLead(lead) });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const limit = await consumeRateLimit({
    scope: "public-document-upload",
    key: `${requestIp(request)}:${token}`,
    limit: 20,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many upload attempts. Try again later." },
      { status: 429 },
    );
  }

  const formData = await request.formData();
  const documentTypeEntry = formData.get("documentType");
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);

  if (!isDocumentType(documentTypeEntry)) {
    return NextResponse.json({ ok: false, error: "Choose a document type." }, { status: 400 });
  }
  const documentType = documentTypeEntry;

  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "Choose at least one file before uploading." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ ok: false, error: `Upload a maximum of ${MAX_FILES} files at a time.` }, { status: 400 });
  }

  const invalidFileMessage = files.map(validateFile).find((message): message is string => Boolean(message));
  if (invalidFileMessage) {
    return NextResponse.json({ ok: false, error: invalidFileMessage }, { status: 400 });
  }

  const { snapshot } = await readAdminStateSnapshot();
  const currentLead = findLeadByUploadToken(snapshot.leads, token);
  if (!currentLead) {
    return NextResponse.json({ ok: false, error: "Document upload link not found." }, { status: 404 });
  }

  let updatedLead: AdminLead | null = null;
  const nextLeads = await Promise.all(snapshot.leads.map(async (lead) => {
    if (lead.id !== currentLead.id) return lead;

    const uploadedDocuments: AdminLeadDocument[] = [];
    for (const [index, file] of files.entries()) {
      const documentId = makeId("doc");
      const safeFilename = cleanFileSegment(file.name) || `${documentId}.bin`;
      const storagePath = await uploadPrivateObject(
        DOCUMENT_BUCKET,
        `${lead.clientProfileId}/${documentId}-${safeFilename}`,
        file,
      );

      uploadedDocuments.push({
        id: documentId,
        title: titleForUpload(documentType, file, index),
        category: documentCategory(documentType),
        fileType: toFileType(file),
        status: documentStatus(documentType),
        uploadedAt: timelineLabel(),
        uploadedBy: `${lead.contactName || lead.userProfile.fullName} (Client)`,
        uploadedByType: "Client",
        sourceAccount: lead.migrateAccountId,
        sourceWorkspace: `Foundation-1 Secure Upload / ${lead.company}`,
        storagePath,
        fileName: file.name,
        contentType: file.type || null,
      });
    }

    const signedEoiAt = documentType === "signed_eoi" ? lead.eoiSignedAt ?? new Date().toISOString() : lead.eoiSignedAt;
    const nextStage = documentType === "signed_eoi"
      ? promoteStage(lead, "EOI Signed")
      : documentType === "utility_bills"
        ? promoteStage(lead, "Utility Bills Uploaded")
        : lead.stage;
    const nextReadiness = documentType === "signed_eoi"
      ? Math.max(lead.readinessScore, 58)
      : documentType === "utility_bills"
        ? Math.max(lead.readinessScore, 72)
        : documentType === "signed_proposal"
          ? Math.max(lead.readinessScore, 84)
          : lead.readinessScore;
    const nextAction = documentType === "signed_eoi"
      ? "Review signed EOI and request the 6-month utility bill pack."
      : documentType === "utility_bills"
        ? "Review uploaded utility bills and prepare the proposal."
        : documentType === "signed_proposal"
          ? "Review signed proposal and prepare the compliance pack."
          : lead.nextAction;

    let nextTasks = lead.tasks;
    if (documentType === "signed_eoi") nextTasks = setTaskStatus(lead, "Submit signed EOI", true);
    if (documentType === "utility_bills") nextTasks = setTaskStatus(lead, "Upload 6-month utility bill pack", true);
    if (documentType === "signed_proposal") nextTasks = setTaskStatus(lead, "Submit signed proposal", true);

    updatedLead = {
      ...lead,
      stage: nextStage,
      readinessScore: nextReadiness,
      nextAction,
      lastTouched: "Just now",
      eoiSignedAt: signedEoiAt,
      eoiAcceptedTermsAt: documentType === "signed_eoi" ? lead.eoiAcceptedTermsAt ?? signedEoiAt : lead.eoiAcceptedTermsAt,
      eoiSignedBy: documentType === "signed_eoi" ? lead.eoiSignedBy ?? lead.contactName : lead.eoiSignedBy,
      eoiSignatureId: documentType === "signed_eoi" ? lead.eoiSignatureId ?? makeId("signature") : lead.eoiSignatureId,
      documents: [...uploadedDocuments, ...lead.documents],
      tasks: nextTasks,
      events: [
        {
          id: makeId("event"),
          title: "Client document uploaded",
          detail: `${files.length} ${documentType.replace(/_/g, " ")} file${files.length === 1 ? "" : "s"} uploaded through the secure document upload link.`,
          createdAt: timelineLabel(),
          tone: "client",
        },
        ...lead.events,
      ],
    };

    return updatedLead;
  }));

  if (!updatedLead) {
    return NextResponse.json({ ok: false, error: "Document upload link not found." }, { status: 404 });
  }

  const savedLead = updatedLead as AdminLead;
  const nextSnapshot = {
    ...snapshot,
    leads: nextLeads,
    activeLeadId: savedLead.id,
  };
  const backend = await writeAdminStateSnapshot(nextSnapshot, "public-document-upload");

  void createNotification({
    audience: "admin",
    kind: "customer_uploaded_document",
    title: `Document uploaded by ${savedLead.company}`,
    body: `${savedLead.contactName} uploaded ${files.length} ${documentType.replace(/_/g, " ")} file${files.length === 1 ? "" : "s"}.`,
    link: `/admin/leads/${savedLead.clientProfileId}`,
    metadata: {
      leadId: savedLead.id,
      clientProfileId: savedLead.clientProfileId,
      company: savedLead.company,
      fileCount: files.length,
      documentType,
    },
  });

  if (documentType === "signed_eoi") {
    void createNotification({
      audience: "admin",
      kind: "eoi_signed",
      title: `EOI signed by ${savedLead.company}`,
      body: `${savedLead.contactName} signed and uploaded the Expression of Interest.`,
      link: `/admin/leads/${savedLead.clientProfileId}`,
      metadata: {
        leadId: savedLead.id,
        clientProfileId: savedLead.clientProfileId,
        company: savedLead.company,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    backend,
    lead: publicLead(savedLead),
    uploadedCount: files.length,
  });
}

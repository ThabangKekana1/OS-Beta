import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import { createNotification } from "@/lib/notifications";
import { makeId, timelineLabel } from "@/lib/formatting";
import { uploadPrivateObject } from "@/lib/server-json-store";
import {
  findUtilityBillUploadLead,
  utilityBillDocumentCount,
} from "@/lib/utility-bill-upload";
import type { AdminLead, AdminLeadDocument } from "@/lib/admin-types";

export const runtime = "nodejs";

const DOCUMENT_BUCKET = "oneos-client-documents";
const MAX_FILES = 12;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "docx", "xlsx", "txt"]);

type PublicUtilityBillLead = {
  clientProfileId: string;
  company: string;
  contactName: string;
  stage: string;
  eoiSignedAt: string | null;
  eoiSignedBy: string | null;
  uploadedCount: number;
};

function publicLead(lead: AdminLead): PublicUtilityBillLead {
  return {
    clientProfileId: lead.clientProfileId,
    company: lead.company,
    contactName: lead.contactName,
    stage: lead.stage,
    eoiSignedAt: lead.eoiSignedAt,
    eoiSignedBy: lead.eoiSignedBy,
    uploadedCount: utilityBillDocumentCount(lead),
  };
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

function setTaskStatus(
  lead: AdminLead,
  title: string,
  done: boolean,
): AdminLead["tasks"] {
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

function promoteToUtilityBillsUploaded(stage: AdminLead["stage"]): AdminLead["stage"] {
  if (stage === "Disqualified" || stage === "Onboarding Complete") return stage;
  return stageRank(stage) < stageRank("Utility Bills Uploaded") ? "Utility Bills Uploaded" : stage;
}

function validateFile(file: File) {
  const extension = fileExtension(file);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return `${file.name} is not supported. Upload PDF, PNG, JPG, DOCX, XLSX, or TXT files.`;
  }

  if (file.size <= 0) {
    return `${file.name} is empty.`;
  }

  if (file.size > MAX_FILE_BYTES) {
    return `${file.name} is larger than 15MB.`;
  }

  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { backend, snapshot } = await readAdminStateSnapshot();
  const lead = findUtilityBillUploadLead(snapshot, token);

  if (!lead) {
    return NextResponse.json({ ok: false, error: "Utility bill upload link not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    backend,
    locked: !lead.eoiSignedAt,
    lead: publicLead(lead),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const formData = await request.formData();
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "Choose at least one utility bill file." }, { status: 400 });
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json({ ok: false, error: `Upload a maximum of ${MAX_FILES} files at a time.` }, { status: 400 });
  }

  const invalidFileMessage = files.map(validateFile).find((message): message is string => Boolean(message));
  if (invalidFileMessage) {
    return NextResponse.json({ ok: false, error: invalidFileMessage }, { status: 400 });
  }

  const { snapshot } = await readAdminStateSnapshot();
  const currentLead = findUtilityBillUploadLead(snapshot, token);

  if (!currentLead) {
    return NextResponse.json({ ok: false, error: "Utility bill upload link not found." }, { status: 404 });
  }

  if (!currentLead.eoiSignedAt) {
    return NextResponse.json(
      { ok: false, error: "The Expression of Interest must be approved before utility bills can be uploaded." },
      { status: 403 },
    );
  }

  let updatedLead: AdminLead | null = null;
  const nextLeads = await Promise.all(snapshot.leads.map(async (lead) => {
    if (lead.id !== currentLead.id) {
      return lead;
    }

    const uploadedDocuments: AdminLeadDocument[] = [];

    for (const [index, file] of files.entries()) {
      const documentId = makeId("doc");
      const safeFilename = cleanFileSegment(file.name) || `${documentId}.bin`;
      const storagePath = await uploadPrivateObject(
        DOCUMENT_BUCKET,
        `${lead.clientProfileId}/${documentId}-${safeFilename}`,
        file,
      );
      const titleSegment = baseFileTitle(file.name) || `Month ${index + 1}`;

      uploadedDocuments.push({
        id: documentId,
        title: `Utility Bill - ${titleSegment}`,
        category: "Qualification",
        fileType: toFileType(file),
        status: "received",
        uploadedAt: timelineLabel(),
        uploadedBy: `${lead.contactName} (Client)`,
        uploadedByType: "Client",
        sourceAccount: lead.migrateAccountId,
        sourceWorkspace: `1OS Utility Upload / ${lead.company}`,
        storagePath,
        fileName: file.name,
        contentType: file.type || null,
      });
    }

    const nextStage = promoteToUtilityBillsUploaded(lead.stage);
    updatedLead = {
      ...lead,
      stage: nextStage,
      readinessScore: Math.max(lead.readinessScore, 72),
      nextAction:
        nextStage !== lead.stage
          ? "Review uploaded utility bills and prepare the proposal."
          : lead.nextAction,
      lastTouched: "Just now",
      documents: [...uploadedDocuments, ...lead.documents],
      tasks: setTaskStatus(lead, "Upload 6-month utility bill pack", true),
      events: [
        {
          id: makeId("event"),
          title: "Utility bills uploaded by client",
          detail: `${files.length} utility bill file${files.length === 1 ? "" : "s"} uploaded through the secure client upload link.`,
          createdAt: timelineLabel(),
          tone: "client",
        },
        ...lead.events,
      ],
    };

    return updatedLead;
  }));

  if (!updatedLead) {
    return NextResponse.json({ ok: false, error: "Utility bill upload link not found." }, { status: 404 });
  }

  const savedLead = updatedLead as AdminLead;
  const nextSnapshot = {
    ...snapshot,
    leads: nextLeads,
    activeLeadId: savedLead.id,
  };
  const backend = await writeAdminStateSnapshot(nextSnapshot, "public-utility-bill-upload");

  void createNotification({
    audience: "admin",
    kind: "customer_uploaded_document",
    title: `Utility bills uploaded by ${savedLead.company}`,
    body: `${savedLead.contactName} uploaded ${files.length} utility bill file${files.length === 1 ? "" : "s"}. Stage is now "${savedLead.stage}".`,
    link: `/admin/clients/${savedLead.clientProfileId}`,
    metadata: {
      leadId: savedLead.id,
      clientProfileId: savedLead.clientProfileId,
      company: savedLead.company,
      fileCount: files.length,
    },
  });

  return NextResponse.json({
    ok: true,
    backend,
    lead: publicLead(savedLead),
    uploadedCount: files.length,
  });
}

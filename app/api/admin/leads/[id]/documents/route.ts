import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import { getServerAuthSession } from "@/lib/auth-server";
import { makeId, timelineLabel } from "@/lib/formatting";
import {
  downloadPrivateObject,
  uploadPrivateObject,
} from "@/lib/server-json-store";
import type {
  AdminDocumentStatus,
  AdminLead,
  AdminLeadDocument,
} from "@/lib/admin-types";

export const runtime = "nodejs";

const DOCUMENT_BUCKET = "oneos-client-documents";

function cleanFileSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function fileTypeExtension(fileType: AdminLeadDocument["fileType"]) {
  if (fileType === "DOCX") return "docx";
  if (fileType === "XLSX") return "xlsx";
  if (fileType === "PNG") return "png";
  if (fileType === "TXT") return "txt";
  return "pdf";
}

function buildStoredFilename(document: AdminLeadDocument) {
  const fromUpload = document.fileName?.trim();
  if (fromUpload) {
    return fromUpload;
  }

  const titleSegment = cleanFileSegment(document.title) || "document";
  return `${titleSegment}.${fileTypeExtension(document.fileType)}`;
}

function toDocumentStatus(value: FormDataEntryValue | null): AdminDocumentStatus {
  if (
    value === "pending" ||
    value === "received" ||
    value === "reviewed" ||
    value === "issued" ||
    value === "signed"
  ) {
    return value;
  }

  return "received";
}

function toFileType(file: File): AdminLeadDocument["fileType"] {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "docx") {
    return "DOCX";
  }

  if (extension === "xlsx") {
    return "XLSX";
  }

  if (extension === "png") {
    return "PNG";
  }

  if (extension === "txt") {
    return "TXT";
  }

  return "PDF";
}

function appendLeadDocument(
  lead: AdminLead,
  document: AdminLeadDocument,
) {
  const existing = lead.documents.find((entry) => entry.title === document.title);

  if (!existing) {
    return [document, ...lead.documents];
  }

  return lead.documents.map((entry) =>
    entry.id === existing.id ? { ...entry, ...document, id: existing.id } : entry,
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const documentId = request.nextUrl.searchParams.get("documentId")?.trim() ?? "";
  if (!documentId) {
    return NextResponse.json(
      { ok: false, error: "documentId query parameter is required." },
      { status: 400 },
    );
  }

  const { snapshot } = await readAdminStateSnapshot();
  const lead = snapshot.leads.find((entry) => entry.id === id || entry.clientProfileId === id);
  if (!lead) {
    return NextResponse.json({ ok: false, error: "Client profile not found." }, { status: 404 });
  }

  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const document = lead.documents.find((entry) => entry.id === documentId);
  if (!document) {
    return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  }

  if (!document.storagePath) {
    return NextResponse.json(
      {
        ok: false,
        error: "This document does not have a stored file payload. Upload a real file first.",
      },
      { status: 409 },
    );
  }

  const storedFile = await downloadPrivateObject(DOCUMENT_BUCKET, document.storagePath);
  if (!storedFile) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Stored file bytes were not found for this document path. Re-upload the file to restore download.",
      },
      { status: 404 },
    );
  }

  return new NextResponse(storedFile, {
    headers: {
      "Content-Type": document.contentType ?? storedFile.type ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${buildStoredFilename(document).replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { ok: false, error: "A non-empty file is required." },
      { status: 400 },
    );
  }

  const title =
    typeof formData.get("title") === "string" && formData.get("title")?.toString().trim()
      ? formData.get("title")!.toString().trim()
      : file.name.replace(/\.[^.]+$/, "");
  const category =
    typeof formData.get("category") === "string" && formData.get("category")?.toString().trim()
      ? formData.get("category")!.toString().trim()
      : "Client Upload";
  const status = toDocumentStatus(formData.get("status"));

  const { snapshot } = await readAdminStateSnapshot();
  const targetLead = snapshot.leads.find((entry) => entry.id === id || entry.clientProfileId === id);
  if (!targetLead) {
    return NextResponse.json({ ok: false, error: "Client profile not found." }, { status: 404 });
  }

  let nextLead: AdminLead | null = null;
  let storedPath: string | null = null;

  const nextLeads = await Promise.all(
    snapshot.leads.map(async (lead) => {
      if (lead.id !== id && lead.clientProfileId !== id) {
        return lead;
      }

      const documentId = makeId("doc");
      const fileName = cleanFileSegment(file.name) || `${documentId}.bin`;
      const objectPath = `${lead.clientProfileId}/${documentId}-${fileName}`;
      storedPath = await uploadPrivateObject(DOCUMENT_BUCKET, objectPath, file);

      const document: AdminLeadDocument = {
        id: documentId,
        title,
        category,
        fileType: toFileType(file),
        status,
        uploadedAt: timelineLabel(),
        uploadedBy: session.name,
        uploadedByType: "Admin Team",
        sourceAccount: lead.migrateAccountId,
        sourceWorkspace: `1OS Admin / ${lead.company}`,
        storagePath: storedPath,
        fileName: file.name,
        contentType: file.type || null,
      };

      nextLead = {
        ...lead,
        lastTouched: "Just now",
        documents: appendLeadDocument(lead, document),
        events: [
          {
            id: makeId("event"),
            title: `${title} uploaded`,
            detail: storedPath
              ? `File stored in secure document storage at ${storedPath}.`
              : "Document metadata captured; configure Supabase to persist file bytes.",
            createdAt: timelineLabel(),
            tone: "system",
          },
          ...lead.events,
        ],
      };

      return nextLead;
    }),
  );

  if (!nextLead) {
    return NextResponse.json({ ok: false, error: "Client profile not found." }, { status: 404 });
  }

  const uploadedLead = nextLead as AdminLead;
  const nextSnapshot = {
    ...snapshot,
    leads: nextLeads,
    activeLeadId: uploadedLead.id,
  };
  const backend = await writeAdminStateSnapshot(nextSnapshot, session.email);

  return NextResponse.json({
    ok: true,
    backend,
    snapshot: nextSnapshot,
    document: uploadedLead.documents[0],
  });
}

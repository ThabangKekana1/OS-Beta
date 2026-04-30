import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { resolveClientOnboardingLead } from "@/lib/client-onboarding";
import { downloadPrivateObject } from "@/lib/server-json-store";

export const runtime = "nodejs";

const DOCUMENT_BUCKET = "oneos-client-documents";

function cleanFileSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function fileTypeExtension(fileType: "PDF" | "DOCX" | "XLSX" | "PNG" | "TXT") {
  if (fileType === "DOCX") return "docx";
  if (fileType === "XLSX") return "xlsx";
  if (fileType === "PNG") return "png";
  if (fileType === "TXT") return "txt";
  return "pdf";
}

function buildStoredFilename(document: {
  title: string;
  fileName?: string | null;
  fileType: "PDF" | "DOCX" | "XLSX" | "PNG" | "TXT";
}) {
  const fromUpload = document.fileName?.trim();
  if (fromUpload) {
    return fromUpload;
  }

  const titleSegment = cleanFileSegment(document.title) || "document";
  return `${titleSegment}.${fileTypeExtension(document.fileType)}`;
}

export async function GET(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const documentId = request.nextUrl.searchParams.get("documentId")?.trim() ?? "";
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const caseName = request.nextUrl.searchParams.get("caseName");
  if (!documentId) {
    return NextResponse.json(
      { ok: false, error: "documentId query parameter is required." },
      { status: 400 },
    );
  }

  const lead = await resolveClientOnboardingLead({
    sessionEmail: session.email,
    workspaceId,
    caseName,
  });
  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }

  const document = lead.documents.find((entry) => entry.id === documentId);
  if (!document) {
    return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  }

  if (!document.storagePath) {
    return NextResponse.json(
      { ok: false, error: "This document does not have a stored file payload yet." },
      { status: 409 },
    );
  }

  const storedFile = await downloadPrivateObject(DOCUMENT_BUCKET, document.storagePath);
  if (!storedFile) {
    return NextResponse.json(
      { ok: false, error: "Stored file bytes were not found for this document path." },
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

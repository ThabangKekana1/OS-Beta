import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import {
  MAX_CASE_DOCUMENT_BYTES,
  persistCaseDocumentUpload,
} from "@/lib/case-document-upload";
import type { CaseDocKind } from "@/lib/case-documents";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

const CATEGORY_TO_DOC_KIND: Record<string, CaseDocKind> = {
  EOI: "eoi",
  "Utility Bills": "utility_bill",
  Proposal: "proposal",
  "Term Sheet": "term_sheet",
};

export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form-data" }, { status: 400 });
  }

  const workspaceId = String(form.get("workspaceId") ?? "").trim();
  const caseId = String(form.get("caseId") ?? "").trim();
  const caseName = String(form.get("caseName") ?? "").trim() || caseId || "untitled case";
  const category = String(form.get("category") ?? "").trim();
  const docKind = CATEGORY_TO_DOC_KIND[category] ?? null;
  const files = form
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);

  if (!workspaceId || !caseId || !docKind) {
    return NextResponse.json(
      { error: "workspaceId, caseId, and a valid category are required." },
      { status: 400 },
    );
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "At least one file is required." }, { status: 400 });
  }

  const oversized = files.find(
    (file) => file.size === 0 || file.size > MAX_CASE_DOCUMENT_BYTES,
  );
  if (oversized) {
    return NextResponse.json(
      { error: `${oversized.name} must be 1B–${MAX_CASE_DOCUMENT_BYTES} bytes.` },
      { status: 400 },
    );
  }

  try {
    const uploaded = await Promise.all(
      files.map((file) =>
        persistCaseDocumentUpload({
          workspaceId,
          caseId,
          docKind,
          file,
          title: file.name,
          uploadedBy: session.email,
        }),
      ),
    );

    await createNotification({
      audience: "admin",
      kind: "customer_uploaded_document",
      title: `Customer uploaded ${files.length} ${category} file${files.length === 1 ? "" : "s"} on ${caseName}`,
      body: `Files: ${files.map((file) => file.name).join(", ")}`,
      link: "/admin/case-documents",
      metadata: {
        workspaceId,
        caseId,
        caseName,
        category,
        fileNames: files.map((file) => file.name),
        customerEmail: session.email,
        uploadedBy: session.email,
        docIds: uploaded.map(({ doc }) => doc.id),
        storagePaths: uploaded.map(({ storagePath }) => storagePath),
      },
    });

    return NextResponse.json({
      ok: true,
      files: uploaded.map(({ doc, storagePath, extractedText }) => ({
        id: doc.id,
        title: doc.title,
        docKind: doc.docKind,
        storagePath,
        extractedChars: extractedText?.length ?? 0,
        createdAt: doc.createdAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

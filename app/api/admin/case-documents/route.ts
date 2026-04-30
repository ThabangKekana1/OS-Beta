import { NextRequest, NextResponse } from "next/server";
import { requireServerAuthSession } from "@/lib/auth-server";
import { listCaseDocuments, type CaseDocKind } from "@/lib/case-documents";
import {
  MAX_CASE_DOCUMENT_BYTES,
  persistCaseDocumentUpload,
} from "@/lib/case-document-upload";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

const ALLOWED_KINDS: CaseDocKind[] = ["proposal", "term_sheet", "utility_bill", "eoi", "other"];

export async function GET(request: NextRequest) {
  await requireServerAuthSession("admin");
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const caseId = url.searchParams.get("caseId");
  if (!workspaceId || !caseId) {
    return NextResponse.json({ error: "workspaceId and caseId required" }, { status: 400 });
  }
  const docs = await listCaseDocuments(workspaceId, caseId);
  return NextResponse.json({ docs });
}

export async function POST(request: NextRequest) {
  const session = await requireServerAuthSession("admin");

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form-data" }, { status: 400 });
  }

  const workspaceId = String(form.get("workspaceId") ?? "").trim();
  const caseId = String(form.get("caseId") ?? "").trim();
  const docKindRaw = String(form.get("docKind") ?? "").trim();
  const title = String(form.get("title") ?? "").trim() || null;
  const file = form.get("file");

  if (!workspaceId || !caseId) {
    return NextResponse.json({ error: "workspaceId and caseId required" }, { status: 400 });
  }
  if (!ALLOWED_KINDS.includes(docKindRaw as CaseDocKind)) {
    return NextResponse.json({ error: "Invalid docKind" }, { status: 400 });
  }
  const docKind = docKindRaw as CaseDocKind;
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_CASE_DOCUMENT_BYTES) {
    return NextResponse.json(
      { error: `File must be 1B–${MAX_CASE_DOCUMENT_BYTES} bytes` },
      { status: 400 },
    );
  }
  let persisted;
  try {
    persisted = await persistCaseDocumentUpload({
      workspaceId,
      caseId,
      docKind,
      file,
      title,
      uploadedBy: session.email ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  const { doc, extractedText } = persisted;

  const customerEmail = String(form.get("customerEmail") ?? "").trim() || null;
  if (doc) {
    void createNotification({
      audience: "admin",
      kind: "admin_uploaded_document",
      title: `Uploaded ${docKind.replace("_", " ")} for ${caseId}`,
      body: `${session.email ?? "Admin"} uploaded "${doc.title ?? file.name}" to ${workspaceId}/${caseId}.${extractedText ? ` Extracted ${extractedText.length} chars for AI grounding.` : ""}`,
      link: `/admin/case-documents`,
      metadata: { workspaceId, caseId, docId: doc.id, docKind },
      // Don't email the admin for their own action; dashboard entry only.
      email: false,
    });

    if (customerEmail) {
      void createNotification({
        audience: "customer",
        recipientEmail: customerEmail,
        kind: "admin_uploaded_document",
        title: `New ${docKind.replace("_", " ")} available in your 1OS workspace`,
        body: `Foundation-1 has uploaded "${doc.title ?? file.name}" to your case. Open 1OS to review it. Your AI assistant can also explain the document if you need help.`,
        link: `/documents`,
        metadata: { workspaceId, caseId, docId: doc.id, docKind },
      });
    }
  }

  return NextResponse.json({
    doc,
    extracted: Boolean(extractedText),
    extractedChars: extractedText?.length ?? 0,
    customerNotified: Boolean(customerEmail),
  });
}

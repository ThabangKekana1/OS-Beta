import { NextRequest, NextResponse } from "next/server";
import { requireServerAuthSession } from "@/lib/auth-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { insertCaseDocument, listCaseDocuments, type CaseDocKind } from "@/lib/case-documents";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

const ALLOWED_KINDS: CaseDocKind[] = ["proposal", "term_sheet", "utility_bill", "eoi", "other"];
const BUCKET = process.env.ONEOS_SUPABASE_BUCKET?.trim() || "oneos-documents";
const MAX_BYTES = 15 * 1024 * 1024; // 15MB

async function extractPdfText(buffer: Buffer): Promise<string | null> {
  try {
    const mod = await import("pdf-parse");
    const pdfParse = (mod as unknown as { default?: (b: Buffer) => Promise<{ text?: string }> }).default
      ?? (mod as unknown as (b: Buffer) => Promise<{ text?: string }>);
    const result = await pdfParse(buffer);
    const text = (result?.text ?? "").trim();
    return text || null;
  } catch {
    return null;
  }
}

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
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File must be 1B–${MAX_BYTES} bytes` }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let extractedText: string | null = null;
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    extractedText = await extractPdfText(buffer);
  } else if (file.type.startsWith("text/")) {
    extractedText = buffer.toString("utf8").slice(0, 200_000);
  }

  let storagePath: string | null = null;
  const client = getSupabaseAdminClient();
  if (client) {
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${workspaceId}/${caseId}/${docKind}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
    if (!uploadError) {
      storagePath = path;
    }
  }

  const doc = await insertCaseDocument({
    workspaceId,
    caseId,
    docKind,
    title: title ?? file.name,
    storagePath,
    extractedText,
    uploadedBy: session.email ?? null,
  });

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

import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { findDocumentSignature } from "@/lib/document-signing-store";
import { MIGRATION_CASE_DOCUMENT_BUCKET } from "@/lib/migration-case-store";
import { downloadPrivateObject } from "@/lib/server-json-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "signed-document.pdf";
}

/** Operator download of the platform-signed rendition (with certificate page). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  const { id } = await params;
  const lookup = await findDocumentSignature(id, "partner_proposal", null);
  if (!lookup.available || !lookup.row?.signed_storage_path) {
    return NextResponse.json({ ok: false, error: "No platform-signed document on record." }, { status: 404 });
  }
  const file = await downloadPrivateObject(MIGRATION_CASE_DOCUMENT_BUCKET, lookup.row.signed_storage_path);
  if (!file) {
    return NextResponse.json({ ok: false, error: "Stored signed document not found." }, { status: 404 });
  }
  const name = lookup.row.signed_storage_path.split("/").pop() ?? "signed-document.pdf";
  return new NextResponse(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename(name)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

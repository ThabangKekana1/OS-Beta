import { NextRequest, NextResponse } from "next/server";
import {
  findMigrationCaseByToken,
  getMigrationCaseRelations,
  isMigrationCaseWebsiteRequest,
  MIGRATION_CASE_DOCUMENT_BUCKET,
} from "@/lib/migration-case-store";
import { downloadPrivateObject } from "@/lib/server-json-store";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { token } = await params;
  const limit = await consumeRateLimit({
    scope: "migration-case-eoi-pdf",
    key: `${requestIp(request)}:${token.slice(-10)}`,
    limit: 20,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many download requests. Try again later." }, { status: 429 });
  }

  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }
    const relations = await getMigrationCaseRelations(caseRow);
    if (!relations.eoi?.pdf_storage_path) {
      return NextResponse.json({ ok: false, error: "Signed EOI receipt not found." }, { status: 404 });
    }
    const object = await downloadPrivateObject(
      MIGRATION_CASE_DOCUMENT_BUCKET,
      relations.eoi.pdf_storage_path,
    );
    if (!object) {
      return NextResponse.json({ ok: false, error: "Signed EOI receipt not found." }, { status: 404 });
    }
    const safeReference = caseRow.public_reference.toLowerCase();
    return new NextResponse(await object.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="foundation-1-eoi-${safeReference}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to download the EOI receipt.",
      },
      { status: 500 },
    );
  }
}

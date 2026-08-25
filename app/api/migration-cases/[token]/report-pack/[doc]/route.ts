import { NextRequest, NextResponse } from "next/server";
import {
  findMigrationCaseByToken,
  getMigrationCaseRelations,
  isMigrationCaseWebsiteRequest,
} from "@/lib/migration-case-store";
import { isReportPackDocumentId } from "@/lib/report-pack-core";
import { buildReportPackDocument } from "@/lib/report-pack-html";
import {
  loadStoredReportPackDocument,
  storeReportPackDocument,
} from "@/lib/report-pack-store";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/**
 * The report-time document pack: generated on demand the moment the
 * Migration Report is published. Two example bills, the report itself and
 * The First Light Certificate specimen. No storage, no partner names.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; doc: string }> },
) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { token, doc } = await params;
  if (!isReportPackDocumentId(doc)) {
    return NextResponse.json({ ok: false, error: "Unknown document." }, { status: 404 });
  }
  const limit = await consumeRateLimit({
    scope: "migration-case-report-pack",
    key: `${requestIp(request)}:${token.slice(-10)}`,
    limit: 40,
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
    if (!relations.proposal) {
      return NextResponse.json(
        { ok: false, error: "Your document pack opens when your Migration Report is published." },
        { status: 409 },
      );
    }
    const filename = `foundation-1-${doc}-${caseRow.public_reference.toLowerCase()}.pdf`;
    let bytes = await loadStoredReportPackDocument(caseRow, relations.proposal, doc);
    if (!bytes) {
      // Not stored yet (older publishes): generate once and persist.
      const built = await buildReportPackDocument(doc, { caseRow, proposal: relations.proposal });
      bytes = built.bytes;
      storeReportPackDocument(caseRow, relations.proposal, doc, bytes).catch(() => undefined);
    }
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The document could not be generated.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

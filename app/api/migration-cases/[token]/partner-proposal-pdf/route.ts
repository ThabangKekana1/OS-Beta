import { NextRequest, NextResponse } from "next/server";
import {
  findMigrationCaseByToken,
  getMigrationCasePartnerProposal,
  isMigrationCaseWebsiteRequest,
  MIGRATION_CASE_DOCUMENT_BUCKET,
} from "@/lib/migration-case-store";
import { consumeRateLimit } from "@/lib/rate-limit";
import { downloadPrivateObject } from "@/lib/server-json-store";

export const runtime = "nodejs";

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "ufms-proposal.pdf";
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
    scope: "migration-case-partner-proposal-download",
    key: `${requestIp(request)}:${token.slice(-10)}`,
    limit: 30,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many downloads. Try again later." }, { status: 429 });
  }

  const caseRow = await findMigrationCaseByToken(token);
  if (!caseRow) return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
  const proposal = await getMigrationCasePartnerProposal(caseRow);
  if (!proposal) {
    return NextResponse.json({ ok: false, error: "Formal UFMS proposal not found." }, { status: 404 });
  }
  const signed = request.nextUrl.searchParams.get("signed") === "1";
  const path = signed ? proposal.signed_storage_path : proposal.issued_storage_path;
  const name = signed ? proposal.signed_original_name : proposal.issued_original_name;
  if (!path || !name) {
    return NextResponse.json({ ok: false, error: signed ? "Signed proposal not found." : "Issued proposal not found." }, { status: 404 });
  }
  const file = await downloadPrivateObject(MIGRATION_CASE_DOCUMENT_BUCKET, path);
  if (!file) return NextResponse.json({ ok: false, error: "Stored proposal file not found." }, { status: 404 });

  return new NextResponse(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename(name)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

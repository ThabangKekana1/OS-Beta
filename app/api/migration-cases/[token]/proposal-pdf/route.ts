import { NextRequest, NextResponse } from "next/server";
import { buildMigrationProposalPdf } from "@/lib/migration-proposal-pdf";
import type { F1Proposal } from "@/lib/f1-proposal";
import {
  findMigrationCaseByToken,
  getMigrationCaseRelations,
  isMigrationCaseWebsiteRequest,
} from "@/lib/migration-case-store";
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
    scope: "migration-case-proposal-pdf",
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
    if (!relations.proposal) {
      return NextResponse.json(
        { ok: false, error: "The bill-audited proposal has not been completed." },
        { status: 409 },
      );
    }
    if (!relations.eoi) {
      return NextResponse.json(
        { ok: false, error: "The full proposal unlocks after the post-proposal Expression of Interest is signed." },
        { status: 409 },
      );
    }

    const proposal = relations.proposal.proposal_snapshot as unknown as F1Proposal;
    if (!proposal || typeof proposal.businessName !== "string" || !proposal.ufmsOption) {
      throw new Error("The stored proposal snapshot is invalid.");
    }
    const result = buildMigrationProposalPdf(proposal);
    return new NextResponse(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Foundation-1-Pages": String(result.pageCount),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to build the proposal PDF.",
      },
      { status: 500 },
    );
  }
}

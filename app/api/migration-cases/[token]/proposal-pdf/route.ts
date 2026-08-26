import { NextRequest, NextResponse } from "next/server";
import { buildMigrationProposalPdf } from "@/lib/migration-proposal-pdf";
import type { F1Proposal } from "@/lib/f1-proposal";
import {
  findMigrationCaseByToken,
  getMigrationCaseRelations,
  isMigrationCaseWebsiteRequest,
  MIGRATION_CASE_DOCUMENT_BUCKET,
} from "@/lib/migration-case-store";
import { loadStoredReportPackDocument } from "@/lib/report-pack-store";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

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

    const proposalRow = relations.proposal;

    // One-action publishes carry no upload: the generated Migration Report,
    // stored with the pack at publish, is the document of record.
    if (proposalRow.source === "operator" && !proposalRow.document_storage_path) {
      const stored = await loadStoredReportPackDocument(caseRow, proposalRow, "migration-report");
      if (stored) {
        return new NextResponse(Buffer.from(stored), {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="foundation-1-migration-report-${caseRow.public_reference.toLowerCase()}.pdf"`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }

    // Phase 1 assessments are produced off-platform and stored as a document.
    if (proposalRow.source === "operator" && proposalRow.document_storage_path) {
      const client = getSupabaseAdminClient();
      if (!client) throw new Error("Private document storage is unavailable.");
      const download = await client.storage
        .from(MIGRATION_CASE_DOCUMENT_BUCKET)
        .download(proposalRow.document_storage_path);
      if (download.error || !download.data) {
        throw new Error("The stored assessment could not be read.");
      }
      const bytes = Buffer.from(await download.data.arrayBuffer());
      const filename = proposalRow.document_original_name
        || `foundation-1-assessment-${caseRow.public_reference}.pdf`;
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          "Content-Type": proposalRow.document_content_type || "application/pdf",
          "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const proposal = proposalRow.proposal_snapshot as unknown as F1Proposal;
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

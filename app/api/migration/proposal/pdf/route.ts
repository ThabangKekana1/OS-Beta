import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  buildDevMigrationPreviewProposal,
  isDevMigrationPreviewCredentials,
} from "@/lib/dev-migration-preview";
import { authenticateMigrationProfileLead } from "@/lib/migration-profile-lead";
import { buildF1Proposal } from "@/lib/f1-proposal";
import { buildMigrationProposalPdf } from "@/lib/migration-proposal-pdf";
import { countDocumentsByType } from "@/lib/document-taxonomy";
import { proposalReadiness } from "@/lib/utility-bill-analysis";
import { buildStoredBillPortfolio } from "@/lib/utility-bill-storage";

export const runtime = "nodejs";

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  let payload: { profileId?: unknown; accessCode?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const limit = await consumeRateLimit({
    scope: "migration-proposal-pdf",
    key: `${requestIp(request)}:${String(payload.profileId ?? "")}`,
    limit: 20,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many document requests. Try again later." }, { status: 429 });
  }

  let proposal;
  if (isDevMigrationPreviewCredentials(payload.profileId, payload.accessCode)) {
    proposal = buildDevMigrationPreviewProposal();
  } else {
    const auth = await authenticateMigrationProfileLead(payload);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    const { lead } = auth;
    const documentCounts = countDocumentsByType(lead.documents);
    const { portfolio } = await buildStoredBillPortfolio(lead.documents);
    const readiness = proposalReadiness(portfolio, (documentCounts.signed_eoi ?? 0) >= 1, {
      requireSignedEoi: false,
    });
    if (!readiness.ready || !portfolio.averageMonthlySpendExVat || !portfolio.averageMonthlyKwh || !portfolio.designBasis) {
      return NextResponse.json(
        { ok: false, error: readiness.blockers[0] ?? "The Foundation-1 assessment is not ready for download." },
        { status: 409 },
      );
    }
    proposal = buildF1Proposal({
      businessName: lead.company,
      contactName: lead.contactName,
      clientProfileId: lead.clientProfileId,
      siteCity: lead.siteCity,
      province: lead.province,
      utilityProvider: lead.utilityProvider,
      monthlySpend: portfolio.averageMonthlySpendExVat,
      monthlyKwh: portfolio.averageMonthlyKwh,
      billPortfolio: portfolio,
    });
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
}

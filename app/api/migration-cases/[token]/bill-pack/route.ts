import { NextRequest, NextResponse } from "next/server";
import {
  COMPLETE_BILL_PACK_MAX_FILES,
  COMPLETE_BILL_PACK_MAX_TOTAL_BYTES,
  addMigrationBillFiles,
} from "@/lib/migration-case-bill-pack";
import {
  findMigrationCaseByToken,
  getMigrationCaseRelations,
  isMigrationCaseWebsiteRequest,
  publicMigrationCaseState,
} from "@/lib/migration-case-store";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";
import { isOperatorAssessmentMode } from "@/lib/simulated-bill-extraction";

export const runtime = "nodejs";

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { token } = await params;
  const limit = await consumeRateLimit({
    scope: "migration-case-bill-pack",
    key: `${requestIp(request)}:${token.slice(-10)}`,
    limit: 8,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many bill-pack attempts. Try again later." }, { status: 429 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > COMPLETE_BILL_PACK_MAX_TOTAL_BYTES + 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "The complete bill pack is larger than 72MB." },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not read the bill pack. Send multipart form data." },
      { status: 400 },
    );
  }
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  if (!files.length) {
    return NextResponse.json(
      { ok: false, error: "Select at least one utility bill file." },
      { status: 400 },
    );
  }
  if (files.length > COMPLETE_BILL_PACK_MAX_FILES) {
    return NextResponse.json(
      { ok: false, error: `Add at most ${COMPLETE_BILL_PACK_MAX_FILES} files at a time.` },
      { status: 400 },
    );
  }

  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }
    const result = await addMigrationBillFiles(caseRow, files);
    const relations = await getMigrationCaseRelations(result.caseRow);
    const state = publicMigrationCaseState(result.caseRow, relations);
    const proposalReady = Boolean(result.proposal);

    // Every batch is decided immediately (proposal or review desk), so the
    // operator hears about each outcome exactly once. In operator-assessment
    // mode the pack is simply received and the library raises that notice.
    if (!isOperatorAssessmentMode()) {
      void createNotification({
        audience: "admin",
        kind: "customer_uploaded_document",
        title: proposalReady
          ? `Proposal completed: ${caseRow.business_name}`
          : `Bill pack on the review desk: ${caseRow.business_name}`,
        body: proposalReady
          ? `${result.billPack.recognised_period_count} billing periods validated and the bill-audited proposal was completed automatically.`
          : `${result.billPack.recognised_period_count} billing periods recognised automatically from ${result.analyses.length} file(s). ${result.billPack.blockers[0] ?? "Complete the audit manually."}`,
        link: "/admin/migration-cases",
        metadata: {
          migrationCaseId: caseRow.id,
          publicReference: caseRow.public_reference,
          billPackId: result.billPack.id,
          proposalId: result.proposal?.id ?? null,
          recognisedBillingPeriods: result.billPack.recognised_period_count,
          blockers: result.billPack.blockers,
        },
      });
    }

    return NextResponse.json({
      ...state,
      upload: {
        receivedFiles: files.length,
        analysedFiles: result.analyses.length,
        proposalCompleted: proposalReady,
        progress: result.progress,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add the utility bills.";
    const clientError = /submit|select|supported|empty|larger|duplicate|already|locked|at a time|sign the/i.test(message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: clientError ? 400 : 500 },
    );
  }
}

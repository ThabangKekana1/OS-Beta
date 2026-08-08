import { NextRequest, NextResponse } from "next/server";
import { proceedTransition } from "@/lib/document-signing";
import {
  findDocumentSignature,
  publicDocumentSignature,
  updateDocumentSignature,
} from "@/lib/document-signing-store";
import {
  findMigrationCaseByToken,
  getMigrationCasePartnerProposal,
  getMigrationCaseRelations,
  isMigrationCaseWebsiteRequest,
  publicMigrationCaseState,
  recordMigrationCaseEvent,
  updateMigrationCase,
} from "@/lib/migration-case-store";
import { sendCaseLifecycleMessage } from "@/lib/case-lifecycle";
import { createNotification } from "@/lib/notifications";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/**
 * POST — the client's PROCEED after signing in the platform: marks the
 * signature record `submitted_by_client`, promotes the platform-signed
 * rendition into the partner-proposal signed slot (the same slot the manual
 * upload used), advances the case and notifies the operator through the same
 * rails as every other lifecycle moment.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { token } = await params;
  const limit = await consumeRateLimit({
    scope: "migration-case-sign-document-proceed",
    key: `${requestIp(request)}:${token.slice(-10)}`,
    limit: 8,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again later." }, { status: 429 });
  }

  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }
    const proposal = await getMigrationCasePartnerProposal(caseRow);
    if (!proposal) {
      return NextResponse.json({ ok: false, error: "No signable document has been issued to this case." }, { status: 409 });
    }
    const lookup = await findDocumentSignature(caseRow.id, "partner_proposal", proposal.id);
    if (!lookup.available || !lookup.row) {
      return NextResponse.json(
        { ok: false, error: "Sign the document in the platform before proceeding." },
        { status: 409 },
      );
    }

    let transition: ReturnType<typeof proceedTransition>;
    try {
      transition = proceedTransition(lookup.row);
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "The document is not ready to submit." },
        { status: 409 },
      );
    }

    const signature = await updateDocumentSignature(lookup.row.id, transition);
    const submittedAt = transition.submitted_at;

    // Promote the platform-signed rendition into the same signed slot the
    // manual return-upload flow used, so KYC, admin files and downloads all
    // keep working unchanged.
    if (!proposal.signed_at) {
      const client = getSupabaseAdminClient();
      if (!client) throw new Error("Supabase admin configuration is unavailable.");
      const { error } = await client
        .from("migration_case_partner_proposals")
        .update({
          status: "signed",
          signed_at: submittedAt,
          signed_original_name: (signature.signed_storage_path ?? "signed.pdf").split("/").pop()?.slice(0, 220) ?? "signed.pdf",
          signed_storage_path: signature.signed_storage_path,
          signed_content_type: "application/pdf",
          signed_file_size_bytes: signature.signed_file_size_bytes,
          signed_sha256: signature.signed_sha256,
        })
        .eq("id", proposal.id)
        .is("signed_at", null);
      if (error) throw new Error(error.message);
    }

    const updatedCase = await updateMigrationCase(caseRow.id, {
      stage: "partner_proposal_signed",
      partner_proposal_signed_at: submittedAt,
    });

    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: "partner_proposal_signed",
      actorType: "client",
      detail: "Client signed the formal proposal in the platform (every page initialled) and submitted it. Direct KYC handoff opened.",
      metadata: {
        partnerProposalId: proposal.id,
        signatureId: signature.id,
        sourceSha256: signature.source_sha256,
        signedSha256: signature.signed_sha256,
        pageCount: signature.page_count,
        signedInPlatform: true,
      },
    }).catch(() => undefined);

    void sendCaseLifecycleMessage(
      updatedCase,
      "partner_proposal_signed",
      {},
      `${proposal.id}:platform-signed`,
    ).catch(() => undefined);

    void createNotification({
      audience: "admin",
      kind: "customer_uploaded_document",
      title: `${caseRow.public_reference}: client signed & submitted the formal proposal`,
      body: `${caseRow.business_name} initialled all ${signature.page_count ?? "?"} pages and signed in the platform. Signed SHA-256 ${signature.signed_sha256?.slice(0, 12) ?? "n/a"}…`,
      link: "/admin/migration-cases",
    }).catch(() => undefined);

    const relations = await getMigrationCaseRelations(updatedCase);
    return NextResponse.json(
      {
        ...publicMigrationCaseState(updatedCase, relations),
        signing: publicDocumentSignature(signature),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to submit the signed document." },
      { status: 500 },
    );
  }
}

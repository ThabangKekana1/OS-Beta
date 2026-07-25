import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildMigrationCaseEoiPdf,
  MIGRATION_CASE_EOI_DECLARATIONS_VERSION,
} from "@/lib/migration-case-eoi-pdf";
import {
  findMigrationCaseByToken,
  getMigrationCaseRelations,
  isMigrationCaseWebsiteRequest,
  migrationCaseClientFingerprint,
  MIGRATION_CASE_DOCUMENT_BUCKET,
  publicMigrationCaseState,
  recordMigrationCaseEvent,
  updateMigrationCase,
} from "@/lib/migration-case-store";
import { ensurePrivateBucket } from "@/lib/server-json-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { consumeRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";

function cleanString(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

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
    scope: "migration-case-eoi",
    key: `${requestIp(request)}:${token.slice(-10)}`,
    limit: 8,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many signing attempts. Try again later." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const signerName = cleanString(body.signerName, 160);
  const signerPosition = cleanString(body.signerPosition, 160);
  const companyRegistrationNumber = cleanString(body.companyRegistrationNumber, 100) || null;
  if (signerName.length < 2 || signerPosition.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Enter the authorised signer's full name and position." },
      { status: 400 },
    );
  }
  if (body.authorityConfirmed !== true || body.nonBindingTermsAccepted !== true) {
    return NextResponse.json(
      { ok: false, error: "Confirm signing authority and the non-binding EOI terms." },
      { status: 400 },
    );
  }

  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }
    let relations = await getMigrationCaseRelations(caseRow);
    if (relations.eoi) {
      const repairedCase = caseRow.stage === "eoi_signed"
        ? caseRow
        : await updateMigrationCase(caseRow.id, {
            stage: "eoi_signed",
            eoi_signed_at: relations.eoi.signed_at,
          });
      return NextResponse.json(publicMigrationCaseState(repairedCase, relations));
    }
    if (
      (caseRow.stage !== "proposal_ready" && caseRow.stage !== "proposal_not_recommended")
      || !relations.proposal
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "The Expression of Interest becomes available only after the bill-audited proposal is completed.",
        },
        { status: 409 },
      );
    }

    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase admin configuration is unavailable.");
    const signatureId = randomUUID();
    const signedAt = new Date().toISOString();
    const proposal = relations.proposal;
    const pdf = buildMigrationCaseEoiPdf({
      signatureId,
      caseReference: caseRow.public_reference,
      proposalId: proposal.id,
      proposalGeneratedAt: proposal.created_at,
      companyName: caseRow.business_name,
      companyRegistrationNumber,
      signerName,
      signerPosition,
      signedAt,
      economicallyPositive: proposal.economically_positive,
      yearOneMonthlyDifference: proposal.year_one_monthly_difference,
      tenYearDifference: proposal.ten_year_difference,
    });
    const pdfHash = createHash("sha256").update(pdf.bytes).digest("hex");
    const storage = await ensurePrivateBucket(MIGRATION_CASE_DOCUMENT_BUCKET);
    if (!storage) throw new Error("Private document storage is unavailable.");
    const storagePath = `${caseRow.public_reference}/eoi/${signatureId}.pdf`;
    const { error: uploadError } = await storage.storage
      .from(MIGRATION_CASE_DOCUMENT_BUCKET)
      .upload(storagePath, pdf.bytes, {
        upsert: false,
        contentType: "application/pdf",
        cacheControl: "0",
      });
    if (uploadError) throw new Error(uploadError.message);

    const { data: inserted, error: insertError } = await client
      .from("migration_case_eois")
      .insert({
        id: signatureId,
        case_id: caseRow.id,
        proposal_id: proposal.id,
        signed_at: signedAt,
        signer_name: signerName,
        signer_position: signerPosition,
        company_registration_number: companyRegistrationNumber,
        authority_confirmed: true,
        non_binding_terms_accepted: true,
        declarations_version: MIGRATION_CASE_EOI_DECLARATIONS_VERSION,
        client_ip_hash: migrationCaseClientFingerprint(requestIp(request)),
        user_agent: cleanString(request.headers.get("user-agent"), 500) || null,
        pdf_storage_path: storagePath,
        pdf_sha256: pdfHash,
      })
      .select("*")
      .single();
    if (insertError || !inserted) {
      if (insertError?.code === "23505") {
        relations = await getMigrationCaseRelations(caseRow);
        return NextResponse.json(publicMigrationCaseState(caseRow, relations));
      }
      throw new Error(insertError?.message ?? "Unable to record the Expression of Interest.");
    }

    const updatedCase = await updateMigrationCase(caseRow.id, {
      stage: "eoi_signed",
      eoi_signed_at: signedAt,
    });
    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: "post_proposal_eoi_signed",
      actorType: "client",
      detail: `${signerName} signed the non-binding Expression of Interest after the proposal was completed.`,
      metadata: {
        signatureId,
        proposalId: proposal.id,
        declarationsVersion: MIGRATION_CASE_EOI_DECLARATIONS_VERSION,
      },
    }).catch(() => undefined);

    void sendEmail({
      to: caseRow.contact_email,
      replyTo: "support@foundation-1.co.za",
      subject: `${caseRow.public_reference}: Expression of Interest received`,
      text: [
        `Hi ${caseRow.contact_name},`,
        "",
        `Foundation-1 has recorded the non-binding Expression of Interest for ${caseRow.business_name}.`,
        "",
        "Your full bill-audited migration proposal is now unlocked in the secure case workspace.",
        "",
        `Signed by: ${signerName}, ${signerPosition}`,
        `Signed at: ${signedAt}`,
        `Case: ${caseRow.public_reference}`,
        "",
        "The signed EOI certificate is attached for your records.",
        "",
        "Foundation-1 (Pty) Ltd",
      ].join("\n"),
      attachments: [
        {
          filename: pdf.filename,
          content: Buffer.from(pdf.bytes).toString("base64"),
          contentType: "application/pdf",
        },
      ],
    }).catch(() => undefined);

    void createNotification({
      audience: "admin",
      kind: "eoi_signed",
      title: `Post-proposal EOI signed: ${caseRow.business_name}`,
      body: `${signerName} signed after reviewing the completed bill-audited proposal.`,
      link: "/admin/migration-cases",
      metadata: {
        migrationCaseId: caseRow.id,
        publicReference: caseRow.public_reference,
        proposalId: proposal.id,
        signatureId,
      },
    });

    relations = await getMigrationCaseRelations(updatedCase);
    return NextResponse.json(publicMigrationCaseState(updatedCase, relations));
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unable to sign the Expression of Interest.",
      },
      { status: 500 },
    );
  }
}

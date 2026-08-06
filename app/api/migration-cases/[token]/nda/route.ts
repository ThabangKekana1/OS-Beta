import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { MIGRATION_CASE_NDA_VERSION } from "@/lib/migration-case-agreements";
import { buildMigrationCaseNdaPdf } from "@/lib/migration-case-nda-pdf";
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
import { lifecycleReplyTo } from "@/lib/case-lifecycle";
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
    scope: "migration-case-nda",
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
  const signerPosition = cleanString(body.signerPosition, 120);
  if (signerName.length < 2) {
    return NextResponse.json({ ok: false, error: "Enter the signer's full name." }, { status: 400 });
  }
  if (body.popiaConsent !== true || body.sharingConsent !== true) {
    return NextResponse.json(
      { ok: false, error: "Confirm the POPIA processing terms and the limited sharing consent." },
      { status: 400 },
    );
  }

  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }
    let relations = await getMigrationCaseRelations(caseRow);
    if (relations.nda) {
      return NextResponse.json(publicMigrationCaseState(caseRow, relations));
    }
    if (!caseRow.profile_completed_at || !caseRow.client_profile) {
      return NextResponse.json(
        { ok: false, error: "Complete the business profile before signing the NDA." },
        { status: 409 },
      );
    }

    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase admin configuration is unavailable.");
    const ndaId = randomUUID();
    const signedAt = new Date().toISOString();
    const position = signerPosition || caseRow.client_profile.signerPosition;
    const pdf = buildMigrationCaseNdaPdf({
      ndaId,
      caseReference: caseRow.public_reference,
      companyName: caseRow.business_name,
      companyRegistrationNumber: caseRow.client_profile.registrationNumber,
      physicalAddress: caseRow.client_profile.physicalAddress,
      clientContactName: caseRow.contact_name,
      clientEmail: caseRow.contact_email,
      clientPhone: caseRow.contact_phone,
      signerName,
      signerPosition: position,
      signedAt,
    });
    const pdfHash = createHash("sha256").update(pdf.bytes).digest("hex");
    const storage = await ensurePrivateBucket(MIGRATION_CASE_DOCUMENT_BUCKET);
    if (!storage) throw new Error("Private document storage is unavailable.");
    const storagePath = `${caseRow.public_reference}/nda/${ndaId}.pdf`;
    const { error: uploadError } = await storage.storage
      .from(MIGRATION_CASE_DOCUMENT_BUCKET)
      .upload(storagePath, pdf.bytes, {
        upsert: false,
        contentType: "application/pdf",
        cacheControl: "0",
      });
    if (uploadError) throw new Error(uploadError.message);

    const { data: inserted, error: insertError } = await client
      .from("migration_case_ndas")
      .insert({
        id: ndaId,
        case_id: caseRow.id,
        signed_at: signedAt,
        signer_name: signerName,
        signer_position: position,
        popia_consent: true,
        sharing_consent: true,
        agreement_version: MIGRATION_CASE_NDA_VERSION,
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
      throw new Error(insertError?.message ?? "Unable to record the NDA.");
    }

    const updatedCase = await updateMigrationCase(caseRow.id, {
      nda_signed_at: signedAt,
      active_nda_id: ndaId,
    });
    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: "nda_signed",
      actorType: "client",
      detail: `${signerName} signed the mutual NDA with POPIA and limited-sharing consent.`,
      metadata: { ndaId, agreementVersion: MIGRATION_CASE_NDA_VERSION },
    }).catch(() => undefined);

    void sendEmail({
      to: caseRow.contact_email,
      replyTo: lifecycleReplyTo(),
      subject: `${caseRow.public_reference}: NDA signed and recorded`,
      text: [
        `Hi ${caseRow.contact_name},`,
        "",
        `The mutual Non-Disclosure and POPIA Consent Agreement for ${caseRow.business_name} is signed by both parties and recorded.`,
        "",
        "What it covers:",
        "  •  Both parties keep each other's information confidential.",
        "  •  Foundation-1 processes your information under POPIA, for this case only.",
        "  •  Only your utility bills and signed Expression of Interest may be shared — and only with the funding bank and the wheeling provider's engineers.",
        "",
        "The signed agreement is attached. Next step: upload your utility bills in the secure case.",
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
      kind: "customer_uploaded_document",
      title: `NDA signed: ${caseRow.business_name}`,
      body: `${signerName} (${position}) signed the NDA. Bill pack is the next gate.`,
      link: "/admin/migration-cases",
      metadata: { migrationCaseId: caseRow.id, publicReference: caseRow.public_reference, ndaId },
    });

    relations = await getMigrationCaseRelations(updatedCase);
    return NextResponse.json(publicMigrationCaseState(updatedCase, relations));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to record the NDA." },
      { status: 500 },
    );
  }
}

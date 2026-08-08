import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildSignedDocumentPdf,
  DOCUMENT_SIGNING_VERSION,
  isValidInitials,
  normalisePageInitials,
  renderPdfPages,
  sha256Hex,
  type PageInitialRecord,
} from "@/lib/document-signing";
import {
  findDocumentSignature,
  insertDocumentSignature,
  publicDocumentSignature,
  updateDocumentSignature,
} from "@/lib/document-signing-store";
import {
  findMigrationCaseByToken,
  getMigrationCasePartnerProposal,
  isMigrationCaseWebsiteRequest,
  MIGRATION_CASE_DOCUMENT_BUCKET,
  recordMigrationCaseEvent,
  type MigrationCaseRow,
} from "@/lib/migration-case-store";
import { createNotification } from "@/lib/notifications";
import { consumeRateLimit } from "@/lib/rate-limit";
import { downloadPrivateObject, uploadPrivateObject } from "@/lib/server-json-store";

export const runtime = "nodejs";
export const maxDuration = 120;

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function cleanString(value: unknown, maxLength = 200) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

/**
 * The signable funder document for a case. Today that is the issued formal
 * partner proposal; the signature service itself is generic
 * (`lib/document-signing.ts`) so term sheets plug in by adding a resolver.
 */
async function resolveSignableDocument(caseRow: MigrationCaseRow) {
  const proposal = await getMigrationCasePartnerProposal(caseRow);
  if (!proposal) return null;
  return {
    kind: "partner_proposal" as const,
    ref: proposal.id,
    title: "Formal pathway proposal",
    fileName: proposal.issued_original_name,
    issuedAt: proposal.issued_at,
    storagePath: proposal.issued_storage_path,
    sha256: proposal.issued_sha256,
    alreadySignedOffPlatform: Boolean(proposal.signed_at),
    proposal,
  };
}

/**
 * GET — signing status for the case's signable document; `?previews=1` adds
 * server-rendered page images (data URLs) for the page-by-page review flow.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { token } = await params;
  const withPreviews = request.nextUrl.searchParams.get("previews") === "1";
  const limit = await consumeRateLimit({
    scope: withPreviews ? "migration-case-sign-document-previews" : "migration-case-sign-document",
    key: `${requestIp(request)}:${token.slice(-10)}`,
    limit: withPreviews ? 12 : 60,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }
    const document = await resolveSignableDocument(caseRow);
    if (!document) {
      return NextResponse.json(
        { ok: true, available: false, reason: "no_document" },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const lookup = await findDocumentSignature(caseRow.id, document.kind, document.ref);
    if (!lookup.available) {
      return NextResponse.json(
        { ok: true, available: false, reason: "unprovisioned" },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    let pages: { page: number; width: number; height: number; dataUrl: string }[] | undefined;
    let pageCount = lookup.row?.page_count ?? null;
    if (withPreviews) {
      const file = await downloadPrivateObject(MIGRATION_CASE_DOCUMENT_BUCKET, document.storagePath);
      if (!file) {
        return NextResponse.json({ ok: false, error: "The issued document could not be retrieved." }, { status: 404 });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const rendered = await renderPdfPages(bytes, { scale: 1.4, withDataUrl: true });
      pages = rendered.map((page, index) => ({
        page: index + 1,
        width: page.width,
        height: page.height,
        dataUrl: page.dataUrl ?? "",
      }));
      pageCount = rendered.length;
    }

    return NextResponse.json(
      {
        ok: true,
        available: true,
        document: {
          kind: document.kind,
          title: document.title,
          fileName: document.fileName,
          issuedAt: document.issuedAt,
          sha256: document.sha256,
          pageCount,
          alreadySignedOffPlatform: document.alreadySignedOffPlatform,
        },
        signature: publicDocumentSignature(lookup.row),
        ...(pages ? { pages } : {}),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load the signing status." },
      { status: 500 },
    );
  }
}

/**
 * POST — the signing act. The client has reviewed every page, adopted a typed
 * signature and initials, and initialled each page (timestamps recorded per
 * page). Produces the immutable signed rendition, stores it alongside the
 * original, and records the audit row. The case advances only on PROCEED.
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
    scope: "migration-case-sign-document-submit",
    key: `${requestIp(request)}:${token.slice(-10)}`,
    limit: 6,
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
  const signerInitials = cleanString(body.initials, 8).toUpperCase();
  const pageInitialsInput = Array.isArray(body.pageInitials)
    ? (body.pageInitials as PageInitialRecord[])
    : [];
  if (signerName.length < 2) {
    return NextResponse.json({ ok: false, error: "Enter the authorised signer's full name." }, { status: 400 });
  }
  if (signerPosition.length < 2) {
    return NextResponse.json({ ok: false, error: "Enter the signer's position in the company." }, { status: 400 });
  }
  if (!isValidInitials(signerInitials)) {
    return NextResponse.json({ ok: false, error: "Adopt initials of one to four letters." }, { status: 400 });
  }
  if (body.authorityConfirmed !== true || body.adoptionConfirmed !== true) {
    return NextResponse.json(
      { ok: false, error: "Confirm signing authority and the adoption of your signature and initials." },
      { status: 400 },
    );
  }

  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }
    const document = await resolveSignableDocument(caseRow);
    if (!document) {
      return NextResponse.json({ ok: false, error: "No signable document has been issued to this case." }, { status: 409 });
    }
    if (document.alreadySignedOffPlatform) {
      return NextResponse.json(
        { ok: false, error: "A signed copy of this document is already on record for this case." },
        { status: 409 },
      );
    }
    const lookup = await findDocumentSignature(caseRow.id, document.kind, document.ref);
    if (!lookup.available) {
      return NextResponse.json(
        { ok: false, error: "The in-platform signing service is not provisioned on this environment yet." },
        { status: 503 },
      );
    }
    if (lookup.row && lookup.row.status !== "awaiting_signature") {
      return NextResponse.json(
        { ok: false, error: "This document has already been signed in the platform." },
        { status: 409 },
      );
    }

    const file = await downloadPrivateObject(MIGRATION_CASE_DOCUMENT_BUCKET, document.storagePath);
    if (!file) {
      return NextResponse.json({ ok: false, error: "The issued document could not be retrieved." }, { status: 404 });
    }
    const sourceBytes = new Uint8Array(await file.arrayBuffer());
    const sourceSha256 = sha256Hex(sourceBytes);
    if (document.sha256 && sourceSha256 !== document.sha256) {
      return NextResponse.json(
        { ok: false, error: "The stored document no longer matches its issued fingerprint. Signing is blocked; contact Foundation-1." },
        { status: 409 },
      );
    }

    const signatureId = randomUUID();
    const signedAt = new Date().toISOString();
    const signerIp = requestIp(request);

    let signed: { bytes: Uint8Array; filename: string; pageCount: number; signedSha256: string };
    let pageInitials: PageInitialRecord[];
    try {
      // Render first so the page count is authoritative, then validate the
      // per-page initial records against it inside the same build.
      const probePages = await renderPdfPages(sourceBytes, { scale: 2 });
      pageInitials = normalisePageInitials(probePages.length, pageInitialsInput);
      const built = buildSignedDocumentPdf({
        pages: probePages,
        caseReference: caseRow.public_reference,
        companyName: caseRow.business_name,
        documentTitle: document.title,
        documentKind: document.kind,
        sourceSha256,
        signatureId,
        signerName,
        signerPosition,
        signerInitials,
        signedAt,
        signerIp,
        pageInitials,
      });
      signed = { ...built, signedSha256: sha256Hex(built.bytes) };
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "The document could not be signed." },
        { status: 422 },
      );
    }

    const storagePath =
      `${caseRow.public_reference}/signed-documents/${signatureId}-${signed.filename}`;
    const upload = new File([Buffer.from(signed.bytes)], signed.filename, { type: "application/pdf" });
    const stored = await uploadPrivateObject(MIGRATION_CASE_DOCUMENT_BUCKET, storagePath, upload);
    if (!stored) throw new Error("Private document storage is unavailable.");

    const auditFields = {
      status: "signed" as const,
      signer_name: signerName,
      signer_position: signerPosition,
      signer_initials: signerInitials,
      signer_ip: signerIp,
      page_initials: pageInitials,
      page_count: signed.pageCount,
      signed_at: signedAt,
      signed_storage_path: storagePath,
      signed_sha256: signed.signedSha256,
      signed_file_size_bytes: signed.bytes.byteLength,
      signing_version: DOCUMENT_SIGNING_VERSION,
    };
    const row = lookup.row
      ? await updateDocumentSignature(lookup.row.id, auditFields)
      : await insertDocumentSignature({
          case_id: caseRow.id,
          document_kind: document.kind,
          document_ref: document.ref,
          document_title: document.title,
          source_storage_path: document.storagePath,
          source_sha256: sourceSha256,
          submitted_at: null,
          ...auditFields,
        });

    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: "document_signed_in_platform",
      actorType: "client",
      detail: `${document.title} initialled on all ${signed.pageCount} pages and signed in the platform. Awaiting the client's submission.`,
      metadata: {
        signatureId,
        documentKind: document.kind,
        documentRef: document.ref,
        pageCount: signed.pageCount,
        sourceSha256,
        signedSha256: signed.signedSha256,
      },
    }).catch(() => undefined);

    void createNotification({
      audience: "admin",
      kind: "system",
      title: `${caseRow.public_reference}: document signed in platform`,
      body: `${caseRow.business_name} signed the ${document.title.toLowerCase()} (${signed.pageCount} pages initialled). Awaiting their submission.`,
      link: "/admin/migration-cases",
      email: false,
    }).catch(() => undefined);

    return NextResponse.json(
      { ok: true, signature: publicDocumentSignature(row) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to sign the document." },
      { status: 500 },
    );
  }
}

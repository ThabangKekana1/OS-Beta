import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import {
  MIGRATION_CASE_DOCUMENT_BUCKET,
  recordMigrationCaseEvent,
  updateMigrationCase,
  type MigrationCaseRow,
} from "@/lib/migration-case-store";
import { createNotification } from "@/lib/notifications";
import { uploadPrivateObject } from "@/lib/server-json-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const PATHWAYS = new Set(["eden", "nightshade", "awaken"]);
const SOURCES = new Set(["funder_direct", "foundation1"]);
const TRACKER_STATUSES = new Set(["received", "signed", "declined"]);
/** Term-sheet tracker columns arrive with staged migration 20260816120000. */
const TRACKER_COLUMN_PATTERN = /status|received_at|status_updated_at/i;
const SCHEMA_MISSING_PATTERN = /column|schema cache/i;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function cleanFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 110) || "term-sheet.pdf";
}

/**
 * Records an issued term sheet — the deal-book event. Eden/Nightshade term
 * sheets are issued funder-direct to the client and confirmed here;
 * Awaken wheeling term sheets are issued by Foundation-1. A case may hold
 * more than one (Eden + Awaken).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  const { id } = await params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Send the term sheet details as form data." }, { status: 400 });
  }
  const pathway = cleanText(form.get("pathway"), 20).toLowerCase();
  const source = cleanText(form.get("source"), 30).toLowerCase();
  const dealValueRands = Number(form.get("dealValueRands"));
  const reference = cleanText(form.get("reference"), 120) || null;
  const notes = cleanText(form.get("notes"), 1_000) || null;
  const issuedAtRaw = cleanText(form.get("issuedAt"), 30);
  const receivedAtRaw = cleanText(form.get("receivedAt"), 30);
  const statusRaw = cleanText(form.get("status"), 20).toLowerCase();
  const file = form.get("file");

  if (!PATHWAYS.has(pathway)) {
    return NextResponse.json({ ok: false, error: "Choose the pathway: eden, nightshade or awaken." }, { status: 400 });
  }
  if (!SOURCES.has(source)) {
    return NextResponse.json({ ok: false, error: "Choose the source: funder_direct or foundation1." }, { status: 400 });
  }
  if (!Number.isFinite(dealValueRands) || dealValueRands <= 0) {
    return NextResponse.json(
      { ok: false, error: "Record the deal value in rands (capex incl. VAT for Eden/Nightshade; 10-year contracted value for Awaken)." },
      { status: 400 },
    );
  }
  const issuedAt = issuedAtRaw && !Number.isNaN(new Date(issuedAtRaw).getTime())
    ? new Date(issuedAtRaw).toISOString()
    : new Date().toISOString();
  const receivedAt = receivedAtRaw && !Number.isNaN(new Date(receivedAtRaw).getTime())
    ? new Date(receivedAtRaw).toISOString()
    : issuedAt;
  if (statusRaw && !TRACKER_STATUSES.has(statusRaw)) {
    return NextResponse.json({ ok: false, error: "Term-sheet status must be received, signed or declined." }, { status: 400 });
  }
  const trackerStatus = statusRaw || "received";
  if (file instanceof File) {
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ ok: false, error: "The term sheet file must be between 1 byte and 20MB." }, { status: 400 });
    }
  }

  try {
    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase admin configuration is unavailable.");
    const { data: caseRow, error: caseError } = await client
      .from("migration_cases")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (caseError) throw new Error(caseError.message);
    if (!caseRow) return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    const typedCase = caseRow as MigrationCaseRow;
    const handoffComplete = Boolean(typedCase.kyc_handed_off_at)
      || Boolean(typedCase.direct_kyc_confirmed_at); // legacy zero-custody cases
    if (!handoffComplete) {
      return NextResponse.json(
        { ok: false, error: "Record the official KYC handoff before recording a term sheet." },
        { status: 409 },
      );
    }

    let storedFile: {
      original_name: string;
      storage_path: string;
      content_type: string;
      file_size_bytes: number;
      sha256: string;
    } | null = null;
    if (file instanceof File) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const storagePath = `${typedCase.public_reference}/term-sheets/${pathway}-${Date.now()}-${cleanFileName(file.name)}`;
      const upload = new File([bytes], file.name, { type: file.type || "application/pdf" });
      await uploadPrivateObject(MIGRATION_CASE_DOCUMENT_BUCKET, storagePath, upload);
      storedFile = {
        original_name: file.name.slice(0, 220),
        storage_path: storagePath,
        content_type: file.type || "application/pdf",
        file_size_bytes: file.size,
        sha256,
      };
    }

    const baseRow = {
      case_id: typedCase.id,
      pathway,
      source,
      issued_at: issuedAt,
      deal_value_rands: dealValueRands,
      reference,
      notes,
      recorded_by: session.email ?? session.name ?? "admin",
      ...(storedFile ?? {}),
    };
    // Tracker columns are staged (20260816120000): try the full row, and if
    // the remote schema does not carry them yet, degrade to the base row.
    let insertResult = await client
      .from("migration_case_term_sheets")
      .insert({ ...baseRow, status: trackerStatus, received_at: receivedAt, status_updated_at: issuedAt })
      .select("id")
      .single();
    if (
      insertResult.error
      && TRACKER_COLUMN_PATTERN.test(insertResult.error.message)
      && SCHEMA_MISSING_PATTERN.test(insertResult.error.message)
    ) {
      insertResult = await client
        .from("migration_case_term_sheets")
        .insert(baseRow)
        .select("id")
        .single();
    }
    const { data: termSheet, error: termSheetError } = insertResult;
    if (termSheetError || !termSheet) {
      throw new Error(termSheetError?.message ?? "Unable to record the term sheet.");
    }

    await updateMigrationCase(typedCase.id, {
      stage: "term_sheet_issued",
      term_sheet_issued_at: typedCase.term_sheet_issued_at ?? issuedAt,
    });
    await recordMigrationCaseEvent({
      caseId: typedCase.id,
      eventType: "term_sheet_issued",
      actorType: "operator",
      detail: `${pathway === "awaken" ? "Awaken wheeling" : pathway === "nightshade" ? "Nightshade asset-finance" : "Eden"} term sheet recorded (${source === "funder_direct" ? "issued by the funder directly to the client" : "issued by Foundation-1"}).`,
      metadata: { termSheetId: termSheet.id, pathway, source, reference },
    }).catch(() => undefined);

    void createNotification({
      audience: "admin",
      kind: "system",
      title: `Term sheet: ${typedCase.business_name}`,
      body: `${pathway} term sheet recorded. The deal book has been updated.`,
      link: "/admin/migration-cases",
      metadata: { migrationCaseId: typedCase.id, publicReference: typedCase.public_reference, pathway },
    });

    return NextResponse.json({ ok: true, termSheetId: termSheet.id, issuedAt });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to record the term sheet." },
      { status: 500 },
    );
  }
}

/**
 * Term-sheet tracker: updates the status of a recorded term sheet
 * (received → signed | declined). Requires the staged tracker migration on
 * the target environment; degrades with a clear message when absent.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  const { id } = await params;
  let payload: { termSheetId?: unknown; status?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const termSheetId = cleanText(payload.termSheetId, 60);
  const status = cleanText(payload.status, 20).toLowerCase();
  if (!termSheetId) {
    return NextResponse.json({ ok: false, error: "Name the term sheet to update." }, { status: 400 });
  }
  if (!TRACKER_STATUSES.has(status)) {
    return NextResponse.json({ ok: false, error: "Term-sheet status must be received, signed or declined." }, { status: 400 });
  }

  try {
    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase admin configuration is unavailable.");
    const now = new Date().toISOString();
    const { data, error } = await client
      .from("migration_case_term_sheets")
      .update({ status, status_updated_at: now })
      .eq("id", termSheetId)
      .eq("case_id", id)
      .select("id,pathway,reference")
      .single();
    if (error) {
      if (TRACKER_COLUMN_PATTERN.test(error.message) && SCHEMA_MISSING_PATTERN.test(error.message)) {
        return NextResponse.json(
          { ok: false, error: "The term-sheet tracker migration (20260816120000) has not been applied to this environment yet." },
          { status: 409 },
        );
      }
      throw new Error(error.message);
    }
    if (!data) return NextResponse.json({ ok: false, error: "Term sheet not found on this case." }, { status: 404 });

    await recordMigrationCaseEvent({
      caseId: id,
      eventType: `term_sheet_${status}`,
      actorType: "operator",
      detail: status === "signed"
        ? "The client signed the term sheet. The deal is in the hard book."
        : status === "declined"
          ? "The term sheet was declined. The deal leaves the book; the case remains registered for reassessment."
          : "The term sheet was marked received.",
      metadata: { termSheetId, status },
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, termSheetId, status, statusUpdatedAt: now });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update the term sheet." },
      { status: 500 },
    );
  }
}

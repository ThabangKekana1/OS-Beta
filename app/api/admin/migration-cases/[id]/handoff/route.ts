import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { kycDocumentLabel } from "@/lib/migration-case-kyc";
import {
  latestKycDocumentsByType,
  recordMigrationCaseEvent,
  updateMigrationCase,
  type MigrationCaseKycDocumentRow,
  type MigrationCaseRow,
} from "@/lib/migration-case-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

/**
 * Official funder handoff of the verified KYC pack. Records the exact
 * recipient and per-document manifest (name + sha256) — the client-visible
 * release record and the anti-poaching evidence trail.
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
  let payload: { recipient?: unknown; note?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const recipient = cleanText(payload.recipient, 220);
  if (recipient.length < 3) {
    return NextResponse.json({ ok: false, error: "Record the exact recipient of the KYC pack." }, { status: 400 });
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
    if (!typedCase.kyc_verified_at) {
      return NextResponse.json(
        { ok: false, error: "Verify all six KYC documents before recording the handoff." },
        { status: 409 },
      );
    }
    if (typedCase.kyc_handed_off_at) {
      return NextResponse.json({ ok: false, error: "The handoff has already been recorded." }, { status: 409 });
    }

    const { data: documents, error: documentsError } = await client
      .from("migration_case_kyc_documents")
      .select("*")
      .eq("case_id", typedCase.id)
      .order("created_at", { ascending: false });
    if (documentsError) throw new Error(documentsError.message);
    const latest = latestKycDocumentsByType((documents ?? []) as MigrationCaseKycDocumentRow[]);
    const manifest = [...latest.values()]
      .filter((document) => document.status === "verified")
      .map((document) => ({
        documentType: document.document_type,
        label: kycDocumentLabel(document.document_type),
        fileName: document.original_name,
        sha256: document.sha256,
      }));
    if (manifest.length < 6) {
      return NextResponse.json(
        { ok: false, error: "The verified pack is incomplete; verify all six documents first." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    await updateMigrationCase(typedCase.id, {
      stage: "kyc_handed_off",
      kyc_handed_off_at: now,
    });
    await recordMigrationCaseEvent({
      caseId: typedCase.id,
      eventType: "kyc_handed_off",
      actorType: "operator",
      detail: `Verified six-item KYC pack officially handed off to ${recipient}.`,
      metadata: {
        recipient,
        note: cleanText(payload.note, 500) || null,
        manifest,
        releasedBy: session.email ?? session.name ?? "admin",
      },
    }).catch(() => undefined);

    return NextResponse.json({ ok: true, handedOffAt: now, manifestCount: manifest.length });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to record the handoff." },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { createDealRoom, isMissingDealRoomTables } from "@/lib/deal-rooms";
import { classifyDocumentTitle } from "@/lib/document-taxonomy";

export const runtime = "nodejs";

/**
 * POST /api/admin/dealrooms — create a funder deal room for a lead.
 * Body: { leadId: string, documentIds?: string[], funderName?, expiresAt? }
 * When documentIds is omitted, grants default to the validated pack:
 * signed EOI + utility bills + signed proposal + signed mandate. Bank KYC is
 * never held or shared by Foundation-1; the client sends it to UFMS directly.
 * Returns the one-time funder link. The token is NOT stored in plain text —
 * copy it now or create a new room.
 */
export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  let body: {
    leadId?: string;
    documentIds?: string[];
    funderName?: string;
    expiresAt?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "leadId is required." }, { status: 400 });
  }

  const { snapshot } = await readAdminStateSnapshot();
  const lead = snapshot.leads.find((entry) => entry.id === leadId || entry.clientProfileId === leadId);
  if (!lead) {
    return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });
  }

  // Default grant set: the bankable pack only — never "everything".
  const shareableTypes = new Set([
    "signed_eoi",
    "utility_bills",
    "signed_proposal",
    "signed_mandate",
  ]);
  const defaultDocumentIds = lead.documents
    .filter((document) => {
      const type = classifyDocumentTitle(document.title);
      return type !== null && shareableTypes.has(type);
    })
    .map((document) => document.id);

  const requestedDocumentIds =
    Array.isArray(body.documentIds) && body.documentIds.length > 0
      ? body.documentIds.filter((id): id is string => typeof id === "string")
      : defaultDocumentIds;
  const allowedIds = new Set(
    lead.documents
      .filter((document) => {
        const type = classifyDocumentTitle(document.title);
        return type !== null && shareableTypes.has(type);
      })
      .map((document) => document.id),
  );
  const documentIds = requestedDocumentIds.filter((id) => allowedIds.has(id));

  if (documentIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No grantable documents on this lead yet. Complete the pack first." },
      { status: 400 },
    );
  }

  const bankabilitySummary = {
    company: lead.company,
    stage: lead.stage,
    readinessScore: lead.readinessScore,
    monthlySpendZar: lead.migrationAssessment?.monthlySpend ?? null,
    preparedBy: "Foundation-1 (Pty) Ltd",
    preparedAt: new Date().toISOString(),
    documentCount: documentIds.length,
  };

  const created = await createDealRoom({
    leadId: lead.id,
    funderName: body.funderName,
    bankabilitySummary,
    documentIds,
    grantedBy: session.email ?? session.userId ?? "admin",
    expiresAt: body.expiresAt,
  });

  if ("error" in created) {
    const status = isMissingDealRoomTables({ message: created.error }) ? 501 : 500;
    return NextResponse.json(
      {
        ok: false,
        error:
          status === 501
            ? "Deal room tables are not deployed yet. Apply supabase/migrations/20260706120000_platform_kyc_dealrooms_associations.sql first."
            : created.error,
      },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    dealRoomId: created.room.id,
    link: `/dealroom/${created.token}`,
    grantedDocuments: documentIds.length,
    note: "Copy this link now — the token is stored only as a hash and cannot be shown again.",
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createNotification } from "@/lib/notifications";
import { consumeRateLimit } from "@/lib/rate-limit";
import { authenticateMigrationProfileLead } from "@/lib/migration-profile-lead";
import { normalizeAdminLead } from "@/lib/admin-storage";
import {
  readAdminLeadByIdFromDatabase,
  upsertSingleLeadToDatabase,
} from "@/lib/supabase-db-store";
import type { AdminLead } from "@/lib/admin-types";
import {
  UFMS_DIRECT_KYC_ITEMS,
  UFMS_KYC_ATTESTATION_VERSION,
  UFMS_KYC_RECIPIENT,
} from "@/lib/ufms-direct-kyc";

export const runtime = "nodejs";

type Payload = {
  profileId?: unknown;
  accessCode?: unknown;
  senderName?: unknown;
  sentDirectlyConfirmed?: unknown;
  recipientOnlyConfirmed?: unknown;
  allItemsAttachedConfirmed?: unknown;
  noFoundationOneCopyConfirmed?: unknown;
};

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 160) : "";
}

function hasSignedFormalProposal(lead: AdminLead) {
  const issued = lead.documents.some((document) =>
    /proposal \(admin issued\)|formal ufms proposal.*issued/i.test(document.title),
  );
  const signed = lead.documents.some((document) =>
    /signed (formal )?(ufms|nedbank).*proposal|signed proposal/i.test(document.title),
  );
  return issued && signed;
}

export async function POST(request: NextRequest) {
  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const limit = await consumeRateLimit({
    scope: "migration-direct-kyc-confirmation",
    key: `${requestIp(request)}:${String(payload.profileId ?? "")}`,
    limit: 8,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many confirmation attempts. Try again later." }, { status: 429 });
  }
  const senderName = cleanName(payload.senderName);
  if (senderName.length < 2) {
    return NextResponse.json({ ok: false, error: "Enter the name of the person who sent the email." }, { status: 400 });
  }
  if (
    payload.sentDirectlyConfirmed !== true
    || payload.recipientOnlyConfirmed !== true
    || payload.allItemsAttachedConfirmed !== true
    || payload.noFoundationOneCopyConfirmed !== true
  ) {
    return NextResponse.json(
      { ok: false, error: "Confirm every POPIA transmission statement." },
      { status: 400 },
    );
  }

  const auth = await authenticateMigrationProfileLead(payload);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const stored = await readAdminLeadByIdFromDatabase(auth.lead.id);
  if (!stored) return NextResponse.json({ ok: false, error: "Client profile not found." }, { status: 404 });
  const lead = normalizeAdminLead(stored);
  if (!hasSignedFormalProposal(lead)) {
    return NextResponse.json(
      { ok: false, error: "The signed formal UFMS proposal must be on record before the bank KYC handoff." },
      { status: 409 },
    );
  }
  if (lead.directKycSubmittedAt) {
    return NextResponse.json({ ok: true, alreadyConfirmed: true, confirmedAt: lead.directKycSubmittedAt });
  }

  const confirmedAt = new Date().toISOString();
  const updated: AdminLead = {
    ...lead,
    stage: lead.stage === "Disqualified" || lead.stage === "Onboarding Complete"
      ? lead.stage
      : "Direct KYC Submitted",
    directKycSubmittedAt: confirmedAt,
    directKycSubmittedBy: senderName,
    directKycRecipient: UFMS_KYC_RECIPIENT,
    directKycAttestationVersion: UFMS_KYC_ATTESTATION_VERSION,
    readinessScore: Math.max(lead.readinessScore, 92),
    nextAction: `Client confirmed direct KYC submission to ${UFMS_KYC_RECIPIENT}. Follow up on receipt; Foundation-1 holds no KYC files.`,
    lastTouched: "Just now",
    events: [
      {
        id: crypto.randomUUID(),
        title: "Direct UFMS KYC submission confirmed",
        detail: `${senderName} confirmed direct transmission of the ${UFMS_DIRECT_KYC_ITEMS.length}-item bank KYC pack to ${UFMS_KYC_RECIPIENT} only. Foundation-1 did not receive or store the documents.`,
        createdAt: confirmedAt,
        tone: "client",
      },
      ...lead.events,
    ],
  };
  await upsertSingleLeadToDatabase(updated, "client-direct-kyc-confirmation");

  void createNotification({
    audience: "admin",
    kind: "system",
    title: `Direct UFMS submission confirmed by ${updated.company}`,
    body: `${senderName} confirmed that the bank KYC pack was sent directly to ${UFMS_KYC_RECIPIENT}. No KYC files were received by Foundation-1. Follow up on receipt.`,
    link: `/admin/leads/${updated.clientProfileId}`,
    metadata: { leadId: updated.id, clientProfileId: updated.clientProfileId, confirmedAt },
  });

  return NextResponse.json({ ok: true, alreadyConfirmed: false, confirmedAt });
}

import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminLeadMutationSnapshot } from "@/lib/admin-state-store";
import { createNotification } from "@/lib/notifications";
import { makeId, timelineLabel } from "@/lib/formatting";
import { consumeRateLimit } from "@/lib/rate-limit";
import { promoteLeadStage } from "@/lib/lead-stage";
import type { AdminLead } from "@/lib/admin-types";

export const runtime = "nodejs";

function findLeadByMandateToken(leads: AdminLead[], token: string): AdminLead | null {
  return leads.find((lead) => lead.mandateSigningToken === token) ?? null;
}

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function toPublicMandateLead(lead: AdminLead) {
  return {
    clientProfileId: lead.clientProfileId,
    company: lead.company,
    businessRegistrationNumber: lead.businessRegistrationNumber,
    contactName: lead.contactName,
    stage: lead.stage,
    proposalAcceptedAt: lead.proposalAcceptedAt ?? null,
    mandateSignedBy: lead.mandateSignedBy ?? null,
    mandateSignedAt: lead.mandateSignedAt ?? null,
    isSigned: Boolean(lead.mandateSignedAt),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { backend, snapshot } = await readAdminStateSnapshot();
  const lead = findLeadByMandateToken(snapshot.leads, token);

  if (!lead) {
    return NextResponse.json({ ok: false, error: "Mandate link not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    backend,
    lead: toPublicMandateLead(lead),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ip = requestIp(request);
  const limit = await consumeRateLimit({
    scope: "mandate-signing",
    key: `${ip}:${token}`,
    limit: 12,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many signing attempts. Try again later." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    fullName?: unknown;
    consent?: unknown;
  } | null;
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim().slice(0, 120) : "";
  const consent = body?.consent === true;

  if (fullName.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Enter your full name as the authorised signatory." },
      { status: 400 },
    );
  }
  if (!consent) {
    return NextResponse.json(
      { ok: false, error: "Tick the consent box to sign the mandate." },
      { status: 400 },
    );
  }

  const { snapshot } = await readAdminStateSnapshot();
  const currentLead = findLeadByMandateToken(snapshot.leads, token);
  if (!currentLead) {
    return NextResponse.json({ ok: false, error: "Mandate link not found." }, { status: 404 });
  }

  // Idempotent: a mandate already on record is returned unchanged — no
  // duplicate stamps, events, or notifications.
  if (currentLead.mandateSignedAt) {
    return NextResponse.json({
      ok: true,
      alreadySigned: true,
      lead: toPublicMandateLead(currentLead),
    });
  }

  const signedAtIso = new Date().toISOString();
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const signedLead: AdminLead = {
    ...currentLead,
    stage: promoteLeadStage(currentLead, "Mandate Signed"),
    mandateSignedAt: signedAtIso,
    mandateSignedBy: fullName,
    readinessScore: Math.max(currentLead.readinessScore, 84),
    nextAction: "Coordinate the formal UFMS proposal. Bank KYC remains direct-to-UFMS only.",
    lastTouched: "Just now",
    events: [
      {
        id: makeId("event"),
        title: "Foundation-1 mandate signed",
        detail: `${fullName} signed the Foundation-1 coordination mandate. It excludes Foundation-1 custody of bank KYC documents, which remain direct-to-UFMS only. IP: ${ip}. User agent: ${userAgent.slice(0, 180)}.`,
        createdAt: timelineLabel(),
        tone: "client",
      },
      ...currentLead.events,
    ],
  };

  const nextLeads = snapshot.leads.map((lead) => (lead.id === signedLead.id ? signedLead : lead));

  // Delta write: upsert ONLY the changed lead — never a full-snapshot write.
  await writeAdminLeadMutationSnapshot(
    {
      ...snapshot,
      leads: nextLeads,
      activeLeadId: signedLead.id,
    },
    "client-mandate-signed",
    {
      leadUpserts: [signedLead],
      leadDeletes: [],
    },
  );

  void createNotification({
    audience: "admin",
    kind: "mandate_signed",
    title: `Mandate signed by ${signedLead.company}`,
    body: `${fullName} signed the Foundation-1 mandate. Countersign it and coordinate the formal UFMS proposal; do not request bank KYC files.`,
    link: `/admin/leads/${signedLead.clientProfileId}`,
    metadata: {
      leadId: signedLead.id,
      clientProfileId: signedLead.clientProfileId,
      company: signedLead.company,
      mandateSignedAt: signedAtIso,
    },
  });

  return NextResponse.json({
    ok: true,
    alreadySigned: false,
    lead: toPublicMandateLead(signedLead),
  });
}

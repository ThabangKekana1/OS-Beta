import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import { makeId, timelineLabel } from "@/lib/formatting";
import { consumeRateLimit } from "@/lib/rate-limit";
import { proposalDownloadLinkIdForLead } from "@/lib/registration-links";
import type { AdminLead } from "@/lib/admin-types";

export const runtime = "nodejs";

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function findLeadByProposalToken(leads: AdminLead[], token: string): AdminLead | null {
  return (
    leads.find(
      (lead) =>
        proposalDownloadLinkIdForLead({
          leadId: lead.id,
          clientProfileId: lead.clientProfileId,
          email: lead.userProfile.email,
        }) === token,
    ) ?? null
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ip = requestIp(request);
  const limit = await consumeRateLimit({
    scope: "proposal-nda-acceptance",
    key: `${ip}:${token}`,
    limit: 12,
    windowSeconds: 60 * 60,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many acceptance attempts. Try again later." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    company?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  const company = typeof body?.company === "string" ? body.company.trim().slice(0, 160) : "";

  if (name.length < 2 || company.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Name and company are required." },
      { status: 400 },
    );
  }

  const { snapshot } = await readAdminStateSnapshot();
  const currentLead = findLeadByProposalToken(snapshot.leads, token);
  if (!currentLead) {
    return NextResponse.json({ ok: false, error: "Proposal link not found." }, { status: 404 });
  }

  const acceptanceId = makeId("nda");
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const nextLeads = snapshot.leads.map((lead) => {
    if (lead.id !== currentLead.id) return lead;
    return {
      ...lead,
      lastTouched: "Just now",
      events: [
        {
          id: makeId("event"),
          title: "Proposal NDA accepted",
          detail: `Acceptance ID ${acceptanceId}. ${name} accepted the proposal non-disclosure agreement with non-circumvention clause for ${company}. IP: ${ip}. User agent: ${userAgent.slice(0, 180)}.`,
          createdAt: timelineLabel(),
          tone: "client" as const,
        },
        ...lead.events,
      ],
    };
  });

  await writeAdminStateSnapshot(
    {
      ...snapshot,
      leads: nextLeads,
      activeLeadId: currentLead.id,
    },
    "proposal-nda-accepted",
  );

  return NextResponse.json({ ok: true, acceptanceId });
}

import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import { getServerAuthSession } from "@/lib/auth-server";
import { adminLeadStages, adminLeadContactStatuses } from "@/lib/admin-types";
import { makeId, timelineLabel } from "@/lib/formatting";
import type { AdminLeadContactStatus, AdminLeadPriority, AdminLeadStage } from "@/lib/admin-types";

export const runtime = "nodejs";

const priorities = new Set<AdminLeadPriority>(["Standard", "Priority", "Executive"]);
const stages = new Set<AdminLeadStage>(adminLeadStages);
const contactStatuses = new Set<AdminLeadContactStatus>(adminLeadContactStatuses);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { backend, snapshot } = await readAdminStateSnapshot();
  const lead = snapshot.leads.find((entry) => entry.id === id || entry.clientProfileId === id);

  if (!lead) {
    return NextResponse.json({ ok: false, error: "Client profile not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, backend, lead });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let payload: {
    ownerId?: unknown;
    priority?: unknown;
    stage?: unknown;
    nextAction?: unknown;
    contactStatus?: unknown;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { snapshot } = await readAdminStateSnapshot();
  let found = false;

  const nextLeads = snapshot.leads.map((lead) => {
    if (lead.id !== id && lead.clientProfileId !== id) {
      return lead;
    }

    found = true;
    const nextStage = typeof payload.stage === "string" && stages.has(payload.stage as AdminLeadStage)
      ? (payload.stage as AdminLeadStage)
      : lead.stage;
    const nextPriority =
      typeof payload.priority === "string" && priorities.has(payload.priority as AdminLeadPriority)
        ? (payload.priority as AdminLeadPriority)
        : lead.priority;
    const nextOwnerId = typeof payload.ownerId === "string" && payload.ownerId.trim()
      ? payload.ownerId.trim()
      : lead.ownerId;
    const nextAction = typeof payload.nextAction === "string" && payload.nextAction.trim()
      ? payload.nextAction.trim()
      : lead.nextAction;
    const nextContactStatus =
      typeof payload.contactStatus === "string" &&
      contactStatuses.has(payload.contactStatus as AdminLeadContactStatus)
        ? (payload.contactStatus as AdminLeadContactStatus)
        : lead.contactStatus;

    return {
      ...lead,
      ownerId: nextOwnerId,
      priority: nextPriority,
      stage: nextStage,
      contactStatus: nextContactStatus,
      nextAction,
      onboardingCompletedAt:
        nextStage === "Onboarding Complete"
          ? lead.onboardingCompletedAt ?? new Date().toISOString()
          : nextStage === "Disqualified"
            ? null
            : lead.onboardingCompletedAt,
      lastTouched: "Just now",
      events: [
        {
          id: makeId("event"),
          title: "Client profile updated",
          detail: `${session.name} updated CRM profile fields through the domain API.`,
          createdAt: timelineLabel(),
          tone: session.role === "sales" ? ("agent" as const) : ("system" as const),
        },
        ...lead.events,
      ],
    };
  });

  if (!found) {
    return NextResponse.json({ ok: false, error: "Client profile not found." }, { status: 404 });
  }

  const nextSnapshot = {
    ...snapshot,
    leads: nextLeads,
    activeLeadId: id,
  };
  const backend = await writeAdminStateSnapshot(nextSnapshot, session.email);

  return NextResponse.json({ ok: true, backend, snapshot: nextSnapshot });
}

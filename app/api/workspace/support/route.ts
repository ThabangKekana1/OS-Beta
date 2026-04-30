import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { resolveClientOnboardingLead } from "@/lib/client-onboarding";
import { makeId, timelineLabel } from "@/lib/formatting";
import { createNotification } from "@/lib/notifications";
import {
  readAdminStateSnapshot,
  writeAdminStateSnapshot,
} from "@/lib/admin-state-store";

export const runtime = "nodejs";

const SUPPORT_NOTIFY_EMAIL = "support@foundation-1.co.za";

type SupportRequestPayload = {
  workspaceId?: string | null;
  caseName?: string | null;
  requestType?: string;
  preferredContactMethod?: string;
  preferredContactValue?: string | null;
  message?: string;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildTaskTitle(requestType: string) {
  return requestType
    ? `Respond to client support request: ${requestType}`
    : "Respond to client support request";
}

export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: SupportRequestPayload;
  try {
    payload = (await request.json()) as SupportRequestPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const requestType = normalizeText(payload.requestType);
  const preferredContactMethod = normalizeText(payload.preferredContactMethod);
  const preferredContactValue = normalizeText(payload.preferredContactValue);
  const message = normalizeText(payload.message);

  if (message.length < 12) {
    return NextResponse.json(
      { ok: false, error: "Add a short description of the support you need." },
      { status: 400 },
    );
  }

  const lead = await resolveClientOnboardingLead({
    sessionEmail: session.email,
    workspaceId: payload.workspaceId ?? null,
    caseName: payload.caseName ?? null,
  });

  if (!lead) {
    return NextResponse.json(
      { ok: false, error: "No onboarding profile was found for this workspace." },
      { status: 404 },
    );
  }

  const { snapshot } = await readAdminStateSnapshot();
  const noteBody = [
    requestType ? `Support type: ${requestType}` : null,
    preferredContactMethod
      ? `Preferred contact: ${preferredContactMethod}${preferredContactValue ? ` (${preferredContactValue})` : ""}`
      : null,
    "",
    message,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const eventDetailParts = [
    requestType ? `${requestType}.` : "Support requested.",
    message,
    preferredContactMethod
      ? `Preferred contact: ${preferredContactMethod}${preferredContactValue ? ` (${preferredContactValue})` : ""}.`
      : null,
  ].filter(Boolean);

  const updatedLeads = snapshot.leads.map((entry) => {
    if (entry.id !== lead.id) {
      return entry;
    }

    return {
      ...entry,
      lastTouched: "Just now",
      notes: [
        {
          id: makeId("note"),
          body: noteBody,
          author: `Client (${session.email})`,
          createdAt: timelineLabel(),
        },
        ...entry.notes,
      ],
      tasks: [
        {
          id: makeId("task"),
          title: buildTaskTitle(requestType),
          owner: "Agent" as const,
          dueLabel: "Today",
          status: "open" as const,
        },
        ...entry.tasks,
      ],
      events: [
        {
          id: makeId("event"),
          title: "Client support requested",
          detail: eventDetailParts.join(" "),
          createdAt: timelineLabel(),
          tone: "client" as const,
        },
        ...entry.events,
      ],
    };
  });

  await writeAdminStateSnapshot(
    {
      ...snapshot,
      leads: updatedLeads,
    },
    session.email,
  );

  await createNotification({
    audience: "admin",
    recipientEmail: SUPPORT_NOTIFY_EMAIL,
    kind: "system",
    title: `Client support requested: ${lead.company}`,
    body: `${lead.userProfile.fullName} requested sales support. ${message}`,
    link: `/sales/clients/${lead.clientProfileId}`,
    metadata: {
      leadId: lead.id,
      clientProfileId: lead.clientProfileId,
      requestType: requestType || null,
      preferredContactMethod: preferredContactMethod || null,
      preferredContactValue: preferredContactValue || null,
      requestedBy: session.email,
    },
  });

  return NextResponse.json({ ok: true });
}

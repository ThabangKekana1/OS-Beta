import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { recordUserAuditEvent, type UserAuditEventType } from "@/lib/user-audit";

export const runtime = "nodejs";

function eventTypeFromPayload(value: unknown): UserAuditEventType {
  if (value === "logout") return "logout";
  return "login";
}

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session || !["admin", "sales", "partner"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { eventType?: unknown } = {};
  try {
    payload = (await request.json()) as { eventType?: unknown };
  } catch {
    payload = {};
  }

  const eventType = eventTypeFromPayload(payload.eventType);
  const result = await recordUserAuditEvent({ session, request, eventType });

  return NextResponse.json(result);
}

import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { listNotifications, markNotificationsRead, type NotificationAudience } from "@/lib/notifications";

export const runtime = "nodejs";

function notificationScope(session: { role: string; email: string }): {
  audience: NotificationAudience;
  recipientEmail?: string;
} | null {
  if (session.role === "admin") return { audience: "admin" };
  if (session.role === "sales") return { audience: "sales", recipientEmail: session.email };
  return null;
}

export async function GET() {
  const session = await getServerAuthSession();
  if (!session || (session.role !== "admin" && session.role !== "sales")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scope = notificationScope(session);
  if (!scope) return NextResponse.json({ notifications: [] });

  const notifications = await listNotifications({
    audience: scope.audience,
    recipientEmail: scope.recipientEmail,
    limit: 200,
  });
  return NextResponse.json({ notifications });
}

export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session || (session.role !== "admin" && session.role !== "sales")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: string; ids?: string[] };
  try {
    body = (await request.json()) as { id?: string; ids?: string[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  const scope = notificationScope(session);
  if (scope) {
    await markNotificationsRead(ids, {
      audience: scope.audience,
      recipientEmail: scope.recipientEmail,
    });
  }

  return NextResponse.json({ ok: true, marked: ids.length });
}

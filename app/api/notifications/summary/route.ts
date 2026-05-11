import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { getUnreadThreadCount } from "@/lib/email-threads";
import { listNotifications, type NotificationAudience } from "@/lib/notifications";

export const runtime = "nodejs";

function notificationScope(session: { role: string; email: string }): {
  audience: NotificationAudience;
  recipientEmail?: string;
} | null {
  if (session.role === "admin") return { audience: "admin" };
  if (session.role === "sales") return { audience: "sales", recipientEmail: session.email };
  if (session.role === "client") return { audience: "customer", recipientEmail: session.email };
  return null;
}

export async function GET() {
  const session = await getServerAuthSession();
  if (!session || (session.role !== "admin" && session.role !== "sales" && session.role !== "client")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const unreadInboxCount = session.role === "client"
    ? 0
    : await getUnreadThreadCount({
        mailboxOwnerUserId: session.role === "sales" ? session.userId : null,
        mailboxAddress: session.role === "sales" ? session.email : null,
      });

  const scope = notificationScope(session);
  const notifications = scope
    ? await listNotifications({
        audience: scope.audience,
        recipientEmail: scope.recipientEmail,
        limit: 200,
      })
    : [];
  const unreadNotificationCount = notifications.filter((notification) => !notification.readAt).length;

  return NextResponse.json({ unreadInboxCount, unreadNotificationCount });
}

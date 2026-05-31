import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { getUnreadThreadCount } from "@/lib/email-threads";
import { listNotifications, type NotificationAudience } from "@/lib/notifications";
import { getAdminSenderOptions } from "@/lib/admin-mailboxes";

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

  let unreadInboxCount = 0;
  const inboxCountsByMailbox: Record<string, number> = {};

  if (session.role === "admin") {
    const senderOptions = getAdminSenderOptions();
    const counts = await Promise.all(
      senderOptions.map((option) =>
        getUnreadThreadCount({ mailboxAddress: option.email }).then((count) => ({
          email: option.email,
          count,
        })),
      ),
    );
    for (const entry of counts) {
      inboxCountsByMailbox[entry.email] = entry.count;
      unreadInboxCount += entry.count;
    }
  } else if (session.role === "sales") {
    unreadInboxCount = await getUnreadThreadCount({
      mailboxOwnerUserId: session.userId,
      mailboxAddress: session.email,
    });
  }

  const scope = notificationScope(session);
  const notifications = scope
    ? await listNotifications({
        audience: scope.audience,
        recipientEmail: scope.recipientEmail,
        limit: 200,
      })
    : [];
  const unreadNotificationCount = notifications.filter((notification) => !notification.readAt).length;

  return NextResponse.json({
    unreadInboxCount,
    unreadNotificationCount,
    inboxCountsByMailbox,
  });
}

import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { getThread, listMessages, markThreadRead } from "@/lib/email-threads";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session || (session.role !== "sales" && session.role !== "admin" && session.role !== "partner")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const thread = await getThread(id);
  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  if (session.role === "sales" || session.role === "partner") {
    const ownsThread =
      (thread.mailboxOwnerUserId && session.userId && thread.mailboxOwnerUserId === session.userId) ||
      (!thread.mailboxOwnerUserId && thread.mailboxAddress === session.email);

    if (!ownsThread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const messages = await listMessages(id);
  await markThreadRead(id);
  return NextResponse.json({ thread, messages });
}

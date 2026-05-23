import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { listThreads } from "@/lib/email-threads";
import { resolveAdminSenderOption } from "@/lib/admin-mailboxes";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session || (session.role !== "sales" && session.role !== "admin" && session.role !== "partner" && session.role !== "client")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const leadId = url.searchParams.get("leadId");
  const search = url.searchParams.get("q");
  const mailboxParam = url.searchParams.get("mailbox");
  const personalMailbox = session.role === "sales" || session.role === "partner";
  const adminMailbox = session.role === "admin" && mailboxParam
    ? resolveAdminSenderOption(mailboxParam)
    : null;
  if (session.role === "admin" && mailboxParam && !adminMailbox) {
    return NextResponse.json({ error: "Mailbox not available" }, { status: 403 });
  }
  const threads = await listThreads({
    leadId,
    search,
    mailboxOwnerUserId: personalMailbox ? session.userId : null,
    mailboxAddress: personalMailbox ? session.email : adminMailbox?.email ?? null,
    participantEmail: session.role === "client" ? session.email : null,
  });
  return NextResponse.json({ threads });
}

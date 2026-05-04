import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { listThreads } from "@/lib/email-threads";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session || (session.role !== "sales" && session.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const leadId = url.searchParams.get("leadId");
  const search = url.searchParams.get("q");
  const threads = await listThreads({
    leadId,
    search,
    mailboxOwnerUserId: session.role === "sales" ? session.userId : null,
    mailboxAddress: session.role === "sales" ? session.email : null,
  });
  return NextResponse.json({ threads });
}

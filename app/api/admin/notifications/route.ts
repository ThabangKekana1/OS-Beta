import { NextRequest, NextResponse } from "next/server";
import { requireServerAuthSession } from "@/lib/auth-server";
import { listNotifications, markNotificationRead } from "@/lib/notifications";

export const runtime = "nodejs";

export async function GET() {
  await requireServerAuthSession("admin");
  const notifications = await listNotifications({ audience: "admin", limit: 200 });
  return NextResponse.json({ notifications });
}

export async function POST(request: NextRequest) {
  await requireServerAuthSession("admin");
  let body: { id?: string; ids?: string[] };
  try {
    body = (await request.json()) as { id?: string; ids?: string[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  await Promise.all(ids.map((id) => markNotificationRead(id)));
  return NextResponse.json({ ok: true, marked: ids.length });
}

import { NextResponse } from "next/server";
import { getServerAuthSessionFromRequest } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerAuthSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ session: null });
  }
  return NextResponse.json({
    session: {
      email: session.email,
      name: session.name,
      role: session.role,
    },
  });
}

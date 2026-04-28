import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerAuthSession();
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

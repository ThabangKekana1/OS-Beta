import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const WORKSPACE_COOKIE_NAME = "oneos_workspace_id";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch (error) {
    console.error("[auth] failed to sign out of Supabase", error);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(WORKSPACE_COOKIE_NAME);
  return response;
}

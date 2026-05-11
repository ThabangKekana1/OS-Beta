import { NextResponse } from "next/server";
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthCheck = { ok: boolean; latencyMs?: number; error?: string };

async function checkSupabase(): Promise<HealthCheck> {
  if (!hasSupabaseAdminConfig()) {
    return { ok: false, error: "Supabase not configured" };
  }
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase client unavailable" };

  const start = Date.now();
  try {
    const { error } = await supabase.from("oneos_admin_state").select("id").limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

function checkAuthConfig(): HealthCheck {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ""
  ).trim();
  if (!url) return { ok: false, error: "NEXT_PUBLIC_SUPABASE_URL missing" };
  if (!key)
    return { ok: false, error: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY missing" };
  return { ok: true };
}

function checkLlm(): HealthCheck {
  if (process.env.NODE_ENV !== "production") return { ok: true };
  const hasOpenRouter = Boolean((process.env.OPENROUTER_API_KEY ?? "").trim());
  if (!hasOpenRouter) {
    return { ok: false, error: "OPENROUTER_API_KEY missing" };
  }
  return { ok: true };
}

export async function GET() {
  const [supabase, auth, llm] = await Promise.all([
    checkSupabase(),
    Promise.resolve(checkAuthConfig()),
    Promise.resolve(checkLlm()),
  ]);

  const allOk = supabase.ok && auth.ok && llm.ok;
  return NextResponse.json(
    {
      ok: allOk,
      env: process.env.NODE_ENV,
      checks: { supabase, auth, llm },
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 },
  );
}

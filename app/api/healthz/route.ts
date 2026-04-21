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
  const secret = (process.env.ONEOS_AUTH_SECRET ?? "").trim();
  if (!secret) return { ok: false, error: "ONEOS_AUTH_SECRET missing" };
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    return { ok: false, error: "ONEOS_AUTH_SECRET must be >= 32 chars in production" };
  }
  return { ok: true };
}

function checkLlm(): HealthCheck {
  if (process.env.NODE_ENV !== "production") return { ok: true };
  const hasGoogle = Boolean((process.env.GOOGLE_API_KEY ?? "").trim());
  const hasOpenAi = Boolean((process.env.OPENAI_API_KEY ?? "").trim());
  if (!hasGoogle && !hasOpenAi) {
    return { ok: false, error: "No hosted LLM provider configured" };
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

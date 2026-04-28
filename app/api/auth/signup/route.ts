import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { buildAuthRedirectUrl } from "@/lib/url";
import { resolveServerSiteOrigin } from "@/lib/site-url.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Sign-up is unavailable: Supabase Auth is not configured." },
      { status: 503 },
    );
  }

  const limit = await consumeRateLimit({
    scope: "auth-signup",
    key: clientKey(request),
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many sign-up attempts. Try again later." },
      { status: 429 },
    );
  }

  let payload: { email?: string; password?: string; name?: string };
  try {
    payload = (await request.json()) as { email?: string; password?: string; name?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const email = (payload.email ?? "").trim().toLowerCase();
  const password = payload.password ?? "";
  const name = (payload.name ?? "").trim();

  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { ok: false, error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }
  if (password.length > 128) {
    return NextResponse.json({ ok: false, error: "Password is too long." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const authRedirectTo = buildAuthRedirectUrl(
    resolveServerSiteOrigin(request),
    "/auth/confirm",
    "/workspace",
  );

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: authRedirectTo,
      data: name ? { full_name: name, name } : undefined,
    },
  });

  if (error) {
    const status = /registered|exists/i.test(error.message) ? 409 : 400;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }

  // When email confirmation is enabled the session will be null until the user
  // confirms their address.
  const requiresConfirmation = !data.session;

  return NextResponse.json({
    ok: true,
    requiresConfirmation,
    email,
  });
}

import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { resolveDefaultRouteForRole } from "@/lib/auth";
import { getServerAuthSession } from "@/lib/auth-server";
import { sanitizeNextPath } from "@/lib/url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function resolveNextPath(searchParams: URLSearchParams, origin: string) {
  const nextParam = sanitizeNextPath(searchParams.get("next"), "/");
  if (nextParam !== "/") {
    return nextParam;
  }

  const redirectTo = searchParams.get("redirect_to");
  if (!redirectTo) {
    return nextParam;
  }

  try {
    const redirectUrl = new URL(redirectTo, origin);
    if (redirectUrl.origin !== origin) {
      return nextParam;
    }
    return sanitizeNextPath(
      `${redirectUrl.pathname}${redirectUrl.search}`,
      nextParam,
    );
  } catch {
    return nextParam;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const errorDescription = searchParams.get("error_description");
  const nextParam = resolveNextPath(searchParams, origin);

  if (errorDescription) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", errorDescription);
    return NextResponse.redirect(url);
  }

  if (!code && !(tokenHash && type)) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", "Missing authorization code.");
    return NextResponse.redirect(url);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({
        token_hash: tokenHash!,
        type: type!,
      });

  if (error) {
    const url = new URL("/login", origin);
    url.searchParams.set("error", error.message);
    return NextResponse.redirect(url);
  }

  const session = await getServerAuthSession();
  const fallback = session ? resolveDefaultRouteForRole(session.role) : "/";
  const next =
    nextParam === "/" || (nextParam === "/workspace" && session?.role !== "client")
      ? fallback
      : nextParam;

  return NextResponse.redirect(new URL(next, origin));
}

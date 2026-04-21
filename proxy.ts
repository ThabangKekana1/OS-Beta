import { NextResponse, type NextRequest } from "next/server";
import { readSessionToken, resolveDefaultRouteForRole, SESSION_COOKIE_NAME } from "@/lib/auth";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Public mutating endpoints intentionally allowed cross-origin (none today).
const PUBLIC_MUTATING_PATHS = new Set<string>([]);

function withNextParam(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  if (nextPath && nextPath !== "/") {
    loginUrl.searchParams.set("next", nextPath);
  }

  return loginUrl;
}

function getOriginHost(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()",
  );
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CSRF protection: enforce same-origin on mutating /api/* requests.
  if (pathname.startsWith("/api/") && !SAFE_METHODS.has(request.method)) {
    if (!PUBLIC_MUTATING_PATHS.has(pathname)) {
      const apiClientHeader = request.headers.get("x-1os-api-client");
      const origin = getOriginHost(request.headers.get("origin"));
      const referer = getOriginHost(request.headers.get("referer"));
      const expected = request.nextUrl.host;

      const sameOrigin =
        (origin && origin === expected) || (referer && referer === expected);

      if (!sameOrigin && !apiClientHeader) {
        return new NextResponse(
          JSON.stringify({ ok: false, error: "Cross-origin request blocked." }),
          {
            status: 403,
            headers: { "content-type": "application/json" },
          },
        );
      }
    }
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await readSessionToken(token);

  if (pathname === "/login") {
    if (session) {
      return applySecurityHeaders(
        NextResponse.redirect(new URL(resolveDefaultRouteForRole(session.role), request.url)),
      );
    }
    return applySecurityHeaders(NextResponse.next());
  }

  if (pathname.startsWith("/admin")) {
    if (!session) {
      return applySecurityHeaders(NextResponse.redirect(withNextParam(request)));
    }
    if (session.role !== "admin") {
      return applySecurityHeaders(
        NextResponse.redirect(new URL(resolveDefaultRouteForRole(session.role), request.url)),
      );
    }
    return applySecurityHeaders(NextResponse.next());
  }

  if (pathname.startsWith("/sales")) {
    if (!session) {
      return applySecurityHeaders(NextResponse.redirect(withNextParam(request)));
    }
    if (session.role !== "sales") {
      return applySecurityHeaders(
        NextResponse.redirect(new URL(resolveDefaultRouteForRole(session.role), request.url)),
      );
    }
    return applySecurityHeaders(NextResponse.next());
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  // Run on auth-protected pages and ALL /api/* routes (for CSRF + headers).
  matcher: ["/login", "/admin/:path*", "/sales/:path*", "/api/:path*"],
};

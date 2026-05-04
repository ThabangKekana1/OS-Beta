import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resolveDefaultRouteForRole, type UserRole } from "@/lib/auth";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Public mutating endpoints intentionally allowed cross-origin. These routes
// must perform their own authentication/signature validation.
const PUBLIC_MUTATING_PATHS = new Set<string>(["/api/email/inbound"]);

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

  // Build a single response we can mutate (cookies for token refresh + redirects).
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

  if (!url || !key) {
    return applySecurityHeaders(response);
  }

  // Refresh Supabase Auth tokens; rotated cookies land on `response`.
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims ?? null;
  const isSignedIn = Boolean(claims?.email && (claims?.email_verified ?? true));

  // Already signed in → bounce away from the login/signup screens.
  if (pathname === "/login" || pathname === "/signup") {
    if (isSignedIn) {
      const target = NextResponse.redirect(new URL("/", request.url));
      response.cookies.getAll().forEach((c) => target.cookies.set(c));
      return applySecurityHeaders(target);
    }
    return applySecurityHeaders(response);
  }

  // Authenticated-only sections: redirect anonymous visitors to /login. Role
  // mismatches are handled by the route layouts via `requireServerAuthSession`.
  const requiresAuth =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/sales") ||
    pathname.startsWith("/partner");

  if (requiresAuth && !isSignedIn) {
    const target = NextResponse.redirect(withNextParam(request));
    response.cookies.getAll().forEach((c) => target.cookies.set(c));
    return applySecurityHeaders(target);
  }

  return applySecurityHeaders(response);
}

// Type-only re-export to keep imports stable for any future role-aware logic.
export type { UserRole };
export { resolveDefaultRouteForRole };

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

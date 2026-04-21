import { NextResponse } from "next/server";
import {
  createSessionToken,
  getAuthConfigurationError,
  resolveDefaultRouteForRole,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  validateCredentials,
} from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return ip;
}

export async function POST(request: Request) {
  const configError = getAuthConfigurationError();
  if (configError) {
    return NextResponse.json(
      { ok: false, error: configError },
      { status: 503 },
    );
  }

  // 10 attempts per 15 minutes per IP.
  const limit = await consumeRateLimit({
    scope: "auth-login",
    key: clientKey(request),
    limit: 10,
    windowSeconds: 15 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many login attempts. Try again later." },
      { status: 429, headers: { "retry-after": String(Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000)) } },
    );
  }

  let payload: { email?: string; password?: string };

  try {
    payload = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  const email = payload.email?.trim() ?? "";
  const password = payload.password ?? "";

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Email and password are required." },
      { status: 400 },
    );
  }

  const session = await validateCredentials(email, password);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Incorrect email or password." },
      { status: 401 },
    );
  }

  const token = await createSessionToken(session);
  const redirectTo = resolveDefaultRouteForRole(session.role);

  // Record session in DB for revocation tracking.
  try {
    const { recordAuthSession } = await import("@/lib/auth-sessions-db");
    const { findUserByEmail } = await import("@/lib/users-db");
    const dbUser = await findUserByEmail(session.email);
    if (dbUser) {
      await recordAuthSession({
        userId: dbUser.id,
        token,
        expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
        userAgent: request.headers.get("user-agent"),
        ipAddress: clientKey(request),
      });
    }
  } catch (error) {
    console.error("[auth] failed to record session", error);
  }

  const response = NextResponse.json({
    ok: true,
    redirectTo,
    session: {
      email: session.email,
      name: session.name,
      role: session.role,
    },
  });

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return response;
}

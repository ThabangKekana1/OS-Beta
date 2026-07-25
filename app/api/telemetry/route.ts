import { NextRequest, NextResponse } from "next/server";
import {
  hashTelemetryIdentifier,
  sanitizeTelemetryBatch,
  secureTelemetryKeyMatches,
  type TelemetryEnvironment,
} from "@/lib/intelligence/telemetry";
import {
  insertBehaviorEvents,
  runtimeEnvironment,
} from "@/lib/intelligence/store";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const environments = new Set<TelemetryEnvironment>([
  "production",
  "preview",
  "development",
  "test",
]);

function sourceEnvironment(request: NextRequest) {
  const supplied = request.headers.get("x-f1-source-environment");
  return environments.has(supplied as TelemetryEnvironment)
    ? (supplied as TelemetryEnvironment)
    : runtimeEnvironment();
}

function isSameOriginBrowserClient(request: NextRequest) {
  if (
    request.headers.get("x-f1-telemetry-client") !== "product-insights-v1"
  ) {
    return false;
  }
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    fetchSite &&
    fetchSite !== "same-origin" &&
    fetchSite !== "none"
  ) {
    return false;
  }
  try {
    const sourceHost = new URL(origin ?? referer ?? "").host;
    const expectedHosts = new Set(
      [
        request.nextUrl.host,
        request.headers.get("host"),
        request.headers.get("x-forwarded-host")?.split(",")[0]?.trim(),
      ].filter((value): value is string => Boolean(value)),
    );
    return expectedHosts.has(sourceHost);
  } catch {
    return false;
  }
}

function requestIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 32_768) {
    return NextResponse.json(
      { ok: false, error: "Telemetry payload is too large." },
      { status: 413 },
    );
  }

  const configuredKey = process.env.TELEMETRY_INGEST_SECRET;
  const serverAuthorized = secureTelemetryKeyMatches(
    request.headers.get("x-f1-telemetry-key"),
    configuredKey,
  );
  const currentEnvironment = runtimeEnvironment();
  const localServerAuthorized =
    currentEnvironment !== "production" &&
    !configuredKey &&
    request.headers.get("x-1os-api-client") === "foundation-1-website";
  const browserAuthorized = isSameOriginBrowserClient(request);
  if (!serverAuthorized && !localServerAuthorized && !browserAuthorized) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized telemetry source." },
      { status: 401 },
    );
  }

  const hashSecret =
    process.env.TELEMETRY_HASH_SECRET ??
    (runtimeEnvironment() === "production"
      ? ""
      : "foundation1-development-telemetry-hash");
  if (hashSecret.length < 16) {
    return NextResponse.json(
      { ok: false, error: "Telemetry hashing is not configured." },
      { status: 503 },
    );
  }
  if (browserAuthorized) {
    const rateLimit = await consumeRateLimit({
      scope: "client-behavior-telemetry",
      key: hashTelemetryIdentifier(requestIp(request), hashSecret),
      limit: 120,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Telemetry rate limit exceeded." },
        {
          status: 429,
          headers: {
            "retry-after": String(
              Math.max(
                1,
                Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000),
              ),
            ),
          },
        },
      );
    }
  }

  const payload = (await request.json().catch(() => null)) as {
    events?: unknown;
  } | null;
  if (!payload) {
    return NextResponse.json(
      { ok: false, error: "Invalid telemetry payload." },
      { status: 400 },
    );
  }
  const environment = browserAuthorized
    ? currentEnvironment
    : sourceEnvironment(request);
  const rawEvents = Array.isArray(payload.events)
    ? payload.events.map((event) =>
        event && typeof event === "object"
          ? { ...event, environment }
          : event,
      )
    : [];
  const accepted = sanitizeTelemetryBatch({
    events: rawEvents,
    hashSecret,
  });
  const result = await insertBehaviorEvents(accepted);
  return NextResponse.json(
    { ok: true, accepted: result.accepted, persisted: result.persisted },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

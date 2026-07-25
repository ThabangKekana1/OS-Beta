import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { buildCodexOperationsBrief } from "@/lib/intelligence/codex-brief";
import {
  readIntelligenceSnapshot,
  runtimeEnvironment,
} from "@/lib/intelligence/store";
import type { TelemetryEnvironment } from "@/lib/intelligence/telemetry";

const environments = new Set<TelemetryEnvironment>([
  "production",
  "preview",
  "development",
  "test",
]);

export async function GET(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const requested = request.nextUrl.searchParams.get("environment");
  const environment = environments.has(requested as TelemetryEnvironment)
    ? (requested as TelemetryEnvironment)
    : runtimeEnvironment();
  const snapshot = await readIntelligenceSnapshot({
    environment,
    days: 30,
  });
  return new NextResponse(buildCodexOperationsBrief(snapshot), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition":
        'attachment; filename="foundation-1-codex-operations-brief.md"',
      "cache-control": "no-store",
    },
  });
}

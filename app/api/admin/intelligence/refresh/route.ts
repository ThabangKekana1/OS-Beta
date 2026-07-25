import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import {
  runImprovementLearningCycle,
  runtimeEnvironment,
} from "@/lib/intelligence/store";
import type { TelemetryEnvironment } from "@/lib/intelligence/telemetry";

const environments = new Set<TelemetryEnvironment>([
  "production",
  "preview",
  "development",
  "test",
]);

export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const payload = (await request.json().catch(() => ({}))) as {
    environment?: unknown;
    days?: unknown;
  };
  const environment = environments.has(payload.environment as TelemetryEnvironment)
    ? (payload.environment as TelemetryEnvironment)
    : runtimeEnvironment();
  const days = Number(payload.days ?? 30);
  try {
    const result = await runImprovementLearningCycle({
      environment,
      days: Number.isFinite(days) ? days : 30,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Learning cycle failed.",
      },
      { status: 503 },
    );
  }
}

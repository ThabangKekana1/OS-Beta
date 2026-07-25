import { NextRequest, NextResponse } from "next/server";
import { secureTelemetryKeyMatches } from "@/lib/intelligence/telemetry";
import {
  runImprovementLearningCycle,
  runtimeEnvironment,
} from "@/lib/intelligence/store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  const configured = process.env.CRON_SECRET;
  const authorized = secureTelemetryKeyMatches(supplied, configured);
  if (
    (runtimeEnvironment() === "production" || configured) &&
    !authorized
  ) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await runImprovementLearningCycle({
      environment: runtimeEnvironment(),
      days: 30,
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

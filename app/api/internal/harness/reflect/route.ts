/**
 * Nightly reflection (doc 20): each agent reads its own outcomes and rewrites
 * its playbook. Runs on its own schedule so it never shares a time budget with
 * the analytics cycle.
 */
import { NextRequest, NextResponse } from "next/server";
import { runReflectionPass } from "@/lib/harness/reflect";
import { secureTelemetryKeyMatches } from "@/lib/intelligence/telemetry";
import { runtimeEnvironment } from "@/lib/intelligence/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  const configured = process.env.CRON_SECRET;
  const authorized = secureTelemetryKeyMatches(supplied, configured);
  if ((runtimeEnvironment() === "production" || configured) && !authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const reflections = [] as unknown[];
  for (const agent of ["sales-harness", "dawn"] as const) {
    try {
      reflections.push(await runReflectionPass({ agent }));
    } catch (error) {
      reflections.push({
        agent,
        evidenceCount: 0,
        proposals: [],
        applied: [],
        skipped: error instanceof Error ? error.message : "reflection failed",
      });
    }
  }
  return NextResponse.json({ ok: true, reflections, ranAt: new Date().toISOString() });
}

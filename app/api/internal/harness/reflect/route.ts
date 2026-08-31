/**
 * Nightly reflection (doc 20): each agent reads its own outcomes and rewrites
 * its playbook. Runs on its own schedule so it never shares a time budget with
 * the analytics cycle.
 */
import { NextRequest, NextResponse } from "next/server";
import { runReflectionPass } from "@/lib/harness/reflect";
import { activePlaybookStamp } from "@/lib/harness/reflect";
import { SEND_DAILY_CAP, queueSendDraft } from "@/lib/harness/gate";
import { draftFirstTouchWithModel } from "@/lib/harness/outreach";
import { searchSalesBook } from "@/lib/harness/tools";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
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

  // Both agents reflect in parallel inside one budget; each carries its own
  // deadline so the function always answers.
  const reflections = await Promise.all(
    (["sales-harness", "dawn"] as const).map(async (agent) => {
      try {
        return await runReflectionPass({ agent, timeoutMs: 40_000 });
      } catch (error) {
        return {
          agent,
          evidenceCount: 0,
          proposals: [],
          applied: [],
          skipped: error instanceof Error ? error.message : "reflection failed",
        };
      }
    }),
  );
  // After reflection, top the verdict stack up toward the daily cap so the
  // founder wakes to a full day. Budget-bounded: whatever fits, fits.
  let topUp = { attempted: 0, created: 0 };
  try {
    const admin = getSupabaseAdminClient();
    if (admin) {
      const { count } = await admin
        .from("foundation1_send_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft");
      const pending = count ?? 0;
      const deadline = Date.now() + 30_000;
      const stamp = await activePlaybookStamp("sales-harness").catch(() => ({}));
      if (pending < SEND_DAILY_CAP) {
        const { data: queuedRows } = await admin.from("foundation1_send_queue").select("prospect_key");
        const queued = new Set((queuedRows ?? []).map((row) => row.prospect_key as string));
        const leads = await searchSalesBook({ limit: 200 });
        for (const lead of leads) {
          if (pending + topUp.created >= SEND_DAILY_CAP || Date.now() > deadline) break;
          if (queued.has(lead.bookId)) continue;
          topUp.attempted += 1;
          const draft = await draftFirstTouchWithModel(lead, { timeoutMs: 20_000 }).catch(() => null);
          if (!draft) continue;
          await queueSendDraft({ ...draft, payload: { ...(draft.payload ?? {}), playbook: stamp } });
          topUp.created += 1;
        }
      }
    }
  } catch {
    // The stack simply stays where it is; the founder can fill from the Deck.
  }
  return NextResponse.json({ ok: true, reflections, topUp, ranAt: new Date().toISOString() });
}

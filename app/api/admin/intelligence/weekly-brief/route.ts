/**
 * Admin weekly-brief API — the Monday operating brief on demand.
 *
 * GET                  -> latest stored brief for the environment (falls back
 *                         to a live assembly when none is stored yet).
 * GET ?download=1      -> same content as a markdown attachment.
 * POST                 -> force-generate + store this week's brief now.
 *
 * INTERNAL: the brief contains clone-engine calibration. Admin-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import {
  assembleWeeklyBrief,
  generateAndStoreWeeklyBrief,
  readLatestWeeklyBrief,
} from "@/lib/intelligence/learning-store";
import { runtimeEnvironment } from "@/lib/intelligence/store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  const download = request.nextUrl.searchParams.get("download") === "1";
  try {
    const environment = runtimeEnvironment();
    const stored = await readLatestWeeklyBrief({ environment });
    const brief = stored ?? {
      week_start: null as string | null,
      markdown: (await assembleWeeklyBrief({ environment })).markdown,
    };
    if (download) {
      const name = `foundation1-weekly-brief-${brief.week_start ?? "live"}.md`;
      return new NextResponse(brief.markdown, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}"`,
        },
      });
    }
    return NextResponse.json({
      ok: true,
      stored: Boolean(stored),
      weekStart: brief.week_start,
      markdown: brief.markdown,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Weekly brief unavailable." },
      { status: 500 },
    );
  }
}

export async function POST() {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  const result = await generateAndStoreWeeklyBrief({
    environment: runtimeEnvironment(),
    force: true,
  });
  return NextResponse.json({ ok: result.generated, ...result });
}

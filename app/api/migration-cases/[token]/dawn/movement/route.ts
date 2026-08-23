import { NextRequest, NextResponse } from "next/server";
import {
  findMigrationCaseByToken,
  isMigrationCaseWebsiteRequest,
} from "@/lib/migration-case-store";
import { recordMovement } from "@/lib/dawn/store";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DAWN — movement intake. The workspace reports every meaningful client move
 * (tab opens, action starts, idle pings) so Dawn knows where the client is,
 * notices where they get stuck, and the ontology sees the same signal.
 * Fire-and-forget from the client; failures here never surface to the user.
 */

const ALLOWED_EVENTS = new Set(["page_view", "interaction", "engagement", "client_error"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const { token } = await params;
  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) return NextResponse.json({ ok: false }, { status: 404 });

    const limit = await consumeRateLimit({
      scope: "dawn_movement",
      key: caseRow.id,
      limit: 400,
      windowSeconds: 3600,
    });
    if (!limit.allowed) return NextResponse.json({ ok: true, dropped: true });

    let body: {
      sessionId?: string;
      events?: Array<{ eventName?: string; pageKey?: string; detail?: Record<string, unknown> }>;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 80) : "anonymous";
    const events = Array.isArray(body.events) ? body.events.slice(0, 20) : [];
    await Promise.all(
      events
        .filter((e) => typeof e.eventName === "string" && ALLOWED_EVENTS.has(e.eventName))
        .map((e) =>
          recordMovement({
            caseId: caseRow.id,
            sessionId,
            eventName: e.eventName as string,
            pageKey: typeof e.pageKey === "string" ? e.pageKey : "home",
            detail: e.detail && typeof e.detail === "object" ? e.detail : {},
          }).catch(() => undefined),
        ),
    );
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

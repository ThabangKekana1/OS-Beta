import { NextRequest, NextResponse } from "next/server";
import {
  findMigrationCaseByToken,
  isMigrationCaseWebsiteRequest,
} from "@/lib/migration-case-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { recordFeedback } from "@/lib/dawn/store";
import { processFeedback } from "@/lib/dawn/learning";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DAWN — message feedback. Like or dislike, with an optional explanation.
 * Every grade lands in the learning loop; dislikes become founder-visible
 * insights immediately.
 */
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
      scope: "dawn_feedback",
      key: caseRow.id,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!limit.allowed) return NextResponse.json({ ok: true, dropped: true });

    let body: { messageId?: string; rating?: string; comment?: string | null };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
    }
    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    const rating = body.rating === "like" || body.rating === "dislike" ? body.rating : null;
    if (!messageId || !rating) {
      return NextResponse.json({ ok: false, error: "messageId and rating are required." }, { status: 400 });
    }
    const comment =
      typeof body.comment === "string" && body.comment.trim()
        ? body.comment.trim().slice(0, 2000)
        : null;

    const stored = await recordFeedback({ messageId, caseId: caseRow.id, rating, comment });
    if (!stored.ok) {
      return NextResponse.json({ ok: false, error: "Message not found." }, { status: 404 });
    }

    const admin = getSupabaseAdminClient();
    const { data: message } = admin
      ? await admin
          .from("foundation1_dawn_messages")
          .select("content")
          .eq("id", messageId)
          .maybeSingle()
      : { data: null };

    processFeedback({
      caseRow,
      messageId,
      messageContent: (message?.content as string | undefined) ?? "",
      rating,
      comment,
    }).catch(() => undefined);

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Feedback failed." },
      { status: 500 },
    );
  }
}

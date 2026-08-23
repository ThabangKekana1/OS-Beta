import { NextRequest, NextResponse } from "next/server";
import {
  findMigrationCaseByToken,
  isMigrationCaseWebsiteRequest,
} from "@/lib/migration-case-store";
import { runDawnTurn } from "@/lib/dawn/engine";
import { ensureConversation, listConversations, listMessages } from "@/lib/dawn/store";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DAWN — the conversational surface of the migration workspace.
 *
 * GET  → conversation list + messages of the requested (or latest) thread.
 * POST → one client message in, one Dawn reply out. Rate limited per case.
 *
 * Dawn is voice and glass only: nothing here mutates case state, publishes a
 * document, or sends an email. Founder approval gates stay exactly where they
 * are.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { token } = await params;
  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }
    const conversations = await listConversations(caseRow.id);
    const requested = request.nextUrl.searchParams.get("conversation");
    const active =
      (requested && conversations.find((c) => c.id === requested)) || conversations[0] || null;
    const messages = active ? await listMessages(active.id) : [];
    return NextResponse.json(
      {
        ok: true,
        conversations,
        conversationId: active?.id ?? null,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          at: m.createdAt,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Dawn is unavailable." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { token } = await params;
  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }
    const limit = await consumeRateLimit({
      scope: "dawn_chat",
      key: caseRow.id,
      limit: 40,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        {
          ok: true,
          conversationId: null,
          reply:
            "You have sent quite a few messages in a short time, so I am pausing briefly. " +
            "Your case is safe and nothing is lost. If something is urgent, " +
            "[message the team](dawn:view/support) and a person will reply by email.",
          rateLimited: true,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    let body: {
      message?: string;
      conversationId?: string | null;
      newConversation?: boolean;
      view?: string | null;
      sessionId?: string | null;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
    }
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ ok: false, error: "Say something first." }, { status: 400 });
    }

    let conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    if (body.newConversation) {
      const conversation = await ensureConversation(caseRow.id, null);
      conversationId = conversation.id;
    }

    const result = await runDawnTurn({
      caseRow,
      message,
      conversationId,
      currentView: typeof body.view === "string" ? body.view.slice(0, 40) : null,
      sessionId: typeof body.sessionId === "string" ? body.sessionId.slice(0, 80) : null,
    });

    return NextResponse.json(
      {
        ok: true,
        conversationId: result.conversationId,
        reply: result.reply,
        stuck: result.stuck,
        degraded: result.degraded,
        suggestNewChat: result.suggestNewChat,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Dawn is unavailable." },
      { status: 500 },
    );
  }
}

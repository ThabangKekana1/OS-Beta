/**
 * The founder-harness thread (doc 21).
 *
 * GET   ?since=<iso>  → new messages since timestamp (short-poll; SSE-ready shape)
 * POST { content }    → founder speaks; MI answers via the bounded tool loop
 *                       on its own cognition tier (MODEL_HARNESS), then both
 *                       turns land in one persistent stream.
 */
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { runHarness } from "@/lib/harness/run";
import { buildFounderTools, miSystemPrompt } from "@/lib/harness/founder";
import { appendDeckMessage, listDeckMessages } from "@/lib/harness/voice";

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const since = new URL(request.url).searchParams.get("since");
  try {
    return NextResponse.json({ ok: true, messages: await listDeckMessages(since) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Thread unavailable." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const content = body.content?.trim().slice(0, 4000);
  if (!content) {
    return NextResponse.json({ ok: false, error: "Say something first." }, { status: 400 });
  }

  // Founder turn persists first so it renders even if MI hiccups.
  const founderMessage = await appendDeckMessage("founder", content);

  let harnessReply = "";
  try {
    const run = await runHarness({
      agent: "sales-harness",
      objective: `Founder said: "${content}". Answer or act within your tools.`,
      systemPrompt: miSystemPrompt(),
      context: "", // tools carry the state; no context dump needed for a chief of staff
      userPrompt: content,
      tools: buildFounderTools(),
      maxRounds: 3,
      maxToolCalls: 6,
      requestedBy: session.email ?? "founder",
    });
    harnessReply = run.reply?.trim() ?? "";
    if (!harnessReply && run.outcome === "no_model") {
      harnessReply = "MI is offline: MODEL_API_KEY / MODEL_DEFAULT not configured on this deployment.";
    }
  } catch (error) {
    harnessReply = error instanceof Error ? `Tool failure: ${error.message}` : "MI hit an unexpected failure.";
  }

  if (!harnessReply) harnessReply = "Understood. Check Today.";
  const harnessMessage = await appendDeckMessage("harness", harnessReply, {
    thoughts: true,
  });

  return NextResponse.json({ ok: true, founderMessage, harnessMessage });
}

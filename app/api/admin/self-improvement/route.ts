/**
 * Self-improvement surface (doc 19 invariant: every self-change is inspectable
 * and revertible by the founder).
 *
 * GET               → what each agent has changed about itself, why, on what
 *                     evidence, how each version is performing, and regressions.
 * POST {reflect}    → run a reflection pass now (dryRun previews without writing)
 * POST {revert}     → restore an earlier version as the newest one
 */
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { loadPlaybook } from "@/lib/harness/memory";
import {
  flagRegressions,
  runReflectionPass,
  revertPlaybookKey,
  scorePlaybookVersions,
  type ReflectAgent,
} from "@/lib/harness/reflect";

const AGENTS: ReflectAgent[] = ["sales-harness", "dawn"];

function isAgent(value: unknown): value is ReflectAgent {
  return typeof value === "string" && (AGENTS as string[]).includes(value);
}

export async function GET() {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const agents = await Promise.all(
    AGENTS.map(async (agent) => {
      const [active, scores, regressions] = await Promise.all([
        loadPlaybook(agent).catch(() => []),
        scorePlaybookVersions(agent).catch(() => []),
        flagRegressions(agent).catch(() => []),
      ]);
      return { agent, active, history: scores, regressions };
    }),
  );
  return NextResponse.json({ ok: true, agents, now: new Date().toISOString() });
}

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (body.action === "reflect") {
    if (!isAgent(body.agent)) {
      return NextResponse.json({ ok: false, error: "Unknown agent." }, { status: 400 });
    }
    const result = await runReflectionPass({
      agent: body.agent,
      dryRun: Boolean(body.dryRun),
    });
    return NextResponse.json({ ok: true, result });
  }

  if (body.action === "revert") {
    if (!isAgent(body.agent) || typeof body.key !== "string" || typeof body.toVersion !== "number") {
      return NextResponse.json({ ok: false, error: "Agent, key and toVersion are required." }, { status: 400 });
    }
    try {
      const entry = await revertPlaybookKey({
        agent: body.agent,
        key: body.key,
        toVersion: body.toVersion,
        actor: session.email ?? "founder",
      });
      return NextResponse.json({ ok: true, entry });
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Revert failed." },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ ok: false, error: "Unsupported action." }, { status: 400 });
}

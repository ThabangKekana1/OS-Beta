import { NextRequest, NextResponse } from "next/server";
import { requireServerAuthSession } from "@/lib/auth-server";
import { loadAgentConfig, saveAgentConfig, type AgentConfig } from "@/lib/assistant/agent-config";

export const runtime = "nodejs";

export async function GET() {
  await requireServerAuthSession("admin");
  const config = await loadAgentConfig();
  return NextResponse.json({ config });
}

export async function PUT(request: NextRequest) {
  const session = await requireServerAuthSession("admin");

  let body: Partial<AgentConfig>;
  try {
    body = (await request.json()) as Partial<AgentConfig>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Partial<Omit<AgentConfig, "updatedAt" | "updatedBy">> = {};
  if (typeof body.systemPrompt === "string" || body.systemPrompt === null) {
    patch.systemPrompt = body.systemPrompt ?? null;
  }
  if (typeof body.onboardingPlaybook === "string" || body.onboardingPlaybook === null) {
    patch.onboardingPlaybook = body.onboardingPlaybook ?? null;
  }
  if (Array.isArray(body.doNotSay)) {
    patch.doNotSay = body.doNotSay
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (Array.isArray(body.escalationTriggers)) {
    patch.escalationTriggers = body.escalationTriggers
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  if (typeof body.tone === "string" || body.tone === null) {
    patch.tone = body.tone ?? null;
  }
  if (body.modeOverrides && typeof body.modeOverrides === "object") {
    patch.modeOverrides = Object.fromEntries(
      Object.entries(body.modeOverrides as Record<string, unknown>)
        .filter(([, v]) => typeof v === "string")
        .map(([k, v]) => [k.trim(), String(v)]),
    );
  }
  if (body.prequalification && typeof body.prequalification === "object") {
    const raw = body.prequalification as Record<string, unknown>;
    patch.prequalification = {
      minMonthlySpendZar:
        typeof raw.minMonthlySpendZar === "number" && Number.isFinite(raw.minMonthlySpendZar)
          ? Math.max(0, Math.round(raw.minMonthlySpendZar))
          : 5000,
      requireRegistered: raw.requireRegistered !== false,
      requireOperational: raw.requireOperational !== false,
      softDisqualifyMessage:
        typeof raw.softDisqualifyMessage === "string" && raw.softDisqualifyMessage.trim()
          ? raw.softDisqualifyMessage.trim()
          : "Based on what you have shared, your business may not be a fit for Generocity right now.",
    };
  }

  try {
    const config = await saveAgentConfig(patch, session.email ?? null);
    return NextResponse.json({ config });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { decideImprovementInsight } from "@/lib/intelligence/store";

const decisions = new Set(["accepted", "rejected", "implemented"]);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as {
    decision?: unknown;
    notes?: unknown;
  } | null;
  const decision =
    typeof payload?.decision === "string" ? payload.decision : "";
  if (!decisions.has(decision)) {
    return NextResponse.json(
      { ok: false, error: "Invalid improvement decision." },
      { status: 400 },
    );
  }
  try {
    const result = await decideImprovementInsight({
      insightId: id,
      decision: decision as "accepted" | "rejected" | "implemented",
      decidedBy: session.email,
      notes: typeof payload?.notes === "string" ? payload.notes : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Decision failed.",
      },
      { status: 400 },
    );
  }
}

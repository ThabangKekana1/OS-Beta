/**
 * Founder gate over a single queue row (admin only).
 * POST { action: "approve" }            → record who approved, when.
 * POST { action: "reject", reason }     → rejection feeds the learning loop.
 */
import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { approveSend, rejectSend } from "@/lib/harness/gate";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { id } = await context.params;
  let body: { action?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const approver = session.email ?? session.name ?? "admin";
  try {
    if (body.action === "approve") {
      return NextResponse.json({ ok: true, row: await approveSend(id, approver) });
    }
    if (body.action === "reject") {
      return NextResponse.json({ ok: true, row: await rejectSend(id, body.reason ?? "Rejected without reason") });
    }
    return NextResponse.json({ ok: false, error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Gate failed." },
      { status: 409 },
    );
  }
}

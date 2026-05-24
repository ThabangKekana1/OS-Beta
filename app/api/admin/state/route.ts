import { NextRequest, NextResponse } from "next/server";
import {
  normalizeAdminStateSnapshot,
  type AdminStateSnapshot,
} from "@/lib/admin-state";
import {
  readAdminStateSnapshot,
  writeAdminStateSnapshot,
  type AdminStateBackend,
} from "@/lib/admin-state-store";
import { getServerAuthSession } from "@/lib/auth-server";

export const runtime = "nodejs";

type StateResponseBody = {
  ok: true;
  backend: AdminStateBackend;
  snapshot: AdminStateSnapshot;
  registrationDrafts: [];
};

async function requireSession() {
  const session = await getServerAuthSession();

  if (!session) {
    return null;
  }

  return session;
}

function canReadAdminState(session: NonNullable<Awaited<ReturnType<typeof getServerAuthSession>>>) {
  return session.role === "admin" || session.role === "sales";
}

export async function GET(request: NextRequest) {
  const session = await requireSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!canReadAdminState(session)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const isSalesSession = session.role === "sales";
    const includeSalesLeads =
      !isSalesSession && request.nextUrl.searchParams.get("includeSalesLeads") !== "0";
    const result = await readAdminStateSnapshot({
      includeSalesLeads,
      leadOwnerId: isSalesSession ? session.agentId : null,
    });

    return NextResponse.json<StateResponseBody>({
      ok: true,
      backend: result.backend,
      snapshot: result.snapshot,
      registrationDrafts: [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Supabase error";

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to load admin state from Supabase.",
        detail: message,
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = await requireSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let payload: { snapshot?: unknown };

  try {
    payload = (await request.json()) as { snapshot?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const snapshot = normalizeAdminStateSnapshot(payload.snapshot);

  if (!snapshot) {
    return NextResponse.json(
      { ok: false, error: "Snapshot payload is missing required fields." },
      { status: 400 },
    );
  }

  try {
    const backend = await writeAdminStateSnapshot(snapshot, session.email);

    return NextResponse.json({
      ok: true,
      backend,
      snapshot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Supabase error";

    return NextResponse.json(
      {
        ok: false,
        error: "Unable to persist admin state to Supabase.",
        detail: message,
      },
      { status: 500 },
    );
  }
}

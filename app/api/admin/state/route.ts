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
import { getPartnerClientLeads } from "@/lib/partner-client-access";
import { listRegistrationDrafts, type RegistrationDraft } from "@/lib/registration-agent";

export const runtime = "nodejs";

type StateResponseBody = {
  ok: true;
  backend: AdminStateBackend;
  snapshot: AdminStateSnapshot;
  registrationDrafts: RegistrationDraft[];
};

async function requireSession() {
  const session = await getServerAuthSession();

  if (!session) {
    return null;
  }

  return session;
}

export async function GET() {
  const session = await requireSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [result, registrationDrafts] = await Promise.all([
      readAdminStateSnapshot(),
      listRegistrationDrafts("in_progress"),
    ]);
    const snapshot =
      session.role === "partner"
        ? session.partnerOrgId
          ? {
              ...result.snapshot,
              leads: getPartnerClientLeads(result.snapshot, session.partnerOrgId),
              salesLeads: result.snapshot.salesLeads.filter(
                (lead) => lead.partnerOrgId === session.partnerOrgId,
              ),
              partnerOrgs: (result.snapshot.partnerOrgs ?? []).filter(
                (org) => org.id === session.partnerOrgId,
              ),
              activeLeadId: null,
            }
          : {
              ...result.snapshot,
              leads: [],
              salesLeads: [],
              partnerOrgs: [],
              activeLeadId: null,
            }
        : result.snapshot;

    return NextResponse.json<StateResponseBody>({
      ok: true,
      backend: result.backend,
      snapshot,
      registrationDrafts: session.role === "partner" ? [] : registrationDrafts,
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

  if (session.role === "partner" || session.role === "client") {
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

import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { buildAuthCallbackUrl } from "@/lib/url";
import { resolveServerSiteOrigin } from "@/lib/site-url.server";
import { upsertProfile } from "@/lib/users-db";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type Payload = {
  email?: string;
  name?: string;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { id: partnerOrgId } = await context.params;

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const email = payload.email?.trim().toLowerCase() ?? "";
  const name = payload.name?.trim() ?? "";

  if (!email.includes("@") || !name) {
    return NextResponse.json(
      { ok: false, error: "A valid email and name are required." },
      { status: 400 },
    );
  }

  const { snapshot } = await readAdminStateSnapshot();
  const org = (snapshot.partnerOrgs ?? []).find((entry) => entry.id === partnerOrgId);
  if (!org) {
    return NextResponse.json(
      { ok: false, error: "Partner org not found." },
      { status: 404 },
    );
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Auth service is not configured." },
      { status: 500 },
    );
  }

  try {
    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { name, partner_org_id: org.id, role: "partner" },
      redirectTo: buildAuthCallbackUrl(resolveServerSiteOrigin(request), "/partner"),
    });

    if (inviteError && !/already (registered|been registered)/i.test(inviteError.message)) {
      console.error("Failed to invite partner user", inviteError);
      return NextResponse.json(
        { ok: false, error: inviteError.message },
        { status: 500 },
      );
    }

    await upsertProfile({
      email,
      name,
      role: "partner",
      agentId: null,
      partnerOrgId: org.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to create partner user", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create partner user." },
      { status: 500 },
    );
  }
}

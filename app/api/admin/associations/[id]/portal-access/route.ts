import { NextRequest, NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { lifecycleReplyTo } from "@/lib/case-lifecycle";
import { sendEmail } from "@/lib/email";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Grants partner-portal access on an association that already exists. The
 * onboarding invite flow creates a NEW organisation, so it cannot be used for
 * partners Foundation-1 already has on file.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  const { id } = await params;
  let body: { email?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!isEmail(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Storage unavailable." }, { status: 503 });
  }

  try {
    const { data: association, error: associationError } = await client
      .from("associations")
      .select("id,name,referral_code,status,onboarding_status")
      .eq("id", id)
      .maybeSingle();
    if (associationError || !association) {
      return NextResponse.json({ ok: false, error: "Partner not found." }, { status: 404 });
    }

    const origin = (process.env.NEXT_PUBLIC_ONEOS_ORIGIN || request.nextUrl.origin).replace(/\/+$/, "");
    const { data: link, error: linkError } = await client.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${origin}/partner/login?notice=confirm` },
    });

    let authUserId = link?.user?.id ?? null;
    let actionLink = link?.properties?.action_link ?? null;

    // An existing Supabase account cannot be invited again: fall back to a
    // recovery link so the partner can set a password and sign in.
    if (linkError || !authUserId) {
      const { data: recovery, error: recoveryError } = await client.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${origin}/partner/login` },
      });
      if (recoveryError || !recovery?.user?.id) {
        throw new Error(recoveryError?.message ?? linkError?.message ?? "Could not create the partner sign-in.");
      }
      authUserId = recovery.user.id;
      actionLink = recovery.properties?.action_link ?? null;
    }

    const { error: profileError } = await client
      .from("oneos_users")
      .upsert(
        {
          email,
          name: name || association.name,
          role: "partner",
          is_active: true,
          supabase_auth_user_id: authUserId,
          partner_organisation_id: association.id,
          partner_org_id: association.id,
        },
        { onConflict: "email" },
      );
    if (profileError) throw new Error(profileError.message);

    // Keep the organisation claimable by the portal's active-only guards.
    if (association.status !== "active" || association.onboarding_status !== "active") {
      await client
        .from("associations")
        .update({ status: "active", onboarding_status: "active" })
        .eq("id", association.id);
    }

    const delivery = await sendEmail({
      to: email,
      replyTo: lifecycleReplyTo(),
      subject: `${association.name}: your Foundation-1 partner portal access`,
      text: [
        "Hello,",
        "",
        `Foundation-1 has opened partner portal access for ${association.name}.`,
        "",
        "Set your password and sign in here:",
        actionLink ?? `${origin}/partner/login`,
        "",
        "The portal shows every member who starts an assessment through your link, and the stage they have reached.",
        "",
        "Foundation-1 (Pty) Ltd",
      ].join("\n"),
    });

    return NextResponse.json({
      ok: true,
      email,
      actionLink,
      emailed: delivery.ok === true,
      emailSkipped: Boolean((delivery as { skipped?: boolean }).skipped),
    });
  } catch (caught) {
    return NextResponse.json(
      { ok: false, error: caught instanceof Error ? caught.message : "Could not grant portal access." },
      { status: 500 },
    );
  }
}

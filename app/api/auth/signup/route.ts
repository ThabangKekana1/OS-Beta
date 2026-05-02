import { NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import {
  buildAdminLeadShellFromSignup,
  defaultOwnerIdForRegistration,
  findSignupShellLeadByEmail,
} from "@/lib/client-registration";
import { consumeRateLimit } from "@/lib/rate-limit";
import { buildAuthRedirectUrl } from "@/lib/url";
import { upsertProfile } from "@/lib/users-db";
import { resolveServerSiteOrigin } from "@/lib/site-url.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

async function createSignupShell(input: { email: string; name: string }) {
  try {
    const { snapshot } = await readAdminStateSnapshot();
    const existingShell = findSignupShellLeadByEmail(snapshot.leads, input.email);
    const existingLead = snapshot.leads.find(
      (lead) => lead.userProfile.email.trim().toLowerCase() === input.email,
    );

    if (existingShell) {
      const refreshedLead = {
        ...existingShell,
        contactName: input.name || existingShell.contactName,
        contactFirstName: input.name ? input.name.split(/\s+/)[0] ?? existingShell.contactFirstName : existingShell.contactFirstName,
        contactSurname: input.name ? input.name.trim().split(/\s+/).slice(1).join(" ") : existingShell.contactSurname,
        userProfile: {
          ...existingShell.userProfile,
          fullName: input.name || existingShell.userProfile.fullName,
        },
        lastTouched: "Just now",
      };

      await writeAdminStateSnapshot(
        {
          ...snapshot,
          leads: snapshot.leads.map((lead) => (lead.id === existingShell.id ? refreshedLead : lead)),
          activeLeadId: existingShell.id,
        },
        "auth-signup-shell-refresh",
      );
      return;
    }

    if (existingLead) {
      return;
    }

    const created = buildAdminLeadShellFromSignup({
      name: input.name,
      email: input.email,
      ownerId: defaultOwnerIdForRegistration(null),
    });
    if (!created) {
      return;
    }

    await writeAdminStateSnapshot(
      {
        ...snapshot,
        leads: [created.lead, ...snapshot.leads],
        activeLeadId: created.leadId,
      },
      "auth-signup-shell-create",
    );
  } catch (error) {
    console.error("[auth/signup] failed to create admin signup shell", error);
  }
}

export async function POST(request: Request) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Sign-up is unavailable: Supabase Auth is not configured." },
      { status: 503 },
    );
  }

  const limit = await consumeRateLimit({
    scope: "auth-signup",
    key: clientKey(request),
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many sign-up attempts. Try again later." },
      { status: 429 },
    );
  }

  let payload: { email?: string; password?: string; name?: string };
  try {
    payload = (await request.json()) as { email?: string; password?: string; name?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const email = (payload.email ?? "").trim().toLowerCase();
  const password = payload.password ?? "";
  const name = (payload.name ?? "").trim();

  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { ok: false, error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }
  if (password.length > 128) {
    return NextResponse.json({ ok: false, error: "Password is too long." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const authRedirectTo = buildAuthRedirectUrl(
    resolveServerSiteOrigin(request),
    "/auth/confirm",
    "/workspace",
  );

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: authRedirectTo,
      data: name ? { full_name: name, name } : undefined,
    },
  });

  if (error) {
    const status = /registered|exists/i.test(error.message) ? 409 : 400;
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }

  // When email confirmation is enabled the session will be null until the user
  // confirms their address.
  const requiresConfirmation = !data.session;

  const resolvedName = name || email.split("@")[0] || "Client";
  await Promise.allSettled([
    upsertProfile({
      email,
      name: resolvedName,
      role: "client",
      isActive: true,
    }),
    createSignupShell({
      email,
      name: resolvedName,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    requiresConfirmation,
    email,
  });
}

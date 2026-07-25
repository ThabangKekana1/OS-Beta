import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import {
  isMigrationCaseWebsiteRequest,
  recordMigrationCaseEvent,
  type MigrationCaseRow,
} from "@/lib/migration-case-store";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Passwordless client access recovery. Rotates the secure case token for the
 * most recent cases registered to an email address and re-sends the private
 * links. Responds identically whether or not cases exist (no enumeration).
 * Rotation invalidates previously issued links — the step-up control from
 * the platform plan's token-security item.
 */
export async function POST(request: NextRequest) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 220) : "";
  if (!isEmail(email)) {
    return NextResponse.json({ ok: false, error: "Enter the email address used on the case." }, { status: 400 });
  }
  const limit = await consumeRateLimit({
    scope: "migration-case-recover",
    key: `${requestIp(request)}:${email}`,
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many recovery attempts. Try again later." }, { status: 429 });
  }

  const genericResponse = NextResponse.json(
    { ok: true, message: "If a migration case exists for that email, fresh secure links are on their way." },
    { headers: { "Cache-Control": "private, no-store" } },
  );

  try {
    const client = getSupabaseAdminClient();
    if (!client) return genericResponse;
    const { data: cases, error } = await client
      .from("migration_cases")
      .select("*")
      .eq("contact_email", email)
      .order("created_at", { ascending: false })
      .limit(3);
    if (error || !cases?.length) return genericResponse;

    const websiteOrigin = (process.env.NEXT_PUBLIC_WEBSITE_ORIGIN || "https://foundation-1.co.za")
      .replace(/\/+$/, "");
    const links: { reference: string; businessName: string; url: string }[] = [];

    for (const row of cases as MigrationCaseRow[]) {
      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(`migration-case:${token}`).digest("hex");
      const { error: rotateError } = await client
        .from("migration_cases")
        .update({ access_token_hash: tokenHash, token_hint: token.slice(-6), updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (rotateError) continue;
      links.push({
        reference: row.public_reference,
        businessName: row.business_name,
        url: `${websiteOrigin}/migration/case/${token}`,
      });
      await recordMigrationCaseEvent({
        caseId: row.id,
        eventType: "access_link_rotated",
        actorType: "client",
        detail: "Secure access link re-issued via client access recovery. Previous links are no longer valid.",
        metadata: { requestedFor: email },
      }).catch(() => undefined);
    }
    if (!links.length) return genericResponse;

    void sendEmail({
      to: email,
      replyTo: "support@foundation-1.co.za",
      subject: links.length === 1
        ? `${links[0].reference}: your secure migration case link`
        : "Your secure Foundation-1 migration case links",
      text: [
        "Hi,",
        "",
        "You asked for access to your Foundation-1 migration case. Fresh private links were issued; any previous links no longer work.",
        "",
        ...links.flatMap((link) => [`${link.businessName} (${link.reference})`, link.url, ""]),
        "Keep these links private. Anyone with a link can view the case.",
        "",
        "If you did not request this, reply to support@foundation-1.co.za.",
        "",
        "Foundation-1 (Pty) Ltd",
      ].join("\n"),
    }).catch(() => undefined);

    return genericResponse;
  } catch {
    return genericResponse;
  }
}

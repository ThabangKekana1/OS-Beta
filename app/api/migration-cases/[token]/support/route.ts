import { NextRequest, NextResponse } from "next/server";
import {
  findMigrationCaseByToken,
  isMigrationCaseWebsiteRequest,
  recordMigrationCaseEvent,
  type MigrationCaseSupportMessageRow,
} from "@/lib/migration-case-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { consumeRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORT_INBOX = "karman@foundation-1.co.za";

function cleanString(value: unknown, maxLength = 4000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function publicMessages(rows: MigrationCaseSupportMessageRow[]) {
  return rows.map((row) => ({
    id: row.id,
    at: row.created_at,
    from: row.author_type,
    authorName: row.author_name,
    message: row.message,
  }));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { token } = await params;
  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }
    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase admin configuration is unavailable.");
    const { data, error } = await client
      .from("migration_case_support_messages")
      .select("*")
      .eq("case_id", caseRow.id)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);
    return NextResponse.json(
      { ok: true, messages: publicMessages((data ?? []) as MigrationCaseSupportMessageRow[]) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to load support messages." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { token } = await params;
  const limit = await consumeRateLimit({
    scope: "migration-case-support",
    key: `${requestIp(request)}:${token.slice(-10)}`,
    limit: 20,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many messages. Try again a little later." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const message = cleanString(body.message);
  if (message.length < 3) {
    return NextResponse.json({ ok: false, error: "Write a short message first." }, { status: 400 });
  }

  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }
    const client = getSupabaseAdminClient();
    if (!client) throw new Error("Supabase admin configuration is unavailable.");
    const { error: insertError } = await client.from("migration_case_support_messages").insert({
      case_id: caseRow.id,
      author_type: "client",
      author_name: caseRow.contact_name,
      message,
    });
    if (insertError) throw new Error(insertError.message);

    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: "support_message_received",
      actorType: "client",
      detail: `Support message from ${caseRow.contact_name}: ${message.slice(0, 200)}`,
    }).catch(() => undefined);

    void sendEmail({
      to: SUPPORT_INBOX,
      replyTo: caseRow.contact_email,
      subject: `[Support] ${caseRow.public_reference} · ${caseRow.business_name}`,
      text: [
        `Support message from ${caseRow.contact_name} (${caseRow.contact_email}, ${caseRow.contact_phone})`,
        `Case: ${caseRow.public_reference} · stage ${caseRow.stage}`,
        "",
        message,
        "",
        "Reply directly to this email to reach the client.",
      ].join("\n"),
    }).catch(() => undefined);

    void createNotification({
      audience: "admin",
      kind: "new_lead",
      title: `Support: ${caseRow.business_name}`,
      body: message.slice(0, 240),
      link: "/admin/migration-cases",
      metadata: { migrationCaseId: caseRow.id, publicReference: caseRow.public_reference },
    });

    const { data } = await client
      .from("migration_case_support_messages")
      .select("*")
      .eq("case_id", caseRow.id)
      .order("created_at", { ascending: true })
      .limit(100);
    return NextResponse.json({
      ok: true,
      messages: publicMessages((data ?? []) as MigrationCaseSupportMessageRow[]),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to send the message." },
      { status: 500 },
    );
  }
}

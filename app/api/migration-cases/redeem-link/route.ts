import { NextRequest, NextResponse } from "next/server";
import { redeemCaseEmailLink } from "@/lib/case-email-links";
import {
  isMigrationCaseWebsiteRequest,
  recordMigrationCaseEvent,
} from "@/lib/migration-case-store";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/**
 * Redeems a lifecycle-email deep link.
 *
 * Server-to-server only: the public website calls this, never the browser.
 * A successful redemption rotates the workspace access token, so older links
 * for the same case stop working.
 */
export async function POST(request: NextRequest) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Link not recognised." }, { status: 400 });
  }

  const limit = await consumeRateLimit({
    scope: "migration-case-email-link",
    key: `${requestIp(request)}:${token.slice(-10)}`,
    limit: 20,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many attempts." }, { status: 429 });
  }

  const redeemed = await redeemCaseEmailLink(token);
  if (!redeemed) {
    return NextResponse.json({ ok: false, error: "Link not recognised." }, { status: 404 });
  }

  void recordMigrationCaseEvent({
    caseId: redeemed.caseRow.id,
    eventType: "email_link_followed",
    actorType: "client",
    detail: "Client opened the case from a lifecycle email. A fresh workspace link was issued.",
    metadata: { reference: redeemed.caseRow.public_reference },
  }).catch(() => undefined);

  return NextResponse.json(
    { ok: true, accessToken: redeemed.accessToken, reference: redeemed.caseRow.public_reference },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

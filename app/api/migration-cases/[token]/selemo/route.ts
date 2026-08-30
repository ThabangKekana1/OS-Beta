/**
 * The Selemo pledge, inside the case workspace. Opens after the mutual NDA;
 * stands entirely apart from the migration decision.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  findMigrationCaseByToken,
  isMigrationCaseWebsiteRequest,
} from "@/lib/migration-case-store";
import { selemoStatusForCase, signSelemoPledge, SELEMO_PLEDGE, SELEMO_SUBTITLE, SELEMO_TITLE } from "@/lib/selemo";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function ip(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { token } = await params;
  const caseRow = await findMigrationCaseByToken(token);
  if (!caseRow) return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
  const status = await selemoStatusForCase(caseRow.id);
  return NextResponse.json({
    ok: true,
    title: SELEMO_TITLE,
    subtitle: SELEMO_SUBTITLE,
    pledge: SELEMO_PLEDGE,
    available: Boolean(caseRow.nda_signed_at),
    ...status,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { token } = await params;
  const limit = await consumeRateLimit({
    scope: "selemo-sign",
    key: `${ip(request)}:${token.slice(-10)}`,
    limit: 6,
    windowSeconds: 3600,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const caseRow = await findMigrationCaseByToken(token);
  if (!caseRow) return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
  if (!caseRow.nda_signed_at) {
    return NextResponse.json({ ok: false, error: "The pledge opens after your NDA is signed." }, { status: 409 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const signerName = typeof body.signerName === "string" ? body.signerName.trim().slice(0, 160) : "";
  const signerPosition = typeof body.signerPosition === "string" ? body.signerPosition.trim().slice(0, 120) : "";
  if (!signerName) {
    return NextResponse.json({ ok: false, error: "Sign with your name; only the company appears publicly." }, { status: 400 });
  }
  const result = await signSelemoPledge({
    caseId: caseRow.id,
    companyName: caseRow.business_name,
    signerName,
    signerPosition,
  });
  return NextResponse.json({ ok: true, signed: true, signedAt: result.signedAt, company: caseRow.business_name });
}

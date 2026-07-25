import { NextRequest, NextResponse } from "next/server";
import { captureIndicativeReport, recordFunnelEvent } from "@/lib/report-capture";
import { isMigrationCaseWebsiteRequest } from "@/lib/migration-case-store";
import { consumeRateLimit } from "@/lib/rate-limit";
import { ENGINE_CONSTANTS } from "@/lib/pricing-engine";
import type { IndicativeMigrationReport } from "@/lib/indicative-migration-report";

export const runtime = "nodejs";

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function isEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(value);
}

/**
 * "Email me this report."
 *
 * Deliberately not a gate: the client already has the report on screen and can
 * download the PDF without giving anything up. This exists so the ones who want
 * a copy stop being invisible, and so prospects below the programme threshold
 * land on a register instead of a dead end.
 */
export async function POST(request: NextRequest) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }

  let body: {
    email?: unknown;
    contactName?: unknown;
    businessName?: unknown;
    report?: unknown;
    sourceCampaign?: unknown;
    partnerCampaignCode?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 220) : "";
  if (!isEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const limit = await consumeRateLimit({
    scope: "report-capture",
    key: `${requestIp(request)}:${email}`,
    limit: 6,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  const report = body.report as IndicativeMigrationReport | undefined;
  if (!report || typeof report !== "object" || !report.currentPath) {
    return NextResponse.json({ ok: false, error: "Report is missing." }, { status: 400 });
  }

  const spend = Number(report.currentPath.monthlySpendExVat);
  const minimumSpend = ENGINE_CONSTANTS.minMonthlySpend;
  const belowThreshold = !Number.isFinite(spend) || spend < minimumSpend;

  const stored = await captureIndicativeReport(
    {
      email,
      contactName: typeof body.contactName === "string" ? body.contactName : null,
      businessName: typeof body.businessName === "string" ? body.businessName : null,
      report,
      belowThreshold,
      sourceCampaign: typeof body.sourceCampaign === "string" ? body.sourceCampaign : null,
      partnerCampaignCode: typeof body.partnerCampaignCode === "string" ? body.partnerCampaignCode : null,
    },
    minimumSpend,
  );

  if (!stored) {
    return NextResponse.json(
      { ok: false, error: "Could not send the report just now. Try again shortly." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, belowThreshold });
}

/** Records a named funnel step from the public site. */
export async function PUT(request: NextRequest) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const event = typeof body.event === "string" ? body.event : "";
  if (event !== "report_generated") {
    return NextResponse.json({ ok: false, error: "Unsupported event." }, { status: 400 });
  }
  const limit = await consumeRateLimit({
    scope: "funnel-event",
    key: requestIp(request),
    limit: 60,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) return NextResponse.json({ ok: true });

  void recordFunnelEvent({
    event: "report_generated",
    monthlySpendExVat: typeof body.monthlySpendExVat === "number" ? body.monthlySpendExVat : null,
    province: typeof body.province === "string" ? body.province : null,
    placeContext: typeof body.placeContext === "string" ? body.placeContext : null,
    sourceCampaign: typeof body.sourceCampaign === "string" ? body.sourceCampaign : null,
    partnerCampaignCode: typeof body.partnerCampaignCode === "string" ? body.partnerCampaignCode : null,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}

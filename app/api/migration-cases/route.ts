import { NextRequest, NextResponse } from "next/server";
import { ENGINE_CONSTANTS } from "@/lib/pricing-engine";
import { isElectricitySupplyType, isTariffFamilyId } from "@/lib/indicative-migration-report";
import {
  createMigrationCase,
  isMigrationCaseWebsiteRequest,
} from "@/lib/migration-case-store";
import { consumeRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";
import {
  parsePartnerAttribution,
  PartnerAttributionError,
  resolvePartnerCaseAttribution,
} from "@/lib/partner-distribution";

export const runtime = "nodejs";

const CONTACT_METHODS = new Set(["email", "whatsapp", "phone"]);

function cleanString(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const businessName = cleanString(body.businessName, 180);
  const contactName = cleanString(body.contactName, 160);
  const contactEmail = cleanString(body.contactEmail, 220).toLowerCase();
  const contactPhone = cleanString(body.contactPhone, 80);
  const preferredContactMethod = cleanString(body.preferredContactMethod, 24).toLowerCase();
  const siteCity = cleanString(body.siteCity, 120);
  const province = cleanString(body.province, 120);
  const supplyType = cleanString(body.supplyType, 80);
  const monthlySpendExVat = Number(body.monthlySpendExVat);
  const monthlyKwhValue = Number(body.monthlyKwh);
  const monthlyKwh = Number.isFinite(monthlyKwhValue) && monthlyKwhValue > 0
    ? monthlyKwhValue
    : null;
  const sourceCampaign = cleanString(body.sourceCampaign, 180) || null;
  const referrer = cleanString(body.referrer, 500) || null;
  const tariffFamily = isTariffFamilyId(body.tariffFamily) ? body.tariffFamily : null;
  const placeMunicipality = cleanString(body.placeMunicipality, 160) || null;
  const placeContextRaw = cleanString(body.placeContext, 12);
  const placeContext = placeContextRaw === "metro" || placeContextRaw === "town" || placeContextRaw === "rural"
    ? placeContextRaw
    : null;
  const termsAccepted = body.termsAccepted === true;
  let partnerAttribution: ReturnType<typeof parsePartnerAttribution>;
  try {
    partnerAttribution = parsePartnerAttribution(
      body.partnerInviteToken,
      body.partnerCampaignCode,
    );
  } catch (error) {
    const status = error instanceof PartnerAttributionError
      ? error.status
      : 400;
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Partner attribution is invalid.",
      },
      { status },
    );
  }

  if (
    !businessName
    || !contactName
    || !contactEmail
    || !contactPhone
    || !siteCity
    || !province
  ) {
    return NextResponse.json(
      { ok: false, error: "Business, contact and site details are required." },
      { status: 400 },
    );
  }
  if (!termsAccepted) {
    return NextResponse.json(
      { ok: false, error: "Accept the terms of use and privacy notice to open a secure case." },
      { status: 400 },
    );
  }
  if (!isEmail(contactEmail)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  if (!CONTACT_METHODS.has(preferredContactMethod)) {
    return NextResponse.json({ ok: false, error: "Choose a valid contact method." }, { status: 400 });
  }
  if (!isElectricitySupplyType(supplyType)) {
    return NextResponse.json({ ok: false, error: "Choose who supplies electricity to the site." }, { status: 400 });
  }
  if (!Number.isFinite(monthlySpendExVat) || monthlySpendExVat < ENGINE_CONSTANTS.minMonthlySpend) {
    return NextResponse.json(
      {
        ok: false,
        error: `The migration programme currently starts at R${ENGINE_CONSTANTS.minMonthlySpend.toLocaleString("en-ZA")} monthly electricity charges before VAT.`,
      },
      { status: 400 },
    );
  }

  const limit = await consumeRateLimit({
    scope: "migration-case-create",
    key: `${requestIp(request)}:${contactEmail}`,
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many case requests. Try again later." },
      { status: 429 },
    );
  }

  try {
    const resolvedAttribution = await resolvePartnerCaseAttribution({
      attribution: partnerAttribution,
      contactEmail,
      businessName,
    });
    const result = await createMigrationCase({
      businessName,
      contactName,
      contactEmail,
      contactPhone,
      preferredContactMethod: preferredContactMethod as "email" | "whatsapp" | "phone",
      siteCity,
      province,
      supplyType,
      monthlySpendExVat,
      monthlyKwh,
      tariffFamily,
      placeMunicipality,
      placeContext,
      sourceCampaign,
      referrer,
      partnerReferralId: resolvedAttribution?.referralId ?? null,
      termsAcceptedAt: new Date().toISOString(),
    });
    const websiteOrigin = (process.env.NEXT_PUBLIC_WEBSITE_ORIGIN || "https://foundation-1.co.za")
      .replace(/\/+$/, "");
    const portalPath = `/migration/case/${result.token}`;
    const portalUrl = `${websiteOrigin}${portalPath}`;

    void sendEmail({
      to: contactEmail,
      replyTo: "support@foundation-1.co.za",
      subject: `${result.caseRow.public_reference}: your secure migration case`,
      text: [
        `Hi ${contactName},`,
        "",
        `Your indicative no-bill migration report for ${businessName} has been saved as ${result.caseRow.public_reference}.`,
        "",
        "Next, submit all six most recent utility billing periods together in one secure bill pack. We do not ask for a single bill first.",
        "",
        "Foundation-1 will validate the supplier, tariff, consumption, fixed charges and billing history, then complete the bill-audited migration proposal. The non-binding Expression of Interest appears only after that proposal is finished and supports a positive commercial case.",
        "",
        `Secure case link: ${portalUrl}`,
        "",
        "Keep this link private. It gives access to your migration case.",
        "",
        "Foundation-1 (Pty) Ltd",
        "support@foundation-1.co.za",
      ].join("\n"),
    }).catch(() => undefined);

    void createNotification({
      audience: "admin",
      kind: "new_lead",
      title: `New migration case: ${businessName}`,
      body: `${contactName} completed the no-bill report. Complete six-period bill pack is the next gate.`,
      link: "/admin/migration-cases",
      metadata: {
        migrationCaseId: result.caseRow.id,
        publicReference: result.caseRow.public_reference,
        contactEmail,
        monthlySpendExVat,
        preliminaryFit: result.report.preliminaryFit,
      },
    });

    return NextResponse.json({
      ok: true,
      caseReference: result.caseRow.public_reference,
      token: result.token,
      portalPath,
      report: result.report,
    });
  } catch (error) {
    const duplicateAttribution =
      error instanceof Error
      && /duplicate key|unique constraint|23505/i.test(error.message)
      && /partner_referral_id|migration_cases_partner_referral_id_uidx/i.test(error.message);
    const status = error instanceof PartnerAttributionError
      ? error.status
      : duplicateAttribution
        ? 409
        : 500;
    return NextResponse.json(
      {
        ok: false,
        error: duplicateAttribution
          ? "This partner link has already opened a migration case."
          : error instanceof Error
            ? error.message
            : "Unable to create the migration case.",
      },
      { status },
    );
  }
}

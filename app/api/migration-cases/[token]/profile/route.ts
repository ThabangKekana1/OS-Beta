import { NextRequest, NextResponse } from "next/server";
import {
  findMigrationCaseByToken,
  getMigrationCaseRelations,
  isMigrationCaseWebsiteRequest,
  publicMigrationCaseState,
  recordMigrationCaseEvent,
  updateMigrationCase,
  type MigrationCaseClientProfile,
} from "@/lib/migration-case-store";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function cleanString(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function requestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

const PROVINCES = new Set([
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo",
  "Mpumalanga", "Northern Cape", "North West", "Western Cape",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isMigrationCaseWebsiteRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 403 });
  }
  const { token } = await params;
  const limit = await consumeRateLimit({
    scope: "migration-case-profile",
    key: `${requestIp(request)}:${token.slice(-10)}`,
    limit: 12,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const registeredName = cleanString(body.registeredName, 180);
  const registrationNumber = cleanString(body.registrationNumber, 60);
  const vatNumber = cleanString(body.vatNumber, 40) || null;
  const addressStreet = cleanString(body.addressStreet, 220);
  const addressCity = cleanString(body.addressCity, 120);
  const addressProvince = cleanString(body.addressProvince, 40);
  const addressPostalCode = cleanString(body.addressPostalCode, 12) || null;
  const signerPosition = cleanString(body.signerPosition, 120);

  if (registeredName.length < 2) {
    return NextResponse.json({ ok: false, error: "Enter the registered business name." }, { status: 400 });
  }
  if (registrationNumber.length < 5) {
    return NextResponse.json({ ok: false, error: "Enter the company registration number." }, { status: 400 });
  }

  if (addressStreet.length < 4) {
    return NextResponse.json(
      { ok: false, error: "Enter the street address of the site." },
      { status: 400 },
    );
  }
  if (addressCity.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Enter the city or town." },
      { status: 400 },
    );
  }
  if (!PROVINCES.has(addressProvince)) {
    return NextResponse.json(
      { ok: false, error: "Choose the province." },
      { status: 400 },
    );
  }
  if (signerPosition.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Enter your position in the company." },
      { status: 400 },
    );
  }
  const physicalAddress = [addressStreet, addressCity, addressProvince, addressPostalCode]
    .filter(Boolean)
    .join(", ");

  try {
    const caseRow = await findMigrationCaseByToken(token);
    if (!caseRow) {
      return NextResponse.json({ ok: false, error: "Migration case not found." }, { status: 404 });
    }

    const profile: MigrationCaseClientProfile = {
      registeredName: registeredName || caseRow.business_name,
      registrationNumber,
      vatNumber,
      physicalAddress,
      addressStreet,
      addressCity,
      addressProvince,
      addressPostalCode,
      signerPosition,
    };
    const firstCompletion = !caseRow.profile_completed_at;
    const updatedCase = await updateMigrationCase(caseRow.id, {
      client_profile: profile,
      profile_completed_at: caseRow.profile_completed_at ?? new Date().toISOString(),
    });
    await recordMigrationCaseEvent({
      caseId: caseRow.id,
      eventType: firstCompletion ? "client_profile_completed" : "client_profile_updated",
      actorType: "client",
      detail: firstCompletion
        ? "The client completed the business profile (identity, site address, capacity)."
        : "The client updated the business profile.",
      metadata: { addressProvince, hasPostalCode: Boolean(addressPostalCode) },
    }).catch(() => undefined);

    const relations = await getMigrationCaseRelations(updatedCase);
    return NextResponse.json(publicMigrationCaseState(updatedCase, relations));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to save the business profile." },
      { status: 500 },
    );
  }
}

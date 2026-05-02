import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import { ADMIN_AGENTS } from "@/lib/admin-mock-data";
import {
  buildAdminLeadFromClientRegistration,
  defaultOwnerIdForRegistration,
  findSignupShellLeadByEmail,
  promoteSignupLeadToClientRegistration,
} from "@/lib/client-registration";
import { registrationLinkIdForProfile } from "@/lib/registration-links";
import type { AdminLeadRegistrationSource } from "@/lib/admin-types";

export const runtime = "nodejs";

function resolveRegistrationSource(linkId: string): AdminLeadRegistrationSource | null {
  const agent = ADMIN_AGENTS.find(
    (entry) => registrationLinkIdForProfile({
      email: `${entry.id}@agent.local`,
      role: "sales",
      agentId: entry.id,
    }) === linkId,
  );

  if (!agent) {
    return null;
  }

  return {
    linkId,
    profileName: agent.name,
    profileRole: "sales",
    profileAgentId: agent.id,
    channel: "public_link",
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> },
) {
  const { linkId } = await params;
  const source = resolveRegistrationSource(linkId);

  if (!source) {
    return NextResponse.json({ ok: false, error: "Registration link not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    source: {
      profileName: source.profileName,
      profileRole: source.profileRole,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> },
) {
  // 5 registrations per hour per IP — public endpoint, prone to abuse.
  const { consumeRateLimit } = await import("@/lib/rate-limit");
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const limit = await consumeRateLimit({
    scope: "register-public",
    key: ip,
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many registration attempts. Try again later." },
      { status: 429 },
    );
  }

  const { linkId } = await params;
  const source = resolveRegistrationSource(linkId);

  if (!source) {
    return NextResponse.json({ ok: false, error: "Registration link not found." }, { status: 404 });
  }

  let payload: {
    businessName?: unknown;
    businessRegistrationNumber?: unknown;
    industry?: unknown;
    contactFirstName?: unknown;
    contactSurname?: unknown;
    contactPosition?: unknown;
    contactEmail?: unknown;
    contactNumber?: unknown;
    monthlyElectricitySpendEstimateZar?: unknown;
    isBusinessRegistered?: unknown;
    isBusinessOperational?: unknown;
    hasSixMonthUtilityBill?: unknown;
    physicalAddress?: unknown;
    city?: unknown;
    province?: unknown;
  };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const registrationInput = {
    businessName: typeof payload.businessName === "string" ? payload.businessName : "",
    businessRegistrationNumber:
      typeof payload.businessRegistrationNumber === "string"
        ? payload.businessRegistrationNumber
        : "",
    industry: typeof payload.industry === "string" ? payload.industry : "",
    contactFirstName:
      typeof payload.contactFirstName === "string" ? payload.contactFirstName : "",
    contactSurname: typeof payload.contactSurname === "string" ? payload.contactSurname : "",
    contactPosition:
      typeof payload.contactPosition === "string" ? payload.contactPosition : "",
    contactEmail: typeof payload.contactEmail === "string" ? payload.contactEmail : "",
    contactNumber: typeof payload.contactNumber === "string" ? payload.contactNumber : "",
    monthlyElectricitySpendEstimateZar:
      typeof payload.monthlyElectricitySpendEstimateZar === "number"
        ? payload.monthlyElectricitySpendEstimateZar
        : Number(payload.monthlyElectricitySpendEstimateZar),
    isBusinessRegistered: payload.isBusinessRegistered === true,
    isBusinessOperational: payload.isBusinessOperational === true,
    hasSixMonthUtilityBill: payload.hasSixMonthUtilityBill === true,
    physicalAddress: typeof payload.physicalAddress === "string" ? payload.physicalAddress : "",
    city: typeof payload.city === "string" ? payload.city : "",
    province: typeof payload.province === "string" ? payload.province : "",
    source: "Migrate Portal",
    origin: "website",
    ownerId: defaultOwnerIdForRegistration(source),
    registrationSource: source,
  } as const;

  const { snapshot } = await readAdminStateSnapshot();
  const existingSignupShell = findSignupShellLeadByEmail(
    snapshot.leads,
    typeof payload.contactEmail === "string" ? payload.contactEmail : "",
  );
  const created = existingSignupShell
    ? promoteSignupLeadToClientRegistration(existingSignupShell, registrationInput)
    : buildAdminLeadFromClientRegistration(registrationInput);

  if (!created) {
    return NextResponse.json(
      { ok: false, error: "All registration fields are required." },
      { status: 400 },
    );
  }

  const nextSnapshot = {
    ...snapshot,
    leads: existingSignupShell
      ? [created.lead, ...snapshot.leads.filter((lead) => lead.id !== existingSignupShell.id)]
      : [created.lead, ...snapshot.leads],
    activeLeadId: created.leadId,
  };
  const backend = await writeAdminStateSnapshot(nextSnapshot, `public-registration:${linkId}`);

  return NextResponse.json({
    ok: true,
    backend,
    clientProfileId: created.clientProfileId,
  });
}

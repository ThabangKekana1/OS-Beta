import { NextRequest, NextResponse } from "next/server";
import { findLeadsByEmailFromDatabase, upsertSingleLeadToDatabase } from "@/lib/supabase-db-store";
import {
  buildAdminLeadFromClientRegistration,
  completeExistingLeadFromClientRegistration,
  defaultOwnerIdForRegistration,
  findSignupShellLeadByEmail,
  promoteSignupLeadToClientRegistration,
} from "@/lib/client-registration";
import type { AdminLeadRegistrationSource } from "@/lib/admin-types";

export const runtime = "nodejs";

const PUBLIC_REGISTRATION_SOURCE: AdminLeadRegistrationSource = {
  linkId: "public-registration",
  profileName: "Website",
  profileRole: "admin",
  profileAgentId: null,
  partnerOrgId: null,
  channel: "public_link",
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  const { consumeRateLimit } = await import("@/lib/rate-limit");
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const limit = await consumeRateLimit({
    scope: "register-generic",
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
      typeof payload.businessRegistrationNumber === "string" ? payload.businessRegistrationNumber : "",
    industry: typeof payload.industry === "string" ? payload.industry : "",
    contactFirstName: typeof payload.contactFirstName === "string" ? payload.contactFirstName : "",
    contactSurname: typeof payload.contactSurname === "string" ? payload.contactSurname : "",
    contactPosition: typeof payload.contactPosition === "string" ? payload.contactPosition : "",
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
    partnerOrgId: null,
    ownerId: defaultOwnerIdForRegistration(PUBLIC_REGISTRATION_SOURCE),
    registrationSource: PUBLIC_REGISTRATION_SOURCE,
  } as const;

  const contactEmail = typeof payload.contactEmail === "string" ? payload.contactEmail : "";
  const emailLeads = await findLeadsByEmailFromDatabase(contactEmail);
  const existingSignupShell = findSignupShellLeadByEmail(emailLeads, contactEmail);
  const existingRegisteredLead = emailLeads.find((lead) => {
    if (existingSignupShell?.id === lead.id) return false;
    const sameEmail = normalize(lead.userProfile.email) === normalize(contactEmail);
    const sameRegistrationNumber =
      normalize(lead.businessRegistrationNumber) === normalize(registrationInput.businessRegistrationNumber);
    const sameBusinessName = normalize(lead.company) === normalize(registrationInput.businessName);
    return sameEmail && (sameRegistrationNumber || sameBusinessName);
  });
  const created = existingSignupShell
    ? promoteSignupLeadToClientRegistration(existingSignupShell, registrationInput)
    : existingRegisteredLead
      ? completeExistingLeadFromClientRegistration(existingRegisteredLead, registrationInput)
    : buildAdminLeadFromClientRegistration(registrationInput);

  if (!created) {
    return NextResponse.json(
      { ok: false, error: "All registration fields are required." },
      { status: 400 },
    );
  }

  const persisted = await upsertSingleLeadToDatabase(created.lead, "public-registration:generic");

  return NextResponse.json({
    ok: true,
    backend: persisted ? "supabase" : "local",
    leadId: created.leadId,
    clientProfileId: created.clientProfileId,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { readAdminStateSnapshot, writeAdminStateSnapshot } from "@/lib/admin-state-store";
import { getServerAuthSession } from "@/lib/auth-server";
import {
  buildAdminLeadFromClientRegistration,
  defaultOwnerIdForRegistration,
  findSignupShellLeadByEmail,
  promoteSignupLeadToClientRegistration,
} from "@/lib/client-registration";
import type { AdminLead, AdminLeadRegistrationSource } from "@/lib/admin-types";

export const runtime = "nodejs";

const leadSources: AdminLead["source"][] = ["Migrate Portal", "Referral", "Outbound"];

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}


function booleanValue(value: unknown) {
  return value === true;
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function sourceValue(value: unknown): AdminLead["source"] {
  return typeof value === "string" && leadSources.includes(value as AdminLead["source"])
    ? (value as AdminLead["source"])
    : "Migrate Portal";
}

export async function POST(request: NextRequest) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "partner") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!session.partnerOrgId) {
    return NextResponse.json(
      { ok: false, error: "Your account is not linked to a partner organisation." },
      { status: 403 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const registrationSource: AdminLeadRegistrationSource = {
    linkId: `partner-dashboard-${session.partnerOrgId}`,
    profileName: session.name,
    profileRole: "partner",
    profileAgentId: null,
    channel: "dashboard",
  };

  const registrationInput = {
    businessName: stringValue(payload.businessName),
    businessRegistrationNumber: stringValue(payload.businessRegistrationNumber),
    industry: stringValue(payload.industry),
    contactFirstName: stringValue(payload.contactFirstName),
    contactSurname: stringValue(payload.contactSurname),
    contactPosition: stringValue(payload.contactPosition),
    contactEmail: stringValue(payload.contactEmail),
    contactNumber: stringValue(payload.contactNumber),
    monthlyElectricitySpendEstimateZar: numberValue(payload.monthlyElectricitySpendEstimateZar),
    isBusinessRegistered: booleanValue(payload.isBusinessRegistered),
    isBusinessOperational: booleanValue(payload.isBusinessOperational),
    hasSixMonthUtilityBill: booleanValue(payload.hasSixMonthUtilityBill),
    physicalAddress: stringValue(payload.physicalAddress),
    city: stringValue(payload.city),
    province: stringValue(payload.province),
    source: sourceValue(payload.source),
    origin: "created",
    partnerOrgId: session.partnerOrgId,
    ownerId: defaultOwnerIdForRegistration(registrationSource),
    registrationSource,
  } as const;

  const { snapshot } = await readAdminStateSnapshot();
  const existingSignupShell = findSignupShellLeadByEmail(
    snapshot.leads,
    registrationInput.contactEmail,
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
  const backend = await writeAdminStateSnapshot(nextSnapshot, session.email);

  return NextResponse.json({
    ok: true,
    backend,
    leadId: created.leadId,
    clientProfileId: created.clientProfileId,
  });
}
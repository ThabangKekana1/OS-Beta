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
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { AdminLeadRegistrationSource } from "@/lib/admin-types";

export const runtime = "nodejs";

type RegistrationUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "sales" | "partner";
  agent_id: string | null;
  partner_org_id: string | null;
};

type RegistrationAgentRow = {
  id: string;
  name: string;
};

function matchesRegistrationLink(user: RegistrationUserRow, linkId: string) {
  const role = user.role === "partner" ? "partner" : user.role === "sales" ? "sales" : "admin";
  const candidateAgentIds = [
    user.agent_id,
    user.role === "sales" && !user.agent_id ? user.id : null,
    null,
  ];

  return candidateAgentIds.some(
    (agentId) => registrationLinkIdForProfile({ email: user.email, role, agentId }) === linkId,
  );
}

async function resolveDatabaseRegistrationSource(linkId: string): Promise<AdminLeadRegistrationSource | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data: users, error } = await supabase
    .from("oneos_users")
    .select("id, email, name, role, agent_id, partner_org_id")
    .in("role", ["admin", "sales", "partner"])
    .eq("is_active", true);

  if (error || !users) {
    if (error) console.error("[register] failed to load registration users", error);
    return null;
  }

  const rows = users as RegistrationUserRow[];
  const matchedUser = rows.find((user) => matchesRegistrationLink(user, linkId));
  if (!matchedUser) return null;

  const agentIds = Array.from(new Set(rows.map((user) => user.agent_id).filter((id): id is string => Boolean(id))));
  const agentsById = new Map<string, RegistrationAgentRow>();
  if (agentIds.length > 0) {
    const { data: agents, error: agentsError } = await supabase
      .from("oneos_agents")
      .select("id, name")
      .in("id", agentIds)
      .eq("is_active", true);
    if (agentsError) console.error("[register] failed to load registration agents", agentsError);
    for (const agent of (agents ?? []) as RegistrationAgentRow[]) {
      agentsById.set(agent.id, agent);
    }
  }

  const role = matchedUser.role === "partner" ? "partner" : matchedUser.role === "sales" ? "sales" : "admin";
  const agent = matchedUser.agent_id ? agentsById.get(matchedUser.agent_id) : null;
  return {
    linkId,
    profileName: agent?.name ?? matchedUser.name ?? matchedUser.email,
    profileRole: role,
    profileAgentId: role === "sales" ? (matchedUser.agent_id ?? matchedUser.id) : matchedUser.agent_id,
    partnerOrgId: role === "partner" ? matchedUser.partner_org_id : null,
    channel: "public_link",
  };
}

function resolveStaticRegistrationSource(linkId: string): AdminLeadRegistrationSource | null {
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

async function resolveRegistrationSource(linkId: string): Promise<AdminLeadRegistrationSource | null> {
  return (await resolveDatabaseRegistrationSource(linkId)) ?? resolveStaticRegistrationSource(linkId);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> },
) {
  const { linkId } = await params;
  const source = await resolveRegistrationSource(linkId);

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
  const source = await resolveRegistrationSource(linkId);

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
    partnerOrgId: source.partnerOrgId ?? null,
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

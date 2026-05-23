import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import { ADMIN_AGENTS } from "@/lib/admin-mock-data";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DbError = {
  code?: string;
  message?: string;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  agent_id: string | null;
  partner_org_id?: string | null;
  is_active: boolean | null;
  last_login_at: string | null;
  last_logout_at?: string | null;
  last_seen_at?: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AgentRow = {
  id: string;
  name: string;
  role: string;
  region: string;
  is_active: boolean | null;
};

type ThreadRow = {
  id: string;
  lead_id: string | null;
  client_profile_id: string | null;
  mailbox_owner_user_id: string | null;
  mailbox_address: string | null;
  mailbox_role: string | null;
  subject: string | null;
  participants: string[] | null;
  last_message_at: string;
  last_direction: "inbound" | "outbound" | null;
  unread_count: number | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  from_address: string;
  from_name: string | null;
  to_addresses: string[] | null;
  cc_addresses: string[] | null;
  subject: string | null;
  body_text: string | null;
  provider_id: string | null;
  sent_by_user_id: string | null;
  sent_at: string;
  created_at: string;
};

type AuditRow = {
  id: string;
  user_id: string | null;
  email: string;
  role: string | null;
  agent_id: string | null;
  event_type: "login" | "logout";
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

type SurveillanceProfile = {
  agentId: string;
  name: string;
  role: string;
  region: string;
  dashboardUsers: Array<{
    userId: string;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
    lastLoginAt: string | null;
    lastLogoutAt: string | null;
    lastSeenAt: string | null;
  }>;
  loginCount: number;
  logoutCount: number;
  emailThreadCount: number;
  emailSentCount: number;
  emailReceivedCount: number;
  unreadEmailCount: number;
  latestEmailAt: string | null;
  latestActivityAt: string | null;
  recentAuditEvents: Array<{
    id: string;
    eventType: "login" | "logout";
    email: string;
    at: string;
    ipAddress: string | null;
    userAgent: string | null;
  }>;
  recentMessages: Array<{
    id: string;
    threadId: string;
    leadId: string | null;
    leadCompany: string | null;
    direction: "inbound" | "outbound";
    subject: string | null;
    fromAddress: string;
    toAddresses: string[];
    ccAddresses: string[];
    sentAt: string;
    bodySnippet: string | null;
    providerId: string | null;
  }>;
};

function isMissingRelationOrColumn(error: DbError | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function compactText(value: string | null | undefined) {
  const text = (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 180) : null;
}

function maxIso(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function agentIdForUser(
  user: Pick<UserRow, "id" | "role" | "agent_id" | "name" | "email">,
  agentIdByName: Map<string, string>,
) {
  if (user.agent_id) return user.agent_id;
  const byName = agentIdByName.get(normalizeName(user.name));
  if (byName) return byName;
  const emailLocalPart = user.email.split("@")[0] ?? "";
  const byEmailName = agentIdByName.get(normalizeName(emailLocalPart.replace(/[-_.]+/g, " ")));
  if (byEmailName) return byEmailName;
  if (user.role === "sales" || user.role === "admin") return user.id;
  return null;
}

function operatorUsers(rows: UserRow[]) {
  const operatorRoles = new Set(["admin", "sales", "partner"]);
  return rows.filter((row) => operatorRoles.has(String(row.role).toLowerCase()));
}

function blankProfile(agentId: string, defaults?: Partial<SurveillanceProfile>): SurveillanceProfile {
  return {
    agentId,
    name: defaults?.name ?? agentId,
    role: defaults?.role ?? "Unlisted",
    region: defaults?.region ?? "Unknown",
    dashboardUsers: [],
    loginCount: 0,
    logoutCount: 0,
    emailThreadCount: 0,
    emailSentCount: 0,
    emailReceivedCount: 0,
    unreadEmailCount: 0,
    latestEmailAt: null,
    latestActivityAt: null,
    recentAuditEvents: [],
    recentMessages: [],
  };
}

async function listUsers(): Promise<UserRow[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const fullSelect =
    "id, email, name, role, agent_id, partner_org_id, is_active, last_login_at, last_logout_at, last_seen_at, created_at, updated_at";
  const baseSelect =
    "id, email, name, role, agent_id, partner_org_id, is_active, last_login_at, created_at, updated_at";
  const minimalSelect =
    "id, email, name, role, agent_id, is_active, created_at, updated_at";

  const full = await supabase
    .from("oneos_users")
    .select(fullSelect)
    .order("name", { ascending: true });

  if (!full.error) return operatorUsers((full.data ?? []) as UserRow[]);
  if (!isMissingRelationOrColumn(full.error)) throw full.error;

  const fallback = await supabase
    .from("oneos_users")
    .select(baseSelect)
    .order("name", { ascending: true });

  if (!fallback.error) {
    return operatorUsers(((fallback.data ?? []) as UserRow[]).map((row) => ({
      ...row,
      last_logout_at: null,
      last_seen_at: row.last_login_at,
    })));
  }

  if (isMissingRelationOrColumn(fallback.error)) {
    const minimal = await supabase
      .from("oneos_users")
      .select(minimalSelect)
      .order("name", { ascending: true });

    if (minimal.error) {
      if (isMissingRelationOrColumn(minimal.error)) return [];
      throw minimal.error;
    }

    return operatorUsers(((minimal.data ?? []) as UserRow[]).map((row) => ({
      ...row,
      partner_org_id: null,
      last_login_at: null,
      last_logout_at: null,
      last_seen_at: null,
    })));
  }

  if (fallback.error) {
    throw fallback.error;
  }
  return [];
}

async function listAgents(): Promise<AgentRow[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("oneos_agents")
    .select("id, name, role, region, is_active")
    .order("name", { ascending: true });

  if (error) {
    if (isMissingRelationOrColumn(error)) return [];
    throw error;
  }
  return (data ?? []) as AgentRow[];
}

async function listThreads(): Promise<ThreadRow[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("oneos_email_threads")
    .select("id, lead_id, client_profile_id, mailbox_owner_user_id, mailbox_address, mailbox_role, subject, participants, last_message_at, last_direction, unread_count, created_at, updated_at")
    .order("last_message_at", { ascending: false })
    .limit(2500);

  if (error) {
    if (isMissingRelationOrColumn(error)) return [];
    throw error;
  }
  return (data ?? []) as ThreadRow[];
}

async function listMessages(): Promise<MessageRow[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("oneos_email_messages")
    .select("id, thread_id, direction, from_address, from_name, to_addresses, cc_addresses, subject, body_text, provider_id, sent_by_user_id, sent_at, created_at")
    .order("sent_at", { ascending: false })
    .limit(2500);

  if (error) {
    if (isMissingRelationOrColumn(error)) return [];
    throw error;
  }
  return (data ?? []) as MessageRow[];
}

async function listAuditEvents(): Promise<AuditRow[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("oneos_user_audit_events")
    .select("id, user_id, email, role, agent_id, event_type, ip_address, user_agent, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    if (isMissingRelationOrColumn(error)) return [];
    throw error;
  }
  return (data ?? []) as AuditRow[];
}

export async function GET() {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [state, users, dbAgents, threads, messages, auditEvents] = await Promise.all([
    readAdminStateSnapshot(),
    listUsers(),
    listAgents(),
    listThreads(),
    listMessages(),
    listAuditEvents(),
  ]);
  const snapshot = state.snapshot;

  const profiles = new Map<string, SurveillanceProfile>();
  const agentIdByName = new Map<string, string>();
  const ensureProfile = (agentId: string, defaults?: Partial<SurveillanceProfile>) => {
    const existing = profiles.get(agentId);
    if (existing) {
      if (defaults?.name && existing.name === existing.agentId) existing.name = defaults.name;
      if (defaults?.role && existing.role === "Unlisted") existing.role = defaults.role;
      if (defaults?.region && existing.region === "Unknown") existing.region = defaults.region;
      return existing;
    }
    const next = blankProfile(agentId, defaults);
    profiles.set(agentId, next);
    return next;
  };

  for (const agent of ADMIN_AGENTS) {
    agentIdByName.set(normalizeName(agent.name), agent.id);
    ensureProfile(agent.id, {
      name: agent.name,
      role: agent.role,
      region: agent.region,
    });
  }

  for (const agent of dbAgents) {
    agentIdByName.set(normalizeName(agent.name), agent.id);
    ensureProfile(agent.id, {
      name: agent.name,
      role: agent.role,
      region: agent.region,
    });
  }

  const leadById = new Map(snapshot.leads.map((lead) => [lead.id, lead]));
  for (const lead of snapshot.leads) {
    ensureProfile(lead.ownerId);
  }

  const userById = new Map<string, UserRow>();
  const agentIdByUserId = new Map<string, string>();
  const agentIdByEmail = new Map<string, string>();

  for (const user of users) {
    userById.set(user.id, user);
    const agentId = agentIdForUser(user, agentIdByName);
    if (!agentId) continue;

    const profile = ensureProfile(agentId, {
      name: user.name,
      role: user.role === "admin" ? "Admin" : user.role === "partner" ? "Partner" : "Sales Agent",
    });

    agentIdByUserId.set(user.id, agentId);
    agentIdByEmail.set(user.email.trim().toLowerCase(), agentId);
    profile.dashboardUsers.push({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: Boolean(user.is_active),
      lastLoginAt: user.last_login_at ?? null,
      lastLogoutAt: user.last_logout_at ?? null,
      lastSeenAt: user.last_seen_at ?? user.last_login_at ?? null,
    });
    profile.latestActivityAt = maxIso(
      profile.latestActivityAt,
      user.last_seen_at ?? user.last_login_at ?? null,
    );
  }

  const currentSessionAgentId =
    session.agentId ??
    agentIdByName.get(normalizeName(session.name)) ??
    agentIdByName.get(normalizeName(session.email.split("@")[0]?.replace(/[-_.]+/g, " "))) ??
    null;
  if (currentSessionAgentId) {
    const profile = ensureProfile(currentSessionAgentId, {
      name: session.name,
      role: session.role === "admin" ? "Admin" : session.role === "partner" ? "Partner" : "Sales Agent",
    });
    const alreadyLinked = profile.dashboardUsers.some(
      (user) => user.email.trim().toLowerCase() === session.email.trim().toLowerCase(),
    );
    if (!alreadyLinked) {
      profile.dashboardUsers.unshift({
        userId: session.userId ?? session.email,
        email: session.email,
        name: session.name,
        role: session.role,
        isActive: true,
        lastLoginAt: null,
        lastLogoutAt: null,
        lastSeenAt: null,
      });
    }
  }

  const threadById = new Map(threads.map((thread) => [thread.id, thread]));
  const agentIdForThread = (thread: ThreadRow | null | undefined) => {
    if (!thread) return null;
    if (thread.mailbox_owner_user_id) {
      const agentId = agentIdByUserId.get(thread.mailbox_owner_user_id);
      if (agentId) return agentId;
    }
    if (thread.mailbox_address) {
      const agentId = agentIdByEmail.get(thread.mailbox_address.trim().toLowerCase());
      if (agentId) return agentId;
    }
    if (thread.lead_id) {
      const lead = leadById.get(thread.lead_id);
      if (lead?.ownerId) return lead.ownerId;
    }
    return null;
  };

  const countedThreads = new Set<string>();
  for (const thread of threads) {
    const agentId = agentIdForThread(thread);
    if (!agentId) continue;
    const profile = ensureProfile(agentId);
    countedThreads.add(thread.id);
    profile.emailThreadCount += 1;
    profile.unreadEmailCount += Math.max(0, Number(thread.unread_count ?? 0));
    profile.latestEmailAt = maxIso(profile.latestEmailAt, thread.last_message_at);
    profile.latestActivityAt = maxIso(profile.latestActivityAt, thread.last_message_at);
  }

  for (const message of messages) {
    const thread = threadById.get(message.thread_id);
    let agentId = message.sent_by_user_id ? agentIdByUserId.get(message.sent_by_user_id) ?? null : null;
    if (!agentId) agentId = agentIdForThread(thread);
    if (!agentId) continue;

    const profile = ensureProfile(agentId);
    if (message.direction === "outbound") {
      profile.emailSentCount += 1;
    } else {
      profile.emailReceivedCount += 1;
    }
    if (thread && !countedThreads.has(thread.id)) {
      countedThreads.add(thread.id);
      profile.emailThreadCount += 1;
      profile.unreadEmailCount += Math.max(0, Number(thread.unread_count ?? 0));
    }
    profile.latestEmailAt = maxIso(profile.latestEmailAt, message.sent_at);
    profile.latestActivityAt = maxIso(profile.latestActivityAt, message.sent_at);

    if (profile.recentMessages.length < 12) {
      const lead = thread?.lead_id ? leadById.get(thread.lead_id) : null;
      profile.recentMessages.push({
        id: message.id,
        threadId: message.thread_id,
        leadId: thread?.lead_id ?? null,
        leadCompany: lead?.company ?? null,
        direction: message.direction,
        subject: message.subject ?? thread?.subject ?? null,
        fromAddress: message.from_address,
        toAddresses: message.to_addresses ?? [],
        ccAddresses: message.cc_addresses ?? [],
        sentAt: message.sent_at,
        bodySnippet: compactText(message.body_text),
        providerId: message.provider_id,
      });
    }
  }

  for (const event of auditEvents) {
    const agentId =
      event.agent_id ??
      (event.user_id ? agentIdByUserId.get(event.user_id) ?? null : null) ??
      agentIdByEmail.get(event.email.trim().toLowerCase()) ??
      null;
    if (!agentId) continue;

    const profile = ensureProfile(agentId);
    if (event.event_type === "login") profile.loginCount += 1;
    if (event.event_type === "logout") profile.logoutCount += 1;
    profile.latestActivityAt = maxIso(profile.latestActivityAt, event.created_at);
    if (profile.recentAuditEvents.length < 10) {
      profile.recentAuditEvents.push({
        id: event.id,
        eventType: event.event_type,
        email: event.email,
        at: event.created_at,
        ipAddress: event.ip_address,
        userAgent: event.user_agent,
      });
    }
  }

  const responseProfiles = Array.from(profiles.values())
    .map((profile) => ({
      ...profile,
      dashboardUsers: profile.dashboardUsers.sort((a, b) =>
        (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""),
      ),
      recentAuditEvents: profile.recentAuditEvents.sort((a, b) => b.at.localeCompare(a.at)),
      recentMessages: profile.recentMessages.sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    }))
    .sort((a, b) => {
      const aTime = a.latestActivityAt ?? "";
      const bTime = b.latestActivityAt ?? "";
      if (aTime !== bTime) return bTime.localeCompare(aTime);
      return a.name.localeCompare(b.name);
    });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    profiles: responseProfiles,
  });
}

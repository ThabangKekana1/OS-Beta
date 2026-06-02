import { NextResponse } from "next/server";
import { getServerAuthSession } from "@/lib/auth-server";
import type { AdminLead } from "@/lib/admin-types";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportWindow = "24h" | "7d" | "30d";

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
  is_active: boolean | null;
  last_login_at: string | null;
  last_logout_at?: string | null;
  last_seen_at?: string | null;
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

type ThreadRow = {
  id: string;
  lead_id: string | null;
  mailbox_owner_user_id: string | null;
  mailbox_address: string | null;
  subject: string | null;
  participants: string[] | null;
  last_message_at: string;
  unread_count: number | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  from_address: string;
  to_addresses: string[] | null;
  subject: string | null;
  body_text: string | null;
  provider_id: string | null;
  sent_by_user_id: string | null;
  sent_at: string;
};

type ActivityAction = {
  id: string;
  type: "login" | "logout" | "email_sent" | "email_received" | "lead_note" | "lead_document" | "lead_event";
  at: string;
  title: string;
  detail: string;
  leadId: string | null;
  leadCompany: string | null;
};

type UserReport = {
  userId: string;
  agentId: string | null;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  lastLogoutAt: string | null;
  lastSeenAt: string | null;
  activeInWindow: boolean;
  activityScore: number;
  loginCount: number;
  logoutCount: number;
  emailSentCount: number;
  emailReceivedCount: number;
  leadNoteCount: number;
  leadDocumentCount: number;
  leadEventCount: number;
  assignedLeadCount: number;
  touchedLeadCount: number;
  staleAssignedLeadCount: number;
  openTaskCount: number;
  doneTaskCount: number;
  latestActivityAt: string | null;
  recentActions: ActivityAction[];
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

function reportWindowFromParam(value: string | null): ReportWindow {
  if (value === "24h" || value === "30d") return value;
  return "7d";
}

function windowStartFor(window: ReportWindow, now: Date) {
  const ms =
    window === "24h"
      ? 24 * 60 * 60 * 1000
      : window === "30d"
        ? 30 * 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms);
}

function parseTime(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function inWindow(value: string | null | undefined, startMs: number, endMs: number) {
  const time = parseTime(value);
  return time >= startMs && time <= endMs;
}

function maxIso(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return parseTime(a) >= parseTime(b) ? a : b;
}

function compactText(value: string | null | undefined) {
  const text = (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 180) : null;
}

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[-_.]+/g, " ").replace(/\s+/g, " ");
}

function samePerson(value: string | null | undefined, user: Pick<UserReport, "email" | "name">) {
  const text = (value ?? "").trim().toLowerCase();
  if (!text) return false;
  return text === normalizeEmail(user.email) || text === normalizeName(user.name) || text.includes(normalizeEmail(user.email));
}

async function listUsers(): Promise<UserRow[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const fullSelect =
    "id, email, name, role, agent_id, is_active, last_login_at, last_logout_at, last_seen_at";
  const fallbackSelect =
    "id, email, name, role, agent_id, is_active, last_login_at";

  const full = await supabase.from("oneos_users").select(fullSelect).order("name", { ascending: true });
  if (!full.error) return (full.data ?? []) as UserRow[];
  if (!isMissingRelationOrColumn(full.error)) throw full.error;

  const fallback = await supabase.from("oneos_users").select(fallbackSelect).order("name", { ascending: true });
  if (fallback.error) {
    if (isMissingRelationOrColumn(fallback.error)) return [];
    throw fallback.error;
  }

  return ((fallback.data ?? []) as UserRow[]).map((row) => ({
    ...row,
    last_logout_at: null,
    last_seen_at: row.last_login_at,
  }));
}

async function listAuditEvents(startIso: string): Promise<AuditRow[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("oneos_user_audit_events")
    .select("id, user_id, email, role, agent_id, event_type, ip_address, user_agent, created_at")
    .gte("created_at", startIso)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    if (isMissingRelationOrColumn(error)) return [];
    throw error;
  }
  return (data ?? []) as AuditRow[];
}

async function listThreads(): Promise<ThreadRow[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("oneos_email_threads")
    .select("id, lead_id, mailbox_owner_user_id, mailbox_address, subject, participants, last_message_at, unread_count")
    .order("last_message_at", { ascending: false })
    .limit(2500);

  if (error) {
    if (isMissingRelationOrColumn(error)) return [];
    throw error;
  }
  return (data ?? []) as ThreadRow[];
}

async function listMessages(startIso: string): Promise<MessageRow[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("oneos_email_messages")
    .select("id, thread_id, direction, from_address, to_addresses, subject, body_text, provider_id, sent_by_user_id, sent_at")
    .gte("sent_at", startIso)
    .order("sent_at", { ascending: false })
    .limit(2500);

  if (error) {
    if (isMissingRelationOrColumn(error)) return [];
    throw error;
  }
  return (data ?? []) as MessageRow[];
}

function createReportForUser(user: UserRow): UserReport {
  return {
    userId: user.id,
    agentId: user.agent_id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: Boolean(user.is_active),
    lastLoginAt: user.last_login_at ?? null,
    lastLogoutAt: user.last_logout_at ?? null,
    lastSeenAt: user.last_seen_at ?? user.last_login_at ?? null,
    activeInWindow: false,
    activityScore: 0,
    loginCount: 0,
    logoutCount: 0,
    emailSentCount: 0,
    emailReceivedCount: 0,
    leadNoteCount: 0,
    leadDocumentCount: 0,
    leadEventCount: 0,
    assignedLeadCount: 0,
    touchedLeadCount: 0,
    staleAssignedLeadCount: 0,
    openTaskCount: 0,
    doneTaskCount: 0,
    latestActivityAt: null,
    recentActions: [],
  };
}

function pushAction(report: UserReport, action: ActivityAction) {
  report.latestActivityAt = maxIso(report.latestActivityAt, action.at);
  report.recentActions.push(action);
}

function leadOwnerMatches(report: UserReport, lead: AdminLead) {
  if (report.agentId && lead.ownerId === report.agentId) return true;
  return false;
}

function actionUserForLeadValue(
  value: string | null | undefined,
  lead: AdminLead,
  reports: UserReport[],
) {
  return (
    reports.find((report) => samePerson(value, report)) ??
    reports.find((report) => leadOwnerMatches(report, lead)) ??
    null
  );
}

export async function GET(request: Request) {
  const session = await getServerAuthSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const reportWindow = reportWindowFromParam(url.searchParams.get("window"));
  const now = new Date();
  const windowStart = windowStartFor(reportWindow, now);
  const startIso = windowStart.toISOString();
  const endIso = now.toISOString();
  const startMs = windowStart.getTime();
  const endMs = now.getTime();

  const [state, users, auditEvents, threads, messages] = await Promise.all([
    readAdminStateSnapshot({ includeSalesLeads: true }),
    listUsers(),
    listAuditEvents(startIso),
    listThreads(),
    listMessages(startIso),
  ]);

  const reports = users
    .filter((user) => ["admin", "sales", "partner"].includes(String(user.role).toLowerCase()))
    .map(createReportForUser);
  const reportByUserId = new Map(reports.map((report) => [report.userId, report]));
  const reportByEmail = new Map(reports.map((report) => [normalizeEmail(report.email), report]));
  const reportByAgentId = new Map(
    reports.flatMap((report) => report.agentId ? [[report.agentId, report] as const] : []),
  );
  const threadById = new Map(threads.map((thread) => [thread.id, thread]));
  const leadById = new Map(state.snapshot.leads.map((lead) => [lead.id, lead]));

  for (const report of reports) {
    report.activeInWindow = inWindow(report.lastSeenAt, startMs, endMs);
  }

  for (const lead of state.snapshot.leads) {
    const owner = reportByAgentId.get(lead.ownerId);
    if (!owner) continue;
    owner.assignedLeadCount += 1;
    owner.openTaskCount += lead.tasks.filter((task) => task.status === "open").length;
    owner.doneTaskCount += lead.tasks.filter((task) => task.status === "done").length;
    if (inWindow(lead.lastTouched, startMs, endMs)) {
      owner.touchedLeadCount += 1;
      owner.latestActivityAt = maxIso(owner.latestActivityAt, lead.lastTouched);
    } else {
      owner.staleAssignedLeadCount += 1;
    }

    for (const note of lead.notes) {
      if (!inWindow(note.createdAt, startMs, endMs)) continue;
      const report = actionUserForLeadValue(note.author, lead, reports);
      if (!report) continue;
      report.leadNoteCount += 1;
      pushAction(report, {
        id: `note:${lead.id}:${note.id}`,
        type: "lead_note",
        at: note.createdAt,
        title: "Lead note added",
        detail: compactText(note.body) ?? "Note recorded.",
        leadId: lead.id,
        leadCompany: lead.company,
      });
    }

    for (const document of lead.documents) {
      if (!inWindow(document.uploadedAt, startMs, endMs)) continue;
      const report = actionUserForLeadValue(document.uploadedBy, lead, reports);
      if (!report) continue;
      report.leadDocumentCount += 1;
      pushAction(report, {
        id: `document:${lead.id}:${document.id}`,
        type: "lead_document",
        at: document.uploadedAt,
        title: "Document moved",
        detail: `${document.title} / ${document.status}`,
        leadId: lead.id,
        leadCompany: lead.company,
      });
    }

    for (const event of lead.events) {
      if (!inWindow(event.createdAt, startMs, endMs)) continue;
      const report = reportByAgentId.get(lead.ownerId);
      if (!report) continue;
      report.leadEventCount += 1;
      pushAction(report, {
        id: `event:${lead.id}:${event.id}`,
        type: "lead_event",
        at: event.createdAt,
        title: event.title,
        detail: compactText(event.detail) ?? "Lead event recorded.",
        leadId: lead.id,
        leadCompany: lead.company,
      });
    }
  }

  for (const event of auditEvents) {
    const report =
      (event.user_id ? reportByUserId.get(event.user_id) : null) ??
      (event.agent_id ? reportByAgentId.get(event.agent_id) : null) ??
      reportByEmail.get(normalizeEmail(event.email)) ??
      null;
    if (!report) continue;

    if (event.event_type === "login") report.loginCount += 1;
    else report.logoutCount += 1;
    pushAction(report, {
      id: `audit:${event.id}`,
      type: event.event_type,
      at: event.created_at,
      title: event.event_type === "login" ? "Logged in" : "Logged out",
      detail: `${event.ip_address ?? "No IP"} / ${event.user_agent ?? "No user agent"}`,
      leadId: null,
      leadCompany: null,
    });
  }

  for (const message of messages) {
    const thread = threadById.get(message.thread_id);
    const lead = thread?.lead_id ? leadById.get(thread.lead_id) ?? null : null;
    const report =
      (message.sent_by_user_id ? reportByUserId.get(message.sent_by_user_id) : null) ??
      (thread?.mailbox_owner_user_id ? reportByUserId.get(thread.mailbox_owner_user_id) : null) ??
      (thread?.mailbox_address ? reportByEmail.get(normalizeEmail(thread.mailbox_address)) : null) ??
      (lead?.ownerId ? reportByAgentId.get(lead.ownerId) : null) ??
      null;
    if (!report) continue;

    if (message.direction === "outbound") report.emailSentCount += 1;
    else report.emailReceivedCount += 1;
    pushAction(report, {
      id: `email:${message.id}`,
      type: message.direction === "outbound" ? "email_sent" : "email_received",
      at: message.sent_at,
      title: message.direction === "outbound" ? "Email sent" : "Email received",
      detail: compactText(message.subject ?? message.body_text) ?? "(no subject)",
      leadId: lead?.id ?? thread?.lead_id ?? null,
      leadCompany: lead?.company ?? null,
    });
  }

  for (const report of reports) {
    report.recentActions = report.recentActions
      .sort((a, b) => parseTime(b.at) - parseTime(a.at))
      .slice(0, 12);
    report.latestActivityAt = report.latestActivityAt ?? report.lastSeenAt;
    report.activeInWindow = report.activeInWindow || report.recentActions.length > 0;
    report.activityScore =
      report.loginCount * 2 +
      report.emailSentCount * 3 +
      report.emailReceivedCount * 2 +
      report.leadNoteCount * 2 +
      report.leadDocumentCount * 3 +
      report.leadEventCount +
      report.touchedLeadCount;
  }

  const sortedReports = reports.sort((a, b) => {
    if (b.activityScore !== a.activityScore) return b.activityScore - a.activityScore;
    return parseTime(b.latestActivityAt) - parseTime(a.latestActivityAt);
  });

  return NextResponse.json({
    generatedAt: endIso,
    window: reportWindow,
    windowStart: startIso,
    windowEnd: endIso,
    totals: {
      users: sortedReports.length,
      activeUsers: sortedReports.filter((report) => report.activeInWindow).length,
      inactiveUsers: sortedReports.filter((report) => !report.activeInWindow).length,
      logins: sortedReports.reduce((total, report) => total + report.loginCount, 0),
      emailsSent: sortedReports.reduce((total, report) => total + report.emailSentCount, 0),
      emailsReceived: sortedReports.reduce((total, report) => total + report.emailReceivedCount, 0),
      touchedLeads: sortedReports.reduce((total, report) => total + report.touchedLeadCount, 0),
      openTasks: sortedReports.reduce((total, report) => total + report.openTaskCount, 0),
    },
    users: sortedReports,
  });
}

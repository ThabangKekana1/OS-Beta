"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  Inbox,
  LogIn,
  LogOut,
  Mail,
  Search,
  Send,
  Users,
} from "lucide-react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import {
  adminLeadContactStatuses,
  adminLeadStages,
  type AdminLead,
  type AdminLeadStage,
} from "@/lib/admin-types";
import { cn } from "@/lib/utils";

const ALL = "all";
const TERMINAL_STAGES = new Set<AdminLeadStage>(["Onboarding Complete", "Disqualified"]);
const PROGRESS_STAGES = new Set<AdminLeadStage>([
  "EOI Generated",
  "EOI Signed",
  "Utility Bills Uploaded",
  "Compliance Pack Uploaded",
  "Term Sheet Uploaded",
  "Onboarding Complete",
]);

type LeadEngagement = {
  leadId: string;
  latestThreadId: string;
  lastMessageAt: string;
  lastDirection: "inbound" | "outbound" | null;
  unreadCount: number;
  state: "awaiting_reply" | "responded";
};

type AgentView = {
  id: string;
  name: string;
  role: string;
  region: string;
};

type ActivityItem = {
  id: string;
  agentId: string;
  agentName: string;
  leadId: string;
  company: string;
  title: string;
  detail: string;
  at: string;
  href: string;
  tone: "system" | "agent" | "client" | "email";
  score: number;
};

type AgentStats = {
  agent: AgentView;
  leads: AdminLead[];
  activeCount: number;
  qualifiedCount: number;
  contactedCount: number;
  notContactedCount: number;
  openTaskCount: number;
  doneTaskCount: number;
  awaitingReplyCount: number;
  respondedCount: number;
  notEmailedCount: number;
  documentReceivedCount: number;
  documentPendingCount: number;
  estimatedValueZar: number;
  riskCount: number;
  healthScore: number;
  lastActivity: ActivityItem | null;
};

type SurveillanceMessage = {
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
  recentMessages: SurveillanceMessage[];
};

type SurveillancePayload = {
  generatedAt: string;
  profiles: SurveillanceProfile[];
};

function leadHref(lead: AdminLead) {
  return `/admin/leads/${lead.clientProfileId || lead.id}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function coverageLabel(value: number, total: number) {
  const percentage = pct(value, total);
  const percentageLabel = total > 0 && value > 0 && percentage === 0 ? "<1%" : `${percentage}%`;
  return `${value} / ${percentageLabel}`;
}

function scoreTime(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
  const lower = value.toLowerCase();
  if (lower.includes("just now")) return Date.now();
  if (lower.includes("minute")) return Date.now() - 20 * 60_000;
  if (lower.includes("hour")) return Date.now() - 2 * 60 * 60_000;
  if (lower.includes("today")) return Date.now() - 6 * 60 * 60_000;
  if (lower.includes("yesterday")) return Date.now() - 30 * 60 * 60_000;
  return 1;
}

function formatActivityTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "Not recorded";
  return new Intl.DateTimeFormat("en-ZA", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-ZA", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function joinRecipients(values: string[]) {
  if (values.length === 0) return "No recipient recorded";
  if (values.length <= 2) return values.join(", ");
  return `${values.slice(0, 2).join(", ")} +${values.length - 2}`;
}

function isActiveLead(lead: AdminLead) {
  return !TERMINAL_STAGES.has(lead.stage);
}

function isQualifiedLead(lead: AdminLead) {
  return lead.contactStatus === "Converted" || PROGRESS_STAGES.has(lead.stage);
}

function getAgentName(agentById: Map<string, AgentView>, ownerId: string) {
  return agentById.get(ownerId)?.name ?? ownerId;
}

function buildActivityForLead(
  lead: AdminLead,
  agentById: Map<string, AgentView>,
  engagement: LeadEngagement | null,
) {
  const agentName = getAgentName(agentById, lead.ownerId);
  const href = leadHref(lead);
  const items: ActivityItem[] = [];

  if (engagement?.lastMessageAt) {
    items.push({
      id: `email-${lead.id}-${engagement.latestThreadId}`,
      agentId: lead.ownerId,
      agentName,
      leadId: lead.id,
      company: lead.company,
      title: engagement.state === "responded" ? "Client replied" : "Outbound email waiting",
      detail:
        engagement.state === "responded"
          ? `${lead.contactName} replied in the inbox.`
          : `Latest outbound message has not received a reply yet.`,
      at: engagement.lastMessageAt,
      href: engagement.latestThreadId
        ? `/admin/inbox?thread=${encodeURIComponent(engagement.latestThreadId)}`
        : href,
      tone: "email",
      score: scoreTime(engagement.lastMessageAt),
    });
  }

  for (const event of lead.events) {
    items.push({
      id: `event-${lead.id}-${event.id}`,
      agentId: lead.ownerId,
      agentName,
      leadId: lead.id,
      company: lead.company,
      title: event.title,
      detail: event.detail,
      at: event.createdAt,
      href,
      tone: event.tone,
      score: scoreTime(event.createdAt),
    });
  }

  for (const note of lead.notes) {
    items.push({
      id: `note-${lead.id}-${note.id}`,
      agentId: lead.ownerId,
      agentName,
      leadId: lead.id,
      company: lead.company,
      title: `Note by ${note.author}`,
      detail: note.body,
      at: note.createdAt,
      href,
      tone: "agent",
      score: scoreTime(note.createdAt),
    });
  }

  for (const document of lead.documents) {
    items.push({
      id: `document-${lead.id}-${document.id}`,
      agentId: lead.ownerId,
      agentName,
      leadId: lead.id,
      company: lead.company,
      title: `${document.title} ${document.status}`,
      detail: `${document.uploadedBy} uploaded ${document.fileType} from ${document.sourceWorkspace}.`,
      at: document.uploadedAt,
      href,
      tone: document.uploadedByType === "Client" ? "client" : "system",
      score: scoreTime(document.uploadedAt),
    });
  }

  if (items.length === 0 && lead.lastTouched) {
    items.push({
      id: `touch-${lead.id}`,
      agentId: lead.ownerId,
      agentName,
      leadId: lead.id,
      company: lead.company,
      title: "Lead touched",
      detail: lead.nextAction || lead.stage,
      at: lead.lastTouched,
      href,
      tone: "system",
      score: scoreTime(lead.lastTouched),
    });
  }

  return items;
}

function engagementTone(engagement: LeadEngagement | null) {
  if (engagement?.state === "responded") return "Responded";
  if (engagement?.state === "awaiting_reply") return "Awaiting reply";
  return "Not emailed";
}

function getLeadRisk(lead: AdminLead, engagement: LeadEngagement | null) {
  if (!isActiveLead(lead)) return null;

  const reasons: string[] = [];
  if (lead.contactStatus === "Not Contacted") reasons.push("not contacted");
  if (!engagement) reasons.push("no email thread");
  if (engagement?.state === "awaiting_reply") reasons.push("awaiting reply");
  const openTasks = lead.tasks.filter((task) => task.status === "open").length;
  if (openTasks > 0) reasons.push(`${openTasks} open task${openTasks === 1 ? "" : "s"}`);
  if (lead.stage === "Client Registered") reasons.push("registration not advanced");

  if (reasons.length === 0) return null;
  return reasons.join(" / ");
}

function buildAgentHealthScore(input: {
  total: number;
  contactedCount: number;
  qualifiedCount: number;
  respondedCount: number;
  awaitingReplyCount: number;
  openTaskCount: number;
  doneTaskCount: number;
  riskCount: number;
}) {
  if (input.total <= 0) return 0;

  const contactScore = pct(input.contactedCount, input.total) * 0.24;
  const progressScore = pct(input.qualifiedCount, input.total) * 0.32;
  const emailTotal = input.respondedCount + input.awaitingReplyCount;
  const emailScore = (emailTotal > 0 ? pct(input.respondedCount, emailTotal) : 0) * 0.18;
  const taskTotal = input.openTaskCount + input.doneTaskCount;
  const taskScore = (taskTotal > 0 ? pct(input.doneTaskCount, taskTotal) : 100) * 0.18;
  const readinessScore = Math.min(100, Math.round((contactScore + progressScore + emailScore + taskScore) / 0.92));
  const riskPenalty = Math.min(38, input.riskCount * 4);

  return Math.max(0, Math.min(100, readinessScore - riskPenalty));
}

function splitIntoChunks<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function ActivityToneDot({ tone }: { tone: ActivityItem["tone"] }) {
  return (
    <span
      className={cn(
        "mt-1 size-2 rounded-full",
        tone === "client" && "bg-emerald-300",
        tone === "agent" && "bg-sky-300",
        tone === "email" && "bg-amber-300",
        tone === "system" && "bg-white/45",
      )}
    />
  );
}

function SignalMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        tone === "neutral" && "border-white/10 bg-white/[0.03]",
        tone === "good" && "border-emerald-300/25 bg-emerald-500/10",
        tone === "warn" && "border-amber-300/25 bg-amber-500/10",
        tone === "bad" && "border-rose-300/25 bg-rose-500/10",
      )}
    >
      <p className="text-[0.62rem] font-medium uppercase text-white/42">{label}</p>
      <p className="mt-1 text-base font-semibold text-white">{value}</p>
    </div>
  );
}

function AgentCommandCard({
  stats,
  selected,
  onSelect,
}: {
  stats: AgentStats;
  selected: boolean;
  onSelect: () => void;
}) {
  const total = stats.leads.length;
  const qualifiedPct = pct(stats.qualifiedCount, total);
  const contactPct = pct(stats.contactedCount, total);
  const healthTone =
    stats.healthScore >= 70 ? "text-emerald-100" : stats.healthScore >= 42 ? "text-amber-100" : "text-rose-100";
  const healthBorder =
    stats.healthScore >= 70 ? "border-emerald-300/28" : stats.healthScore >= 42 ? "border-amber-300/28" : "border-rose-300/28";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group min-w-0 rounded-lg border bg-white/[0.025] p-4 text-left transition hover:border-white/22 hover:bg-white/[0.05]",
        selected ? "border-white/28 bg-white/[0.07]" : "border-white/10",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-white">{stats.agent.name}</p>
          <p className="mt-1 text-xs text-white/42">{stats.agent.role} / {stats.agent.region}</p>
        </div>
        <div
          className={cn(
            "flex size-16 shrink-0 items-center justify-center rounded-full border bg-black/45",
            healthBorder,
          )}
          style={{
            background: `conic-gradient(rgba(255,255,255,.88) ${stats.healthScore * 3.6}deg, rgba(255,255,255,.08) 0deg)`,
          }}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-black text-sm font-semibold text-white">
            {stats.healthScore}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <SignalMetric label="Active" value={String(stats.activeCount)} />
        <SignalMetric
          label="Risk"
          value={String(stats.riskCount)}
          tone={stats.riskCount > 0 ? "warn" : "good"}
        />
        <SignalMetric
          label="Tasks"
          value={String(stats.openTaskCount)}
          tone={stats.openTaskCount > 0 ? "warn" : "good"}
        />
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs text-white/46">
            <span>Qualified progress</span>
            <span>{qualifiedPct}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-white/80" style={{ width: `${qualifiedPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs text-white/46">
            <span>Contacted coverage</span>
            <span>{contactPct}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-emerald-300" style={{ width: `${contactPct}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-emerald-300/24 bg-emerald-500/10 px-2 py-1 text-[0.58rem] font-semibold uppercase text-emerald-100">
          {stats.respondedCount} replies
        </span>
        <span className="rounded-full border border-amber-300/24 bg-amber-500/10 px-2 py-1 text-[0.58rem] font-semibold uppercase text-amber-100">
          {stats.awaitingReplyCount} waiting
        </span>
        <span className="rounded-full border border-white/10 px-2 py-1 text-[0.58rem] font-semibold uppercase text-white/44">
          {stats.notEmailedCount} not emailed
        </span>
      </div>

      <div className="mt-4 border-t border-white/8 pt-3">
        <p className={cn("text-xs font-semibold uppercase", healthTone)}>
          {stats.healthScore >= 70 ? "Healthy operator" : stats.healthScore >= 42 ? "Needs pressure" : "Critical watch"}
        </p>
        <p className="mt-1 truncate text-xs text-white/42">
          {stats.lastActivity
            ? `${stats.lastActivity.title} / ${formatActivityTime(stats.lastActivity.at)}`
            : "No activity recorded"}
        </p>
      </div>
    </button>
  );
}

function AgentSurveillancePanel({
  stats,
  profile,
  activity,
  engagementByLeadId,
  surveillanceLoaded,
}: {
  stats: AgentStats | null;
  profile: SurveillanceProfile | null;
  activity: ActivityItem[];
  engagementByLeadId: Record<string, LeadEngagement>;
  surveillanceLoaded: boolean;
}) {
  if (!stats) {
    return (
      <section className="app-surface rounded-lg p-5">
        <p className="text-sm text-white/52">No agent data is available to inspect.</p>
      </section>
    );
  }

  const primaryUser = profile?.dashboardUsers[0] ?? null;
  const userStatus = !surveillanceLoaded
    ? "Loading dashboard identity"
    : !primaryUser
    ? "No dashboard user linked"
    : primaryUser.isActive
      ? "Dashboard user active"
      : "Dashboard user disabled";
  const totalLeads = stats.leads.length;
  const contactCoverage = pct(stats.contactedCount, totalLeads);
  const stageBreakdown = adminLeadStages.map((stage) => ({
    stage,
    count: stats.leads.filter((lead) => lead.stage === stage).length,
  }));
  const contactBreakdown = adminLeadContactStatuses.map((status) => ({
    status,
    count: stats.leads.filter((lead) => lead.contactStatus === status).length,
  }));
  const pressureLeads = stats.leads
    .map((lead) => {
      const engagement = engagementByLeadId[lead.id] ?? null;
      const openTasks = lead.tasks.filter((task) => task.status === "open").length;
      return {
        lead,
        engagement,
        openTasks,
        risk: getLeadRisk(lead, engagement),
      };
    })
    .filter((entry) => entry.risk || entry.lead.contactStatus === "Not Contacted" || !entry.engagement)
    .sort((a, b) => {
      if (a.lead.contactStatus === "Not Contacted" && b.lead.contactStatus !== "Not Contacted") return -1;
      if (b.lead.contactStatus === "Not Contacted" && a.lead.contactStatus !== "Not Contacted") return 1;
      return scoreTime(b.lead.lastTouched) - scoreTime(a.lead.lastTouched);
    })
    .slice(0, 8);

  return (
    <section className="app-surface rounded-lg p-5">
      <div className="flex flex-col gap-3 border-b border-white/8 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="line-label">Agent Profile</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold text-white">{stats.agent.name}</h2>
            <span className="rounded-full border border-white/12 px-2.5 py-1 text-[0.62rem] font-semibold uppercase text-white/52">
              {userStatus}
            </span>
          </div>
          <p className="mt-2 text-sm text-white/52">
            {stats.agent.role} / {stats.agent.region}
            {primaryUser ? ` / ${primaryUser.email}` : ""}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-2 text-xs font-semibold uppercase text-white/58">
          <Eye className="size-4" />
          Surveillance Profile
        </div>
      </div>

      <div className="mt-5 border-b border-white/8 pb-3">
        <p className="line-label">Pressure Metrics</p>
        <h3 className="mt-2 text-lg font-semibold text-white">Lead coverage, progress, task debt, and missing action</h3>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <SignalMetric label="Total leads" value={String(totalLeads)} />
        <SignalMetric label="Active leads" value={String(stats.activeCount)} />
        <SignalMetric label="Pipeline value" value={formatCurrency(stats.estimatedValueZar)} />
        <SignalMetric label="Contacted" value={coverageLabel(stats.contactedCount, totalLeads)} tone="good" />
        <SignalMetric
          label="Not contacted"
          value={String(stats.notContactedCount)}
          tone={stats.notContactedCount > 0 ? "bad" : "good"}
        />
        <SignalMetric
          label="No email thread"
          value={String(stats.notEmailedCount)}
          tone={stats.notEmailedCount > 0 ? "warn" : "good"}
        />
        <SignalMetric label="Qualified" value={coverageLabel(stats.qualifiedCount, totalLeads)} />
        <SignalMetric
          label="Risk items"
          value={String(stats.riskCount)}
          tone={stats.riskCount > 0 ? "bad" : "good"}
        />
        <SignalMetric
          label="Open tasks"
          value={String(stats.openTaskCount)}
          tone={stats.openTaskCount > 0 ? "warn" : "good"}
        />
        <SignalMetric label="Done tasks" value={String(stats.doneTaskCount)} tone="good" />
        <SignalMetric
          label="Awaiting reply"
          value={String(stats.awaitingReplyCount)}
          tone={stats.awaitingReplyCount > 0 ? "warn" : "neutral"}
        />
        <SignalMetric label="Client replies" value={String(stats.respondedCount)} tone="good" />
        <SignalMetric label="Docs received" value={String(stats.documentReceivedCount)} />
        <SignalMetric
          label="Docs pending"
          value={String(stats.documentPendingCount)}
          tone={stats.documentPendingCount > 0 ? "warn" : "good"}
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SignalMetric label="Last login" value={formatDateTime(primaryUser?.lastLoginAt)} />
        <SignalMetric label="Last seen" value={formatDateTime(primaryUser?.lastSeenAt)} />
        <SignalMetric label="Sent emails" value={String(profile?.emailSentCount ?? 0)} tone="good" />
        <SignalMetric label="Received" value={String(profile?.emailReceivedCount ?? 0)} tone="neutral" />
        <SignalMetric
          label="Unread"
          value={String(profile?.unreadEmailCount ?? 0)}
          tone={(profile?.unreadEmailCount ?? 0) > 0 ? "warn" : "good"}
        />
        <SignalMetric label="Threads" value={String(profile?.emailThreadCount ?? 0)} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-lg border border-white/8 bg-white/[0.025] p-4">
          <div className="border-b border-white/8 pb-3">
            <p className="line-label">Stage Progress</p>
            <h3 className="mt-2 text-lg font-semibold text-white">How far this agent has pushed the book</h3>
          </div>
          <div className="mt-4 space-y-3">
            {stageBreakdown.map(({ stage, count }) => {
              const width = Math.max(count > 0 ? 4 : 0, pct(count, Math.max(totalLeads, 1)));
              return (
                <div key={stage}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-white/72">{stage}</span>
                    <span className="text-white/42">{count}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        stage === "Disqualified" ? "bg-rose-300" : "bg-white/72",
                      )}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-white/8 bg-white/[0.025] p-4">
          <div className="border-b border-white/8 pb-3">
            <p className="line-label">Pressure Queue</p>
            <h3 className="mt-2 text-lg font-semibold text-white">Leads needing manager pressure</h3>
          </div>
          <div className="mt-4 grid gap-2">
            {pressureLeads.length ? (
              pressureLeads.map(({ lead, engagement, openTasks, risk }) => (
                <Link
                  key={lead.id}
                  href={leadHref(lead)}
                  className="block rounded-lg border border-white/8 bg-black/20 p-3 transition hover:border-white/18 hover:bg-white/[0.05]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{lead.company}</p>
                      <p className="mt-1 text-xs text-white/44">
                        {lead.contactStatus} / {lead.stage}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/12 px-2 py-1 text-[0.58rem] font-semibold uppercase text-white/50">
                      {engagementTone(engagement)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-amber-100/76">
                    {risk ?? `${openTasks} open task${openTasks === 1 ? "" : "s"}`}
                  </p>
                </Link>
              ))
            ) : (
              <p className="rounded-lg border border-white/8 bg-black/20 p-4 text-sm text-white/52">
                No pressure queue items for this agent.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-white/8 bg-white/[0.025] p-4">
        <div className="flex flex-col gap-2 border-b border-white/8 pb-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="line-label">Contact Status</p>
            <h3 className="mt-2 text-lg font-semibold text-white">Contacted, not contacted, follow-up, and conversion split</h3>
          </div>
          <p className="text-xs font-semibold uppercase text-white/42">
            {contactCoverage}% coverage
          </p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {contactBreakdown.map(({ status, count }) => (
            <div key={status} className="rounded-lg border border-white/8 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/72">{status}</span>
                <span className="text-white/42">{count}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className={cn(
                    "h-full rounded-full",
                    status === "Not Contacted" ? "bg-rose-300" : status === "Converted" ? "bg-emerald-300" : "bg-white/70",
                  )}
                  style={{ width: `${Math.max(count > 0 ? 4 : 0, pct(count, Math.max(totalLeads, 1)))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="rounded-lg border border-white/8 bg-white/[0.025] p-4">
          <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3">
            <div>
              <p className="line-label">Emails Sent / Received</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Recent message trail</h3>
            </div>
            <Mail className="size-5 text-white/46" />
          </div>

          <div className="mt-3 grid gap-2">
            {profile?.recentMessages.length ? (
              profile.recentMessages.slice(0, 8).map((message) => (
                <Link
                  key={message.id}
                  href={`/admin/inbox?thread=${encodeURIComponent(message.threadId)}`}
                  className="grid gap-3 rounded-lg border border-white/8 bg-black/20 p-3 transition hover:border-white/18 hover:bg-white/[0.05] md:grid-cols-[7rem_minmax(0,1fr)_9rem]"
                >
                  <span
                    className={cn(
                      "inline-flex h-8 items-center justify-center gap-1.5 rounded-full border px-2 text-[0.62rem] font-semibold uppercase",
                      message.direction === "outbound"
                        ? "border-emerald-300/24 bg-emerald-500/10 text-emerald-100"
                        : "border-sky-300/24 bg-sky-500/10 text-sky-100",
                    )}
                  >
                    {message.direction === "outbound" ? <Send className="size-3" /> : <Inbox className="size-3" />}
                    {message.direction === "outbound" ? "Sent" : "Received"}
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-white">{message.subject ?? "(no subject)"}</p>
                      {message.leadCompany ? (
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[0.58rem] font-semibold uppercase text-white/42">
                          {message.leadCompany}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-white/44">
                      From {message.fromAddress} / To {joinRecipients(message.toAddresses)}
                    </p>
                    {message.bodySnippet ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/46">{message.bodySnippet}</p>
                    ) : null}
                  </div>
                  <div className="flex items-start justify-between gap-2 text-xs text-white/42 md:justify-end md:text-right">
                    <span>{formatDateTime(message.sentAt)}</span>
                    <ExternalLink className="size-3.5 shrink-0" />
                  </div>
                </Link>
              ))
            ) : (
              <p className="rounded-lg border border-white/8 bg-black/20 p-4 text-sm text-white/52">
                No stored email messages are linked to this agent yet.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border border-white/8 bg-white/[0.025] p-4">
            <div className="border-b border-white/8 pb-3">
              <p className="line-label">Dashboard Identity</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Linked user profiles</h3>
            </div>
            <div className="mt-3 grid gap-2">
              {profile?.dashboardUsers.length ? (
                profile.dashboardUsers.map((user) => (
                  <div key={user.userId} className="rounded-lg border border-white/8 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{user.name}</p>
                        <p className="mt-1 truncate text-xs text-white/44">{user.email}</p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-1 text-[0.58rem] font-semibold uppercase",
                          user.isActive
                            ? "border-emerald-300/24 bg-emerald-500/10 text-emerald-100"
                            : "border-rose-300/24 bg-rose-500/10 text-rose-100",
                        )}
                      >
                        {user.isActive ? "Active" : "Disabled"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-white/38">
                      Login {formatDateTime(user.lastLoginAt)} / Seen {formatDateTime(user.lastSeenAt)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-white/8 bg-black/20 p-4 text-sm text-white/52">
                  {surveillanceLoaded
                    ? "No dashboard user is linked to this agent yet."
                    : "Loading linked dashboard user profiles."}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-white/8 bg-white/[0.025] p-4">
            <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-3">
              <div>
                <p className="line-label">Login Audit</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Session movement</h3>
              </div>
              <LogIn className="size-5 text-white/46" />
            </div>

            <div className="mt-3 grid gap-2">
              {profile?.recentAuditEvents.length ? (
                profile.recentAuditEvents.slice(0, 8).map((event) => (
                  <div key={event.id} className="rounded-lg border border-white/8 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-sm font-medium text-white">
                          {event.eventType === "login" ? <LogIn className="size-4 text-emerald-200" /> : <LogOut className="size-4 text-amber-200" />}
                          {event.eventType === "login" ? "Logged in" : "Logged out"}
                        </p>
                        <p className="mt-1 text-xs text-white/42">{event.email}</p>
                      </div>
                      <span className="text-xs text-white/44">{formatDateTime(event.at)}</span>
                    </div>
                    <p className="mt-2 line-clamp-1 text-xs text-white/36">
                      {event.ipAddress ?? "No IP recorded"} / {event.userAgent ?? "No user agent recorded"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-white/8 bg-black/20 p-4 text-sm text-white/52">
                  No login/logout audit events recorded yet. New logins are now recorded from the dashboard login flow.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-white/8 bg-white/[0.025] p-4">
            <div className="border-b border-white/8 pb-3">
              <p className="line-label">Assigned Leads</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Current book and next actions</h3>
            </div>
            <div className="mt-3 grid gap-2">
              {stats.leads.slice(0, 8).map((lead) => (
                <Link
                  key={lead.id}
                  href={leadHref(lead)}
                  className="block rounded-lg border border-white/8 bg-black/20 p-3 transition hover:border-white/18 hover:bg-white/[0.05]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{lead.company}</p>
                      <p className="mt-1 text-xs text-white/44">
                        {lead.contactStatus} / {lead.stage}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-white/42">{formatDateTime(lead.lastTouched)}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/46">{lead.nextAction}</p>
                </Link>
              ))}
              {stats.leads.length === 0 ? (
                <p className="rounded-lg border border-white/8 bg-black/20 p-4 text-sm text-white/52">
                  No leads are assigned to this agent.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-white/8 bg-white/[0.025] p-4">
        <div className="border-b border-white/8 pb-3">
          <p className="line-label">Recorded Moves</p>
          <h3 className="mt-2 text-lg font-semibold text-white">Lead notes, tasks, documents, and email activity</h3>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {activity.length ? (
            activity.slice(0, 8).map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-3 rounded-lg border border-white/8 bg-black/20 p-3 transition hover:border-white/18 hover:bg-white/[0.05]"
              >
                <ActivityToneDot tone={item.tone} />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-white">{item.title}</p>
                    <span className="shrink-0 text-xs text-white/38">{formatDateTime(item.at)}</span>
                  </div>
                  <p className="mt-1 text-xs text-white/42">{item.company}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/46">{item.detail}</p>
                </div>
              </Link>
            ))
          ) : (
            <p className="rounded-lg border border-white/8 bg-black/20 p-4 text-sm text-white/52 md:col-span-2">
              No recorded moves for this agent yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function AdminSalesRoute() {
  const { agents, leads } = useAdminPortal();
  const [selectedAgentId, setSelectedAgentId] = useState<string>(ALL);
  const [stageFilter, setStageFilter] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [engagementByLeadId, setEngagementByLeadId] = useState<Record<string, LeadEngagement>>({});
  const [surveillance, setSurveillance] = useState<SurveillancePayload | null>(null);

  const agentViews = useMemo<AgentView[]>(() => {
    const knownAgents = agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      region: agent.region,
    }));
    const knownIds = new Set(knownAgents.map((agent) => agent.id));
    const missingOwners = Array.from(new Set(leads.map((lead) => lead.ownerId)))
      .filter((ownerId) => ownerId && !knownIds.has(ownerId))
      .map((ownerId) => ({
        id: ownerId,
        name: ownerId,
        role: "Unlisted",
        region: "Unknown",
      }));
    return [...knownAgents, ...missingOwners];
  }, [agents, leads]);

  const agentById = useMemo(
    () => new Map(agentViews.map((agent) => [agent.id, agent])),
    [agentViews],
  );

  const leadIdsKey = useMemo(() => leads.map((lead) => lead.id).join(","), [leads]);

  useEffect(() => {
    let cancelled = false;

    async function refreshSurveillance() {
      try {
        const response = await fetch("/api/admin/sales/surveillance", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as SurveillancePayload;
        if (!cancelled) setSurveillance(payload);
      } catch {
        if (!cancelled) setSurveillance(null);
      }
    }

    void refreshSurveillance();
    const interval = window.setInterval(() => void refreshSurveillance(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshEngagement() {
      if (leads.length === 0) {
        setEngagementByLeadId({});
        return;
      }

      try {
        const chunks = splitIntoChunks(leads.map((lead) => lead.id), 125);
        const responses = await Promise.all(
          chunks.map(async (chunk) => {
            const url = new URL("/api/email/lead-engagement", window.location.origin);
            url.searchParams.set("leadIds", chunk.join(","));
            const response = await fetch(url.toString(), { cache: "no-store" });
            if (!response.ok) return {};
            const payload = (await response.json()) as {
              engagement?: Record<string, LeadEngagement>;
            };
            return payload.engagement ?? {};
          }),
        );
        if (!cancelled) {
          setEngagementByLeadId(Object.assign({}, ...responses));
        }
      } catch {
        if (!cancelled) setEngagementByLeadId({});
      }
    }

    void refreshEngagement();
    const interval = window.setInterval(() => void refreshEngagement(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [leadIdsKey, leads]);

  const surveillanceByAgentId = useMemo(
    () => new Map((surveillance?.profiles ?? []).map((profile) => [profile.agentId, profile])),
    [surveillance],
  );

  const activityItems = useMemo(() => {
    return leads
      .flatMap((lead) =>
        buildActivityForLead(lead, agentById, engagementByLeadId[lead.id] ?? null),
      )
      .sort((a, b) => b.score - a.score);
  }, [agentById, engagementByLeadId, leads]);

  const statsByAgent = useMemo(() => {
    const latestActivityByAgent = new Map<string, ActivityItem>();
    for (const item of activityItems) {
      if (!latestActivityByAgent.has(item.agentId)) {
        latestActivityByAgent.set(item.agentId, item);
      }
    }

    return agentViews.map<AgentStats>((agent) => {
      const ownedLeads = leads.filter((lead) => lead.ownerId === agent.id);
      const activeCount = ownedLeads.filter(isActiveLead).length;
      const qualifiedCount = ownedLeads.filter(isQualifiedLead).length;
      const contactedCount = ownedLeads.filter((lead) => lead.contactStatus !== "Not Contacted").length;
      const notContactedCount = ownedLeads.filter((lead) => lead.contactStatus === "Not Contacted").length;
      const openTaskCount = ownedLeads.reduce(
        (total, lead) => total + lead.tasks.filter((task) => task.status === "open").length,
        0,
      );
      const doneTaskCount = ownedLeads.reduce(
        (total, lead) => total + lead.tasks.filter((task) => task.status === "done").length,
        0,
      );
      const awaitingReplyCount = ownedLeads.filter(
        (lead) => engagementByLeadId[lead.id]?.state === "awaiting_reply",
      ).length;
      const respondedCount = ownedLeads.filter(
        (lead) => engagementByLeadId[lead.id]?.state === "responded",
      ).length;
      const notEmailedCount = ownedLeads.filter((lead) => !engagementByLeadId[lead.id]).length;
      const documentReceivedCount = ownedLeads.reduce(
        (total, lead) => total + lead.documents.filter((document) => document.status !== "pending").length,
        0,
      );
      const documentPendingCount = ownedLeads.reduce(
        (total, lead) => total + lead.documents.filter((document) => document.status === "pending").length,
        0,
      );
      const estimatedValueZar = ownedLeads.reduce(
        (total, lead) => total + Math.max(0, lead.estimatedValueZar || 0),
        0,
      );
      const riskCount = ownedLeads.filter((lead) =>
        Boolean(getLeadRisk(lead, engagementByLeadId[lead.id] ?? null)),
      ).length;

      return {
        agent,
        leads: ownedLeads,
        activeCount,
        qualifiedCount,
        contactedCount,
        notContactedCount,
        openTaskCount,
        doneTaskCount,
        awaitingReplyCount,
        respondedCount,
        notEmailedCount,
        documentReceivedCount,
        documentPendingCount,
        estimatedValueZar,
        riskCount,
        healthScore: buildAgentHealthScore({
          total: ownedLeads.length,
          contactedCount,
          qualifiedCount,
          respondedCount,
          awaitingReplyCount,
          openTaskCount,
          doneTaskCount,
          riskCount,
        }),
        lastActivity: latestActivityByAgent.get(agent.id) ?? null,
      };
    });
  }, [activityItems, agentViews, engagementByLeadId, leads]);

  const selectedStats = useMemo(() => {
    if (selectedAgentId === ALL) return null;
    return statsByAgent.find((stats) => stats.agent.id === selectedAgentId) ?? null;
  }, [selectedAgentId, statsByAgent]);

  const scopedLeads = useMemo(() => {
    const agentLeads = selectedAgentId === ALL
      ? leads
      : leads.filter((lead) => lead.ownerId === selectedAgentId);
    const normalizedQuery = query.trim().toLowerCase();
    return agentLeads.filter((lead) => {
      if (stageFilter !== ALL && lead.stage !== stageFilter) return false;
      if (!normalizedQuery) return true;
      return [
        lead.company,
        lead.contactName,
        lead.userProfile.email,
        lead.userProfile.phone,
        lead.industry,
        lead.city,
        lead.province,
        getAgentName(agentById, lead.ownerId),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [agentById, leads, query, selectedAgentId, stageFilter]);

  const scopedActivity = useMemo(() => {
    const scopedIds = new Set(scopedLeads.map((lead) => lead.id));
    return activityItems.filter((item) => scopedIds.has(item.leadId)).slice(0, 18);
  }, [activityItems, scopedLeads]);

  const riskLeads = useMemo(() => {
    return scopedLeads
      .map((lead): {
        lead: AdminLead;
        risk: string | null;
        engagement: LeadEngagement | null;
      } => {
        const engagement = engagementByLeadId[lead.id] ?? null;
        return {
          lead,
          risk: getLeadRisk(lead, engagement),
          engagement,
        };
      })
      .filter((entry): entry is {
        lead: AdminLead;
        risk: string;
        engagement: LeadEngagement | null;
      } => Boolean(entry.risk))
      .sort((a, b) => scoreTime(b.lead.lastTouched) - scoreTime(a.lead.lastTouched))
      .slice(0, 10);
  }, [engagementByLeadId, scopedLeads]);

  const scopedTotals = useMemo(() => {
    const active = scopedLeads.filter(isActiveLead).length;
    const qualified = scopedLeads.filter(isQualifiedLead).length;
    const responded = scopedLeads.filter((lead) => engagementByLeadId[lead.id]?.state === "responded").length;
    const awaiting = scopedLeads.filter((lead) => engagementByLeadId[lead.id]?.state === "awaiting_reply").length;
    const openTasks = scopedLeads.reduce(
      (total, lead) => total + lead.tasks.filter((task) => task.status === "open").length,
      0,
    );
    const totalValue = scopedLeads.reduce(
      (total, lead) => total + Math.max(0, lead.estimatedValueZar || 0),
      0,
    );
    return { active, qualified, responded, awaiting, openTasks, totalValue };
  }, [engagementByLeadId, scopedLeads]);

  const stageCounts = useMemo(() => {
    const counts = new Map<AdminLeadStage, number>();
    for (const stage of adminLeadStages) counts.set(stage, 0);
    for (const lead of scopedLeads) counts.set(lead.stage, (counts.get(lead.stage) ?? 0) + 1);
    return counts;
  }, [scopedLeads]);

  const sortedAgentStats = useMemo(
    () =>
      [...statsByAgent].sort((a, b) => {
        if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
        return b.qualifiedCount - a.qualifiedCount;
      }),
    [statsByAgent],
  );

  const focusAgent = useMemo(() => {
    return [...statsByAgent]
      .filter((stats) => stats.leads.length > 0)
      .sort((a, b) => {
        if (b.riskCount !== a.riskCount) return b.riskCount - a.riskCount;
        if (b.openTaskCount !== a.openTaskCount) return b.openTaskCount - a.openTaskCount;
        return a.healthScore - b.healthScore;
      })[0] ?? null;
  }, [statsByAgent]);

  const bestAgent = useMemo(() => {
    return [...statsByAgent]
      .filter((stats) => stats.leads.length > 0)
      .sort((a, b) => {
        if (b.healthScore !== a.healthScore) return b.healthScore - a.healthScore;
        return b.qualifiedCount - a.qualifiedCount;
      })[0] ?? null;
  }, [statsByAgent]);

  const inspectedStats = selectedStats ?? focusAgent ?? sortedAgentStats[0] ?? null;
  const inspectedAgentId = inspectedStats?.agent.id ?? null;
  const inspectedProfile = inspectedAgentId ? surveillanceByAgentId.get(inspectedAgentId) ?? null : null;
  const inspectedActivity = useMemo(() => {
    if (!inspectedAgentId) return [];
    return activityItems.filter((item) => item.agentId === inspectedAgentId).slice(0, 12);
  }, [activityItems, inspectedAgentId]);

  return (
    <div className="min-w-0 space-y-6 pb-8">
      <AdminHeader
        eyebrow="Sales Oversight"
        title="Sales Activity"
        description="Monitor every sales operator from assigned lead volume through email response, task debt, document movement, and conversion progress."
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminBadge label={`${agentViews.length} Agents`} />
            <AdminBadge label={`${leads.length} Leads`} tone="muted" />
            <AdminBadge label={`${scopedTotals.awaiting} Awaiting Reply`} tone="muted" />
          </div>
        }
      />

      <section className="app-surface rounded-lg p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
          <div className="min-w-0">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="line-label">Command View</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Live command view for agent performance
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/54">
                  Lead volume, risk, task debt, client replies, and conversion progress in one operator view.
                </p>
              </div>
              {selectedStats ? (
                <button
                  type="button"
                  onClick={() => setSelectedAgentId(ALL)}
                  className="rounded-lg border border-white/12 px-3 py-2 text-xs font-semibold uppercase text-white/62 transition hover:border-white/24 hover:text-white"
                >
                  Clear Agent
                </button>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SignalMetric label="Visible active" value={String(scopedTotals.active)} />
              <SignalMetric label="Pipeline value" value={formatCurrency(scopedTotals.totalValue)} />
              <SignalMetric label="Client replies" value={String(scopedTotals.responded)} tone="good" />
              <SignalMetric
                label="Open tasks"
                value={String(scopedTotals.openTasks)}
                tone={scopedTotals.openTasks > 0 ? "warn" : "good"}
              />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-2 md:col-span-2">
                <span className="text-[0.64rem] font-semibold uppercase text-white/46">
                  Search
                </span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Company, contact, email, agent..."
                    className="admin-input h-12 w-full rounded-lg pl-10 pr-4 text-sm text-white"
                  />
                </div>
              </label>

              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[0.64rem] font-semibold uppercase text-white/46">
                  Agent
                </span>
                <select
                  value={selectedAgentId}
                  onChange={(event) => setSelectedAgentId(event.target.value)}
                  className="admin-input admin-select h-12 rounded-lg px-3 text-sm text-white"
                >
                  <option value={ALL} className="bg-zinc-950 text-white">All agents</option>
                  {agentViews.map((agent) => (
                    <option key={agent.id} value={agent.id} className="bg-zinc-950 text-white">
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[0.64rem] font-semibold uppercase text-white/46">
                  Stage
                </span>
                <select
                  value={stageFilter}
                  onChange={(event) => setStageFilter(event.target.value)}
                  className="admin-input admin-select h-12 rounded-lg px-3 text-sm text-white"
                >
                  <option value={ALL} className="bg-zinc-950 text-white">All stages</option>
                  {adminLeadStages.map((stage) => (
                    <option key={stage} value={stage} className="bg-zinc-950 text-white">
                      {stage}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-lg border border-amber-300/20 bg-amber-500/[0.07] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.62rem] font-semibold uppercase text-amber-100/58">Pressure Point</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">
                    {focusAgent?.agent.name ?? "No agent pressure"}
                  </h3>
                </div>
                <AlertTriangle className="size-5 text-amber-100/80" />
              </div>
              <p className="mt-3 text-sm leading-6 text-white/58">
                {focusAgent
                  ? `${focusAgent.riskCount} risk items, ${focusAgent.openTaskCount} open tasks, ${focusAgent.notEmailedCount} leads without an email thread.`
                  : "No active risk signals under the current data set."}
              </p>
            </div>

            <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/[0.07] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.62rem] font-semibold uppercase text-emerald-100/58">Cleanest Operator</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">
                    {bestAgent?.agent.name ?? "No ranked agent"}
                  </h3>
                </div>
                <CheckCircle2 className="size-5 text-emerald-100/80" />
              </div>
              <p className="mt-3 text-sm leading-6 text-white/58">
                {bestAgent
                  ? `Health ${bestAgent.healthScore}, ${bestAgent.qualifiedCount} qualified, ${bestAgent.respondedCount} replied, ${bestAgent.openTaskCount} open tasks.`
                  : "No agent has enough lead data to rank yet."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="app-surface rounded-lg p-5">
        <div className="flex flex-col gap-2 border-b border-white/8 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="line-label">Agent Profiles</p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Click an agent to inspect the full profile
            </h2>
          </div>
          <p className="text-sm text-white/46">
            Health score combines contact coverage, progress, replies, tasks, and risk.
          </p>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-3">
          {sortedAgentStats.map((stats) => (
            <AgentCommandCard
              key={stats.agent.id}
              stats={stats}
              selected={selectedAgentId === stats.agent.id}
              onSelect={() => setSelectedAgentId(stats.agent.id)}
            />
          ))}
        </div>
      </section>

      <AgentSurveillancePanel
        stats={inspectedStats}
        profile={inspectedProfile}
        activity={inspectedActivity}
        engagementByLeadId={engagementByLeadId}
        surveillanceLoaded={Boolean(surveillance)}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="app-surface rounded-lg p-4">
          <div className="border-b border-white/8 pb-4">
            <p className="line-label">Stage Board</p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              {selectedStats ? selectedStats.agent.name : "All agents"} by stage
            </h2>
          </div>
          <div className="mt-4 space-y-3">
            {adminLeadStages.map((stage) => {
              const count = stageCounts.get(stage) ?? 0;
              const width = Math.max(count > 0 ? 4 : 0, pct(count, Math.max(scopedLeads.length, 1)));
              return (
                <div key={stage}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-white/72">{stage}</span>
                    <span className="text-white/42">{count}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        stage === "Disqualified" ? "bg-rose-300" : "bg-white/72",
                      )}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="app-surface rounded-lg p-4">
          <div className="flex items-start justify-between gap-3 border-b border-white/8 pb-4">
            <div>
              <p className="line-label">Risk Stack</p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Immediate manager follow-up
              </h2>
            </div>
            <span className="flex size-9 items-center justify-center rounded-full border border-amber-300/25 bg-amber-500/10 text-amber-100">
              <AlertTriangle className="size-4" />
            </span>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {riskLeads.length === 0 ? (
              <p className="rounded-lg border border-white/8 bg-white/[0.03] p-4 text-sm text-white/52 md:col-span-2">
                No visible risk items under the current filters.
              </p>
            ) : (
              riskLeads.map(({ lead, risk, engagement }) => (
                <Link
                  key={lead.id}
                  href={leadHref(lead)}
                  className="block rounded-lg border border-white/8 bg-white/[0.03] p-3 transition hover:border-white/18 hover:bg-white/[0.06]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{lead.company}</p>
                      <p className="mt-1 text-xs text-white/44">
                        {getAgentName(agentById, lead.ownerId)} / {lead.stage}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/12 px-2 py-1 text-[0.58rem] font-semibold uppercase text-white/50">
                      {engagementTone(engagement)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-amber-100/76">{risk}</p>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="app-surface rounded-lg p-4">
        <div className="flex flex-col gap-2 border-b border-white/8 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="line-label">Activity Ledger</p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Latest recorded actions
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-2.5 py-1 text-[0.62rem] font-semibold uppercase text-white/52">
              <Users className="size-3" />
              Ownership
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-2.5 py-1 text-[0.62rem] font-semibold uppercase text-white/52">
              <Mail className="size-3" />
              Email
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-2.5 py-1 text-[0.62rem] font-semibold uppercase text-white/52">
              <CheckCircle2 className="size-3" />
              Tasks / docs
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          {scopedActivity.length === 0 ? (
            <p className="rounded-lg border border-white/8 bg-white/[0.03] p-4 text-sm text-white/52">
              No recorded activity under the current filters.
            </p>
          ) : (
            scopedActivity.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="grid gap-3 rounded-lg border border-white/8 bg-white/[0.03] p-3 transition hover:border-white/18 hover:bg-white/[0.06] md:grid-cols-[0.75rem_minmax(0,1fr)_12rem]"
              >
                <ActivityToneDot tone={item.tone} />
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-white">{item.title}</p>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[0.58rem] font-semibold uppercase text-white/42">
                      {item.company}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/48">{item.detail}</p>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-xs text-white/58">{item.agentName}</p>
                  <p className="mt-1 text-[0.68rem] text-white/38">{formatActivityTime(item.at)}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

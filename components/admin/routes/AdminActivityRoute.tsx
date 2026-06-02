"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { cn } from "@/lib/utils";

type ReportWindow = "24h" | "7d" | "30d";

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

type ActivityReportPayload = {
  generatedAt: string;
  window: ReportWindow;
  windowStart: string;
  windowEnd: string;
  totals: {
    users: number;
    activeUsers: number;
    inactiveUsers: number;
    logins: number;
    emailsSent: number;
    emailsReceived: number;
    touchedLeads: number;
    openTasks: number;
  };
  users: UserReport[];
};

const reportWindows: Array<{ value: ReportWindow; label: string }> = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function csvEscape(value: string | number | boolean | null | undefined) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(report: ActivityReportPayload) {
  const headers = [
    "name",
    "email",
    "role",
    "active_in_window",
    "activity_score",
    "last_seen",
    "logins",
    "logouts",
    "emails_sent",
    "emails_received",
    "lead_notes",
    "lead_documents",
    "lead_events",
    "assigned_leads",
    "touched_leads",
    "stale_assigned_leads",
    "open_tasks",
    "done_tasks",
  ];
  const rows = report.users.map((user) => [
    user.name,
    user.email,
    user.role,
    user.activeInWindow,
    user.activityScore,
    user.lastSeenAt,
    user.loginCount,
    user.logoutCount,
    user.emailSentCount,
    user.emailReceivedCount,
    user.leadNoteCount,
    user.leadDocumentCount,
    user.leadEventCount,
    user.assignedLeadCount,
    user.touchedLeadCount,
    user.staleAssignedLeadCount,
    user.openTaskCount,
    user.doneTaskCount,
  ]);

  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function downloadReport(report: ActivityReportPayload) {
  const csv = buildCsv(report);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `oneos-admin-activity-${report.window}-${new Date(report.generatedAt).toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function scoreTone(user: UserReport) {
  if (!user.activeInWindow) return "border-rose-300/24 bg-rose-500/10 text-rose-100";
  if (user.activityScore >= 12) return "border-emerald-300/24 bg-emerald-500/10 text-emerald-100";
  return "border-amber-300/24 bg-amber-500/10 text-amber-100";
}

function actionTone(type: ActivityAction["type"]) {
  if (type === "login") return "bg-emerald-300";
  if (type === "logout") return "bg-amber-300";
  if (type === "email_sent" || type === "email_received") return "bg-sky-300";
  if (type === "lead_document") return "bg-violet-300";
  return "bg-white/70";
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.025] p-4">
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-white/42">{label}</p>
      <p
        className={cn(
          "mt-3 text-2xl font-semibold tracking-[-0.03em]",
          tone === "good" ? "text-emerald-100" : tone === "warn" ? "text-amber-100" : "text-white",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function UserActivityPanel({ user }: { user: UserReport | null }) {
  if (!user) {
    return (
      <section className="app-surface rounded-lg p-5">
        <p className="text-sm text-white/52">Select a user to inspect recent evidence.</p>
      </section>
    );
  }

  return (
    <section className="app-surface rounded-lg p-5">
      <div className="flex flex-col gap-3 border-b border-white/8 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="line-label">User Evidence</p>
          <h2 className="mt-2 truncate text-xl font-semibold text-white">{user.name}</h2>
          <p className="mt-1 truncate text-sm text-white/46">{user.email}</p>
        </div>
        <span className={cn("rounded-full border px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em]", scoreTone(user))}>
          {user.activeInWindow ? "Active" : "No Activity"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Score" value={String(user.activityScore)} />
        <Metric label="Last seen" value={formatDateTime(user.lastSeenAt)} />
        <Metric label="Latest move" value={formatDateTime(user.latestActivityAt)} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {user.recentActions.length ? (
          user.recentActions.map((action) => (
            <div key={action.id} className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-3 rounded-lg border border-white/8 bg-black/20 p-3">
              <span className={cn("mt-1 size-2.5 rounded-full", actionTone(action.type))} />
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="truncate text-sm font-medium text-white">{action.title}</p>
                  <span className="shrink-0 text-xs text-white/38">{formatDateTime(action.at)}</span>
                </div>
                <p className="mt-1 text-xs text-white/42">{action.leadCompany ?? "Dashboard"}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/48">{action.detail}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-white/8 bg-black/20 p-4 text-sm text-white/52 md:col-span-2">
            No timestamped activity recorded in this window.
          </p>
        )}
      </div>
    </section>
  );
}

export function AdminActivityRoute() {
  const [reportWindow, setReportWindow] = useState<ReportWindow>("7d");
  const [report, setReport] = useState<ActivityReportPayload | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadReport() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/activity/report?window=${reportWindow}`, { cache: "no-store" });
        const payload = (await response.json()) as ActivityReportPayload | { error?: string };
        if (!response.ok) {
          throw new Error("error" in payload ? payload.error ?? "Could not load activity report" : "Could not load activity report");
        }
        if (!cancelled) {
          const nextReport = payload as ActivityReportPayload;
          setReport(nextReport);
          setSelectedUserId((current) => current ?? nextReport.users[0]?.userId ?? null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load activity report");
          setReport(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReport();
    const interval = window.setInterval(() => void loadReport(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [reportWindow, refreshKey]);

  const selectedUser = useMemo(() => {
    if (!report) return null;
    return report.users.find((user) => user.userId === selectedUserId) ?? report.users[0] ?? null;
  }, [report, selectedUserId]);

  const inactiveUsers = useMemo(
    () => report?.users.filter((user) => !user.activeInWindow) ?? [],
    [report],
  );

  const refresh = () => {
    setRefreshKey((value) => value + 1);
  };

  return (
    <div className="min-w-0 space-y-6 pb-8">
      <AdminHeader
        eyebrow="Activity Report"
        title="User activity and accountability"
        description="Monitor who logged in, who worked leads, who sent mail, who received replies, and who has gone quiet."
        actions={
          <div className="flex flex-wrap gap-2">
            {reportWindows.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setReportWindow(option.value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                  reportWindow === option.value
                    ? "border-white/22 bg-white text-black"
                    : "border-white/12 bg-white/[0.03] text-white/62 hover:border-white/22 hover:text-white",
                )}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center gap-2 rounded-lg border border-white/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/62 transition hover:border-white/22 hover:text-white"
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </button>
            <button
              type="button"
              disabled={!report}
              onClick={() => report && downloadReport(report)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/12 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowDownToLine className="size-3.5" />
              CSV
            </button>
          </div>
        }
      />

      {error ? (
        <div className="rounded-lg border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <section className="app-surface rounded-lg p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Users" value={loading && !report ? "..." : String(report?.totals.users ?? 0)} />
          <Metric label="Active" value={String(report?.totals.activeUsers ?? 0)} tone="good" />
          <Metric label="Inactive" value={String(report?.totals.inactiveUsers ?? 0)} tone={inactiveUsers.length ? "warn" : "good"} />
          <Metric label="Emails sent" value={String(report?.totals.emailsSent ?? 0)} />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Metric label="Logins" value={String(report?.totals.logins ?? 0)} />
          <Metric label="Emails received" value={String(report?.totals.emailsReceived ?? 0)} />
          <Metric label="Touched leads" value={String(report?.totals.touchedLeads ?? 0)} />
          <Metric label="Open tasks" value={String(report?.totals.openTasks ?? 0)} tone={(report?.totals.openTasks ?? 0) > 0 ? "warn" : "good"} />
        </div>
        {report ? (
          <p className="mt-4 text-xs text-white/38">
            Window: {formatDateTime(report.windowStart)} to {formatDateTime(report.windowEnd)}. Generated {formatDateTime(report.generatedAt)}.
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(24rem,0.85fr)]">
        <section className="app-surface overflow-hidden rounded-lg">
          <div className="flex items-center justify-between gap-3 border-b border-white/8 p-5">
            <div>
              <p className="line-label">User Report</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Activity by dashboard profile</h2>
            </div>
            <AdminBadge label={report?.window ?? reportWindow} tone="muted" />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[58rem] w-full text-left text-sm">
              <thead className="border-b border-white/8 text-[0.62rem] uppercase tracking-[0.18em] text-white/40">
                <tr>
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Score</th>
                  <th className="px-3 py-3 font-semibold">Login</th>
                  <th className="px-3 py-3 font-semibold">Email</th>
                  <th className="px-3 py-3 font-semibold">Leads</th>
                  <th className="px-3 py-3 font-semibold">Tasks</th>
                  <th className="px-5 py-3 font-semibold">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {report?.users.map((user) => {
                  const selected = selectedUser?.userId === user.userId;
                  return (
                    <tr
                      key={user.userId}
                      onClick={() => setSelectedUserId(user.userId)}
                      className={cn(
                        "cursor-pointer border-b border-white/6 transition hover:bg-white/[0.035]",
                        selected && "bg-white/[0.05]",
                      )}
                    >
                      <td className="px-5 py-4">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">{user.name}</p>
                          <p className="mt-1 truncate text-xs text-white/42">{user.email}</p>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[0.62rem] font-semibold uppercase", scoreTone(user))}>
                          {user.activeInWindow ? <UserCheck className="size-3" /> : <UserX className="size-3" />}
                          {user.activeInWindow ? "Active" : "Quiet"}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-white/72">{user.activityScore}</td>
                      <td className="px-3 py-4 text-white/62">{user.loginCount}/{user.logoutCount}</td>
                      <td className="px-3 py-4 text-white/62">{user.emailSentCount}/{user.emailReceivedCount}</td>
                      <td className="px-3 py-4 text-white/62">{user.touchedLeadCount}/{user.assignedLeadCount}</td>
                      <td className="px-3 py-4 text-white/62">{user.openTaskCount}/{user.doneTaskCount}</td>
                      <td className="px-5 py-4 text-white/46">{formatDateTime(user.lastSeenAt)}</td>
                    </tr>
                  );
                })}
                {!loading && (!report || report.users.length === 0) ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-sm text-white/52">
                      No operator profiles found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6">
          <section className="app-surface rounded-lg p-5">
            <div className="border-b border-white/8 pb-4">
              <p className="line-label">Quiet Profiles</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Users with no activity</h2>
            </div>
            <div className="mt-4 grid gap-2">
              {inactiveUsers.length ? (
                inactiveUsers.slice(0, 8).map((user) => (
                  <button
                    key={user.userId}
                    type="button"
                    onClick={() => setSelectedUserId(user.userId)}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-black/20 p-3 text-left transition hover:border-white/18 hover:bg-white/[0.05]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">{user.name}</span>
                      <span className="mt-1 block truncate text-xs text-white/42">{user.email}</span>
                    </span>
                    <span className="shrink-0 text-xs text-white/38">{formatDateTime(user.lastSeenAt)}</span>
                  </button>
                ))
              ) : (
                <p className="rounded-lg border border-white/8 bg-black/20 p-4 text-sm text-white/52">
                  Every linked dashboard profile has activity in this window.
                </p>
              )}
            </div>
          </section>

          <section className="app-surface rounded-lg p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-5 text-emerald-100/72" />
                <span className="text-xs leading-5 text-white/50">Login/logout audit comes from the dashboard auth flow.</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="size-5 text-sky-100/72" />
                <span className="text-xs leading-5 text-white/50">Email counts come from persisted inbox threads and messages.</span>
              </div>
              <div className="flex items-center gap-3">
                <Activity className="size-5 text-white/62" />
                <span className="text-xs leading-5 text-white/50">Task rows show current open/done state, not completion time.</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      <UserActivityPanel user={selectedUser} />
    </div>
  );
}

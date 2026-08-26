"use client";

/**
 * Threads (doc 21): every live human conversation in one list. You answer
 * as yourself; the harness never speaks for you here.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Mail, MessageSquareText } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminPrimitives";

type ThreadRow = {
  id: string;
  source: "email" | "dawn";
  title: string;
  snippet: string;
  updatedAt: string;
  unread: boolean;
  caseToken?: string | null;
};

export function AdminThreadsRoute() {
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/admin/threads", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      setThreads(payload?.ok ? payload.threads : []);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <AdminHeader
        eyebrow="Threads"
        title="Live conversations."
        description="Every human you are currently in motion with. Replies are yours; drafts waiting on verdicts live in Today."
      />
      <ul className="divide-y divide-white/8 rounded-xl border border-white/10">
        {(threads ?? []).map((thread) => (
          <li key={thread.id} className="flex items-center gap-3 px-4 py-3">
            {thread.source === "email" ? <Mail className="size-4 opacity-40" /> : <MessageSquareText className="size-4 opacity-40" />}
            <div className="min-w-0 flex-1">
              <p className={`truncate text-[13px] ${thread.unread ? "font-medium text-white" : "text-white/75"}`}>
                {thread.title}
                {thread.unread ? <span className="ml-2 rounded bg-emerald-300/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-emerald-300">new</span> : null}
              </p>
              {thread.snippet ? <p className="truncate text-[11px] opacity-45">{thread.snippet}</p> : null}
            </div>
            <span className="shrink-0 text-[11px] opacity-40">{(thread.updatedAt || "").slice(0, 16).replace("T", " ")}</span>
            {thread.source === "dawn" && thread.caseToken ? (
              <Link href={`/migration/dashboard?p=${thread.caseToken}`} target="_blank"
                className="shrink-0 rounded-md border border-white/12 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/55 hover:text-white">
                open case
              </Link>
            ) : null}
          </li>
        ))}
        {!threads?.length && <li className="px-4 py-10 text-center text-sm opacity-50">No live conversations yet.</li>}
      </ul>
    </div>
  );
}

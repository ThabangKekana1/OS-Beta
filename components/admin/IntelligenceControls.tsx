"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function jsonRequest(
  url: string,
  init: RequestInit,
): Promise<{ ok?: boolean; error?: string }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
  } | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "The operation failed.");
  }
  return payload;
}

export function LearningCycleControl({
  environment,
}: {
  environment: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    setBusy(true);
    setMessage("");
    try {
      await jsonRequest("/api/admin/intelligence/refresh", {
        method: "POST",
        body: JSON.stringify({ environment, days: 30 }),
      });
      setMessage("Learning cycle completed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Learning cycle failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="rounded-full border border-lime-300/30 bg-lime-300/10 px-4 py-2 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-lime-100 transition hover:bg-lime-300/20 disabled:opacity-40"
      >
        {busy ? "Running…" : "Run learning cycle"}
      </button>
      <a
        href={`/api/admin/intelligence/codex-brief?environment=${encodeURIComponent(environment)}`}
        className="rounded-full border border-white/15 px-4 py-2 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-white/70 transition hover:bg-white/10"
      >
        Download Codex brief
      </a>
      {message ? (
        <p className="w-full text-right text-[0.66rem] text-white/45">{message}</p>
      ) : null}
    </div>
  );
}

export function InsightDecisionControl({
  insightId,
  status,
}: {
  insightId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function decide(decision: "accepted" | "rejected" | "implemented") {
    setBusy(decision);
    setError("");
    try {
      await jsonRequest(
        `/api/admin/intelligence/insights/${encodeURIComponent(insightId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ decision }),
        },
      );
      router.refresh();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Decision failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {status !== "accepted" && status !== "implemented" ? (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void decide("accepted")}
            className="rounded-full border border-lime-300/25 px-3 py-1.5 text-[0.58rem] uppercase tracking-[0.14em] text-lime-100 hover:bg-lime-300/10 disabled:opacity-40"
          >
            {busy === "accepted" ? "Saving…" : "Accept"}
          </button>
        ) : null}
        {status !== "implemented" ? (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void decide("implemented")}
            className="rounded-full border border-cyan-300/25 px-3 py-1.5 text-[0.58rem] uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-40"
          >
            {busy === "implemented" ? "Saving…" : "Mark implemented"}
          </button>
        ) : null}
        {status !== "rejected" ? (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void decide("rejected")}
            className="rounded-full border border-rose-300/25 px-3 py-1.5 text-[0.58rem] uppercase tracking-[0.14em] text-rose-100 hover:bg-rose-300/10 disabled:opacity-40"
          >
            {busy === "rejected" ? "Saving…" : "Reject"}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-[0.62rem] text-rose-200">{error}</p> : null}
    </div>
  );
}

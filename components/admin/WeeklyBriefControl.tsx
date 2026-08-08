"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Generate + store this week's operating brief on demand (admin only). */
export function WeeklyBriefControl() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function generate() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/intelligence/weekly-brief", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        reason?: string;
        error?: string;
      } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.reason ?? payload?.error ?? "Brief generation failed.");
      }
      setMessage("Weekly brief generated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Brief generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy}
        className="rounded-full border border-lime-300/30 bg-lime-300/10 px-4 py-2 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-lime-100 transition hover:bg-lime-300/20 disabled:opacity-40"
      >
        {busy ? "Generating…" : "Generate brief now"}
      </button>
      <a
        href="/api/admin/intelligence/weekly-brief?download=1"
        className="rounded-full border border-white/15 px-4 py-2 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-white/70 transition hover:bg-white/10"
      >
        Download markdown
      </a>
      {message ? <span className="text-xs text-white/45">{message}</span> : null}
    </div>
  );
}

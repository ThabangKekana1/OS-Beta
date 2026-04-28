"use client";

import { useEffect, useState } from "react";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";

export function SaveStatusBanner() {
  const { saveStatus, syncBackend, retrySave } = useAdminPortal();
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    setShowSaved(true);
    const timer = setTimeout(() => setShowSaved(false), 1800);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  // Nothing to show in the happy idle state.
  if (
    saveStatus === "idle" &&
    syncBackend !== "local" &&
    syncBackend !== "loading"
  ) {
    return null;
  }
  if (saveStatus === "saved" && !showSaved) {
    return null;
  }

  let label = "";
  let tone = "border-white/20 bg-black/80 text-white";
  let action: { label: string; onClick: () => void } | null = null;

  if (saveStatus === "saving") {
    label = "Saving…";
    tone = "border-white/30 bg-black/90 text-white";
  } else if (saveStatus === "saved" && showSaved) {
    label = "All changes saved";
    tone = "border-emerald-400/50 bg-emerald-950/80 text-emerald-100";
  } else if (saveStatus === "error") {
    label = "Save failed — your last change is local-only.";
    tone = "border-rose-400/60 bg-rose-950/80 text-rose-100";
    action = { label: "Retry", onClick: retrySave };
  } else if (syncBackend === "local") {
    label = "Working offline — changes are local-only.";
    tone = "border-amber-400/50 bg-amber-950/80 text-amber-100";
    action = { label: "Reconnect", onClick: retrySave };
  }

  if (!label) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex justify-end">
      <div
        className={`pointer-events-auto flex items-center gap-3 rounded-full border px-4 py-2 text-xs font-semibold shadow-xl backdrop-blur ${tone}`}
        role="status"
        aria-live="polite"
      >
        <span>{label}</span>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="rounded-full border border-white/40 px-3 py-1 text-[0.62rem] uppercase tracking-[0.18em] text-white transition hover:border-white hover:bg-white/10"
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}

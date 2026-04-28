"use client";

import { Check, Circle } from "lucide-react";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";

export function OnboardingProgress() {
  const { activeCase } = useWorkspace();

  if (!activeCase) {
    return null;
  }

  const items = activeCase.closeChecklist;
  const done = items.filter((item) => item.complete).length;
  const total = items.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <section className="rounded-[1.4rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-5 backdrop-blur-2xl">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="line-label">Your Migration Progress</p>
          <h2 className="mt-2 text-lg font-medium text-white">
            {done} of {total} steps complete · {activeCase.stage}
          </h2>
        </div>
        <span className="text-2xl font-semibold tracking-tight text-white">{pct}%</span>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-white/85 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 rounded-[0.9rem] border border-white/8 bg-white/[0.02] px-3 py-2.5"
          >
            <span
              className={`flex size-6 items-center justify-center rounded-full border ${
                item.complete
                  ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                  : "border-white/14 bg-white/[0.04] text-white/56"
              }`}
            >
              {item.complete ? <Check className="size-3.5" /> : <Circle className="size-3" />}
            </span>
            <span
              className={`text-sm ${item.complete ? "text-white/72 line-through" : "text-white/86"}`}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

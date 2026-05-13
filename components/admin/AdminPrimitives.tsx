"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AdminBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "bright" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[0.62rem] font-medium uppercase tracking-[0.26em]",
        tone === "bright" && "border-white/18 bg-white text-black",
        tone === "neutral" && "border-white/12 bg-white/[0.04] text-white/74",
        tone === "muted" && "border-white/8 bg-transparent text-white/46",
      )}
    >
      <span className="status-dot" />
      {label}
    </span>
  );
}

export function AdminHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-white/8 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 flex-1">
        <p className="line-label">{eyebrow}</p>
        <h1
          className="mt-3 max-w-3xl text-[clamp(1.6rem,2.4vw,2.4rem)] font-medium leading-[1.1] tracking-[-0.03em] text-white"
          style={{ textWrap: "balance" }}
        >
          {title}
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-white/62">{description}</p>
      </div>
      {actions ? <div className="min-w-0 max-w-full">{actions}</div> : null}
    </div>
  );
}

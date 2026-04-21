"use client";

import { BellRing, ShieldCheck, SlidersHorizontal, Workflow } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminPrimitives";

const settingSections = [
  {
    title: "Assignment Rules",
    body: "Configure territory routing, round-robin fallback, and executive lead escalation rules for inbound portal leads.",
    icon: Workflow,
  },
  {
    title: "SLA Alerts",
    body: "Define first-touch and follow-up SLA thresholds and flag stale leads before response quality drops.",
    icon: BellRing,
  },
  {
    title: "Pipeline Configuration",
    body: "Manage stage definitions, probability weighting, and visibility controls for manager and agent views.",
    icon: SlidersHorizontal,
  },
  {
    title: "Audit + Access",
    body: "Enforce role boundaries and retain immutable logs for assignment and stage changes made in the admin portal.",
    icon: ShieldCheck,
  },
];

export function AdminSettingsRoute() {
  return (
    <div className="flex flex-col gap-6">
      <section className="app-surface rounded-[2.2rem] px-5 py-5 lg:px-7 lg:py-6">
        <AdminHeader
          eyebrow="Admin Settings"
          title="Control how your sales machine operates."
          description="These controls are internal-only and operate independently from the migration client platform."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {settingSections.map((section) => {
          const Icon = section.icon;
          return (
            <article key={section.title} className="app-surface rounded-[1.6rem] p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/70">
                  <Icon className="size-4" />
                </span>
                <h2 className="text-xl font-medium tracking-[-0.04em] text-white">
                  {section.title}
                </h2>
              </div>
              <p className="mt-4 text-sm leading-7 text-white/64">{section.body}</p>
            </article>
          );
        })}
      </section>
    </div>
  );
}

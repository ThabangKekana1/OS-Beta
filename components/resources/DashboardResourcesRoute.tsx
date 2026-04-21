"use client";

import { Download, FileText } from "lucide-react";
import { AdminBadge, AdminHeader } from "@/components/admin/AdminPrimitives";
import { DASHBOARD_RESOURCES } from "@/lib/dashboard-resources";

export function DashboardResourcesRoute({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="app-surface rounded-[2.2rem] px-5 py-5 lg:px-7 lg:py-6">
        <AdminHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
          actions={<AdminBadge label={`${DASHBOARD_RESOURCES.length} Files Ready`} tone="muted" />}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {DASHBOARD_RESOURCES.map((resource) => (
          <article key={resource.id} className="app-surface rounded-[1.6rem] p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/70">
                <FileText className="size-4" />
              </span>
              <span className="rounded-full border border-white/12 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.2em] text-white/58">
                {resource.fileType}
              </span>
            </div>

            <h2 className="mt-4 text-xl font-medium tracking-[-0.04em] text-white">
              {resource.title}
            </h2>
            <p className="mt-2 text-sm leading-7 text-white/62">{resource.summary}</p>
            <p className="mt-4 text-xs uppercase tracking-[0.18em] text-white/44">
              Updated {resource.updatedAt}
            </p>

            <a
              href={resource.href}
              download={resource.filename}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/80 transition hover:border-white/28 hover:bg-white/[0.08] hover:text-white"
            >
              <Download className="size-3.5" />
              Download
            </a>
          </article>
        ))}
      </section>
    </div>
  );
}

"use client";

import { AdminHeader } from "@/components/admin/AdminPrimitives";
import { SignOutButton } from "@/components/auth/SignOutButton";

export function SalesSettingsRoute({
}: Record<string, never>) {
  return (
    <div className="space-y-6 pb-8">
      <AdminHeader
        eyebrow="Profile"
        title="Sales Settings"
        description="This profile can only access the sales dashboard routes."
      />

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
          <p className="line-label">Workspace Access</p>
          <p className="mt-2 text-sm text-white/58">
            This workspace is limited to sales routes and shared pipeline actions.
          </p>
        </article>

        <article className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
          <p className="line-label">Session actions</p>
          <p className="mt-2 text-sm text-white/58">Use this if you need to switch to an admin or another sales profile.</p>
          <div className="mt-4">
            <SignOutButton />
          </div>
        </article>
      </section>
    </div>
  );
}

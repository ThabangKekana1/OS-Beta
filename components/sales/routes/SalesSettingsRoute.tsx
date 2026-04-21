"use client";

import { AdminHeader } from "@/components/admin/AdminPrimitives";
import { SignOutButton } from "@/components/auth/SignOutButton";

export function SalesSettingsRoute({
  profileName,
  email,
}: {
  profileName: string;
  email: string;
}) {
  return (
    <div className="space-y-6 pb-8">
      <AdminHeader
        eyebrow="Profile"
        title="Sales Settings"
        description="This profile can only access the sales dashboard routes."
      />

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
          <p className="line-label">Current profile</p>
          <p className="mt-2 text-lg text-white">{profileName}</p>
          <p className="mt-1 text-sm text-white/58">{email}</p>
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

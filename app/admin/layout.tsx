import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminThemeShell } from "@/components/admin/AdminThemeShell";
import { DeckShell } from "@/components/deck/DeckShell";
import { requireServerAuthSession } from "@/lib/auth-server";

export const metadata: Metadata = {
  title: "1-MI | Today",
  description: "The decision surface: verdicts, threads, dossiers, briefs — and MI.",
};

/**
 * The harness shell (doc 21). No CRM navigation: the founder lands on Today
 * and moves through Threads, Dossiers and Briefs, with MI docked in every
 * surface. The CRM console survives under /admin/(legacy) at its original
 * URLs for audit and edge cases.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireServerAuthSession("admin");

  return (
    <AdminThemeShell>
      <DeckShell>{children}</DeckShell>
    </AdminThemeShell>
  );
}

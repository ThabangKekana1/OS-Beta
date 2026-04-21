import type { ReactNode } from "react";
import { WorkspaceProvider } from "@/components/providers/WorkspaceProvider";
import { SidebarShell } from "@/components/sidebar/SidebarShell";

export default function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <WorkspaceProvider>
      <div className="min-h-screen bg-[var(--black)] text-[var(--ink)]">
        <SidebarShell />
        <main className="min-h-screen px-4 pb-6 pt-20 lg:pl-[21rem] lg:pr-6 lg:pt-6">
          {children}
        </main>
      </div>
    </WorkspaceProvider>
  );
}

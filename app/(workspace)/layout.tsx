import type { ReactNode } from "react";
import { WorkspaceProvider } from "@/components/providers/WorkspaceProvider";
import { SidebarShell } from "@/components/sidebar/SidebarShell";
import { getServerAuthSession } from "@/lib/auth-server";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerAuthSession();
  const showSidebar = Boolean(session);

  return (
    <WorkspaceProvider>
      <div className="min-h-screen bg-[var(--black)] text-[var(--ink)]">
        {showSidebar ? <SidebarShell /> : null}
        <main
          className={
            showSidebar
              ? "min-h-screen px-4 pb-6 pt-20 lg:pl-[21rem] lg:pr-6 lg:pt-6"
              : "min-h-screen px-4 pb-6 pt-6 lg:px-6"
          }
        >
          {children}
        </main>
      </div>
    </WorkspaceProvider>
  );
}

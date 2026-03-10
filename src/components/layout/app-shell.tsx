"use client";

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { SidebarNav } from "./sidebar-nav";
import { TopBar } from "./top-bar";

interface AppShellProps {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  return (
    <div className="dashboard-light min-h-screen bg-background text-foreground">
      <SidebarNav role={user.role} />
      <div className="pl-56">
        <TopBar user={user} onSignOut={handleSignOut} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

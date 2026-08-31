"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Dark only, platform-wide (founder decision). The stored light preference is
 * cleared so nobody resurrects it by accident.
 */
export function AdminThemeShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem("oneos:admin-theme");
    } catch {
      // storage unavailable, nothing to clear
    }
    document.documentElement.dataset.adminTheme = "dark";
  }, []);

  return (
    <div className="admin-theme-shell min-h-screen" data-admin-theme="dark">
      {children}
    </div>
  );
}

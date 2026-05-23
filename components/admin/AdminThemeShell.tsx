"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";

type AdminTheme = "dark" | "light";

const STORAGE_KEY = "oneos:admin-theme";

function readStoredTheme(): AdminTheme {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
}

export function AdminThemeShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AdminTheme>(() => readStoredTheme());
  const isLight = theme === "light";

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, theme);
    document.documentElement.dataset.adminTheme = theme;
  }, [theme]);

  return (
    <div className="admin-theme-shell min-h-screen" data-admin-theme={theme}>
      {children}
      <button
        type="button"
        onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        className="fixed bottom-4 right-4 z-[70] inline-flex items-center gap-2 rounded-full border border-white/16 bg-black/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:border-white/28 hover:bg-white/10"
        aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      >
        {isLight ? <Moon className="size-4" /> : <Sun className="size-4" />}
        {isLight ? "Dark" : "Light"}
      </button>
    </div>
  );
}

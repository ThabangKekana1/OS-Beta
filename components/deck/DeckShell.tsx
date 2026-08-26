"use client";

/**
 * The harness chrome (doc 21). Four verbs, one keystroke away:
 * Today · Threads · Briefs — plus ⌘K for jump-and-search. The CRM console
 * remains reachable under "Console" for audit, out of the habitat.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CommandPalette } from "@/components/deck/CommandPalette";
import { ChatDock } from "@/components/deck/ChatDock";

const SURFACES = [
  { href: "/admin", label: "Today" },
  { href: "/admin/threads", label: "Threads" },
  { href: "/admin/briefs", label: "Briefs" },
];

export function DeckShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--black)] text-[var(--ink)]">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-black/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <Link href="/admin" className="text-sm font-medium tracking-tight">
            1-MI
          </Link>
          <nav className="flex items-center gap-4 text-[13px]">
            {SURFACES.map((surface) => {
              const active =
                surface.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(surface.href);
              return (
                <Link
                  key={surface.href}
                  href={surface.href}
                  className={active ? "text-white" : "text-white/45 hover:text-white/80"}
                >
                  {surface.label}
                </Link>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto flex items-center gap-2 rounded-md border border-white/12 px-2.5 py-1 text-[11px] text-white/50 hover:text-white/90"
          >
            <kbd className="font-mono">⌘K</kbd>
            <span className="hidden sm:inline">search dossiers</span>
          </button>
          <Link
            href="/admin/worklist"
            className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/35 hover:text-white/70"
            title="Legacy CRM console"
          >
            Console
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>

      <ChatDock />

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

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
import { ANALEMMA_PATH, ANALEMMA_SUN } from "@/lib/analemma";

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
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/90 backdrop-blur-xl">
        <div className="flex h-16 w-full items-center gap-8 px-6 md:px-10">
          <Link href="/admin" className="flex items-center gap-3" aria-label="1-MI home">
            <svg width="34" height="10" viewBox="0 0 420 120" fill="none" aria-hidden>
              <path d={ANALEMMA_PATH} stroke="rgba(248,250,252,0.92)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={ANALEMMA_SUN.x} cy={ANALEMMA_SUN.y} r="16" fill="rgba(186,230,253,0.35)" />
              <circle cx={ANALEMMA_SUN.x} cy={ANALEMMA_SUN.y} r="8" fill="#ffffff" />
            </svg>
            <span className="text-[13px] font-semibold uppercase tracking-[0.3em] text-white">1-MI</span>
          </Link>
          <nav className="flex h-full items-center gap-1" aria-label="Surfaces">
            {SURFACES.map((surface) => {
              const active =
                surface.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(surface.href);
              return (
                <Link
                  key={surface.href}
                  href={surface.href}
                  className={`relative flex h-full items-center px-4 text-[13px] transition ${
                    active ? "text-white" : "text-white/45 hover:text-white/85"
                  }`}
                >
                  {surface.label}
                  {active ? (
                    <span aria-hidden className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-[var(--electric)]" />
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex h-9 items-center gap-2.5 rounded-md border border-white/12 bg-white/[0.03] px-3 text-[12px] text-white/55 transition hover:border-white/30 hover:text-white"
            >
              <span>Search dossiers</span>
              <kbd className="rounded-sm border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-white/40">⌘K</kbd>
            </button>
            <Link
              href="/admin/worklist"
              className="flex h-9 items-center rounded-md border border-white/10 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40 transition hover:border-white/25 hover:text-white/80"
              title="The full operations console"
            >
              Console
            </Link>
          </div>
        </div>
      </header>

      {/* Today is conversational-first and full-bleed: the conversation IS the
          interface. Secondary surfaces keep the reading container + the dock. */}
      {pathname === "/admin" ? (
        <main className="h-[calc(100dvh-4rem)] overflow-hidden">{children}</main>
      ) : (
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      )}

      {pathname !== "/admin" && <ChatDock />}

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

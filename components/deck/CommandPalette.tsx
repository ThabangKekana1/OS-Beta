"use client";

/**
 * ⌘K palette (doc 21): type anything — jump to a surface, or pull the
 * dossier of any company/person in the book. One input, two verbs.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type DossierHit = {
  bookId: string;
  companyName: string;
  sector: string | null;
  town: string | null;
};

const JUMPS = [
  { href: "/admin", label: "Today" },
  { href: "/admin/threads", label: "Threads" },
  { href: "/admin/briefs", label: "Briefs" },
  { href: "/admin/sales/harness", label: "Sales harness console" },
];

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DossierHit[]>([]);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/deck/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (payload?.ok) setHits(payload.hits ?? []);
      } catch {
        /* aborted */
      }
    }, 150);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const flatOptions = [
    ...JUMPS.filter((jump) => jump.label.toLowerCase().includes(query.toLowerCase()) || !query.trim()),
    ...hits.map((hit) => ({
      href: `/admin/dossier/${hit.bookId}`,
      label: `${hit.companyName} · dossier`,
    })),
  ];

  function commit(index: number) {
    const option = flatOptions[index];
    if (!option) return;
    router.push(option.href);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-28"
      onClick={onClose}
    >
      <div
        className="app-surface w-full max-w-xl overflow-hidden rounded-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "ArrowDown") { event.preventDefault(); setCursor((c) => Math.min(c + 1, flatOptions.length - 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
            if (event.key === "Enter") { event.preventDefault(); commit(cursor); }
          }}
          placeholder="Jump to… or search the book"
          className="w-full border-b border-white/8 bg-transparent px-4 py-3.5 font-mono text-[13px] tracking-wide outline-none placeholder:font-sans placeholder:text-white/28"
        />
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {flatOptions.map((option, index) => (
            <li key={option.href + index}>
              <button
                type="button"
                onMouseEnter={() => setCursor(index)}
                onClick={() => commit(index)}
                className={`block w-full truncate rounded-md px-3 py-2 text-left text-[13px] ${
                  index === cursor ? "bg-white/[0.05] text-white" : "text-white/70 hover:bg-white/[0.03]"
                }`}
              >
                {option.label}
              </button>
            </li>
          ))}
          {!flatOptions.length && (
            <li className="px-3 py-6 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">NO MATCH · {query}</li>
          )}
        </ul>
      </div>
    </div>
  );
}

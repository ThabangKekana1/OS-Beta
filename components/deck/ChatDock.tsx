"use client";

/**
 * MI — the harness voice, docked bottom-right per the Dawn grammar (doc 19).
 * Design system: operator tokens only (--canvas/--panel/--line/--electric);
 * wait states breathe (sun dot), never spin; pills carry status only.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SendHorizonal, X } from "lucide-react";

type DeckMessage = {
  id: string;
  role: "founder" | "harness" | "event";
  content: string;
  createdAt: string;
};

const QUICK = ["Brief me", "What changed since Friday?", "Prepare 10 poultry drafts", "Kill pending sends"];

export function ChatDock() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DeckMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const lastIsoRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hydration beacon: the dock renders server-side without handlers; tests
  // and automation must not interact until the client is live.
  useEffect(() => {
    document.documentElement.setAttribute("data-mi-ready", "1");
    return () => {
      delete document.documentElement.dataset.miReady;
    };
  }, []);

  const poll = useCallback(async () => {
    try {
      const url = lastIsoRef.current
        ? `/api/admin/deck/chat?since=${encodeURIComponent(lastIsoRef.current)}`
        : "/api/admin/deck/chat";
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (payload?.ok && Array.isArray(payload.messages) && payload.messages.length) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = payload.messages.filter((m: DeckMessage) => !seen.has(m.id));
          return [...prev, ...fresh];
        });
        lastIsoRef.current = payload.messages[payload.messages.length - 1].createdAt;
      }
    } catch {
      /* keep polling */
    }
  }, []);

  useEffect(() => {
    void poll();
    const timer = setInterval(poll, 4000);
    return () => clearInterval(timer);
  }, [poll]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, thinking]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || thinking) return;
    setInput("");
    setThinking(true);
    // Optimistic founder bubble; poll reconciliation dedupes by id.
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "founder", content, createdAt: new Date().toISOString() },
    ]);
    try {
      await fetch("/api/admin/deck/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } finally {
      await poll();
      setThinking(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          data-testid="mi-toggle"
          onClick={() => setOpen(true)}
          className="fixed bottom-[4.25rem] right-4 z-[80] flex min-h-[40px] items-center gap-2 rounded-md border border-white/16 bg-black/92 px-4 py-2.5 text-sm shadow-2xl backdrop-blur transition hover:border-white/38"
        >
          <span className="status-dot animate-pulse text-[var(--electric)]" style={{ animationDuration: "3.5s" }} />
          <span className="font-display text-xs uppercase tracking-[0.28em] text-white">MI</span>
        </button>
      )}

      {open && (
        <aside className="fixed bottom-[7rem] right-4 z-[80] h-[560px] w-[380px]">
          {/* app-surface owns the skin; the wrapper owns only positioning. */}
          <div className="app-surface flex h-full w-full flex-col overflow-hidden rounded-lg">
          <header className="flex items-center justify-between border-b border-white/8 px-3.5 py-2.5">
            <p className="flex items-center gap-2">
              <span className="font-display text-[11px] uppercase tracking-[0.3em] text-white">MI</span>
              <span className="line-label hidden sm:inline">CHIEF OF STAFF</span>
            </p>
            <button type="button" onClick={() => setOpen(false)} className="text-white/40 transition hover:text-white">
              <X className="size-4" />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
            {!messages.length && (
              <div className="space-y-2 pt-8 text-center">
                <p className="text-[13px] text-white/75">MI online.</p>
                <p className="line-label">I PREPARE. YOU DECIDE.</p>
              </div>
            )}
            {messages.map((message) =>
              message.role === "event" ? (
                <div key={message.id} className="border-t border-dashed border-white/10 pt-2 font-mono text-[10px] leading-4 text-white/45">
                  {message.content}
                </div>
              ) : message.role === "founder" ? (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[86%] whitespace-pre-wrap rounded-md border border-white/14 bg-[var(--panel-strong)] px-3 py-2 text-[13px] leading-5 text-white">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div key={message.id} className="border-l-2 border-[var(--electric)] pl-3">
                  <div className="whitespace-pre-wrap text-[13px] leading-5 text-white/90">{message.content}</div>
                </div>
              ),
            )}
            {thinking && (
              <div className="flex items-center gap-2 pl-3 pt-1">
                <span
                  aria-hidden
                  className="block size-1.5 rounded-full bg-white/85 motion-safe:animate-pulse"
                  style={{ animationDuration: "2.8s" }}
                />
                <span className="line-label">MI IS WORKING</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {QUICK.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => void send(chip)}
                disabled={thinking}
                className="min-h-[32px] rounded-sm border border-white/12 px-2.5 py-1 text-[11px] text-white/65 transition hover:border-white/35 hover:text-white disabled:pointer-events-none disabled:opacity-25"
              >
                {chip}
              </button>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-2 border-t border-white/8 p-2.5"
          >
            <input
              data-testid="mi-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Tell MI…"
              className="min-w-0 flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-white/25"
            />
            <button type="submit" disabled={thinking || !input.trim()} className="text-white/80 transition enabled:hover:text-white disabled:text-white/25">
              <SendHorizonal className="size-4" />
            </button>
          </form>
          </div>
        </aside>
      )}
    </>
  );
}

"use client";

/**
 * MI — the harness voice, docked bottom-right per the Dawn grammar (doc 19).
 * Founder and harness share one thread; platform events land in it too.
 * Short-poll today (4s), stream-ready tomorrow: the transport is one GET.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, SendHorizonal, X } from "lucide-react";

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

  // Hydration beacon: tests (and future automation) must not interact until
  // the client is live — the dock renders server-side without handlers.
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
    // Optimistic founder bubble; reconciliation via poll dedupes by id.
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
          className="fixed bottom-[4.25rem] right-4 z-[80] flex items-center gap-2 rounded-full border border-white/14 bg-black/90 px-4 py-2.5 text-sm shadow-2xl backdrop-blur hover:border-white/30"
        >
          <MessageSquare className="size-4 text-emerald-300" />
          <span>MI</span>
          <span className="relative flex size-2 items-center justify-center">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/30 motion-safe:animate-ping" style={{ animationDuration: "3s" }} />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </span>
        </button>
      )}

      {open && (
        <aside className="fixed bottom-[7rem] right-4 z-[80] flex h-[560px] w-[380px] flex-col overflow-hidden rounded-xl border border-white/12 bg-[#07070a]/97 shadow-2xl backdrop-blur-xl">
          <header className="flex items-center justify-between border-b border-white/8 px-3.5 py-2.5">
            <p className="text-[12px] font-medium">
              MI <span className="ml-1 rounded-full bg-emerald-300/10 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-emerald-300">glm-5.3 flash</span>
            </p>
            <button type="button" onClick={() => setOpen(false)} className="opacity-50 hover:opacity-100">
              <X className="size-4" />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
            {!messages.length && (
              <div className="space-y-2 pt-6 text-center">
                <p className="text-[13px] opacity-70">MI online. I prepare, you decide.</p>
                <p className="text-[11px] opacity-40">Try a chip below, or just say it.</p>
              </div>
            )}
            {messages.map((message) => (
              <div key={message.id} className={message.role === "founder" ? "flex justify-end" : ""}>
                <div
                  className={`max-w-[86%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-5 ${
                    message.role === "founder"
                      ? "bg-white text-black"
                      : message.role === "harness"
                        ? "bg-emerald-300/8 text-emerald-50 border border-emerald-300/15"
                        : "border border-dashed border-white/12 bg-transparent text-white/55 text-[11px]"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="text-[11px] italic text-white/40">MI is working…</div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {QUICK.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => void send(chip)}
                disabled={thinking}
                className="rounded-full border border-white/12 px-2.5 py-1 text-[11px] text-white/65 hover:border-white/30 hover:text-white disabled:opacity-30"
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
            <button type="submit" disabled={thinking || !input.trim()} className="opacity-80 enabled:hover:opacity-100 disabled:opacity-25">
              <SendHorizonal className="size-4" />
            </button>
          </form>
        </aside>
      )}
    </>
  );
}

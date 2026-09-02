"use client";

/**
 * MI — the harness voice (doc 21). Two renderers over ONE thread:
 *
 *   <DeckConversation/>  the PRIMARY surface of Today. The conversation is
 *                        the interface; verdicts and briefs sit in a rail.
 *   <ChatDock/>          the floating companion on secondary surfaces
 *                        (Threads, Briefs), Dawn-grammar bottom-right.
 *
 * Design system: operator tokens only (--canvas/--panel/--line/--electric);
 * wait states breathe, never spin; pills carry status only.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { SendHorizonal, X } from "lucide-react";

type DeckMessage = {
  id: string;
  role: "founder" | "harness" | "event";
  content: string;
  createdAt: string;
};

const QUICK = ["Brief me", "What changed since Friday?", "Fill today to 20 drafts", "Kill pending sends"];

function useDeckThread() {
  const [messages, setMessages] = useState<DeckMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const lastIsoRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
          const fresh = (payload.messages as DeckMessage[]).filter((m) => !seen.has(m.id));
          if (!fresh.length) return prev;
          // The optimistic founder bubble carries a local id, so the server copy
          // of the same line is a different id and would render a second time.
          // Drop any local bubble the server has now echoed back.
          const echoed = new Set(
            fresh.filter((m) => m.role === "founder").map((m) => m.content.trim()),
          );
          const kept = prev.filter(
            (m) => !(m.id.startsWith("local-") && m.role === "founder" && echoed.has(m.content.trim())),
          );
          return [...kept, ...fresh];
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

  return { messages, input, setInput, thinking, send, scrollRef };
}

function Stream({
  thread,
  primary,
}: {
  thread: ReturnType<typeof useDeckThread>;
  primary?: boolean;
}) {
  const { messages, thinking, scrollRef } = thread;
  return (
    <div
      ref={scrollRef}
      className={`min-h-0 flex-1 space-y-3 overflow-y-auto ${primary ? "px-6 py-6 md:px-10" : "px-3.5 py-3"}`}
    >
      {!messages.length && (
        <div className={`space-y-2 text-center ${primary ? "pt-24" : "pt-8"}`}>
          <p className={primary ? "text-[15px] text-white/80" : "text-[13px] text-white/75"}>MI online.</p>
          <p className="line-label">I PREPARE. YOU DECIDE.</p>
        </div>
      )}
      {messages.map((message) =>
        message.role === "event" ? (
          <div
            key={message.id}
            className={`border-t border-dashed border-white/10 pt-2 font-mono text-[10px] leading-4 text-white/45`}
          >
            {message.content}
          </div>
        ) : message.role === "founder" ? (
          <div key={message.id} className={`flex justify-end`}>
            <div className={`whitespace-pre-wrap rounded-md border border-white/14 bg-[var(--panel-strong)] px-3 py-2 leading-5 text-white ${primary ? "max-w-[560px] text-[14px]" : "max-w-[86%] text-[13px]"}`}>
              {message.content}
            </div>
          </div>
        ) : (
          <div key={message.id} className={`border-l-2 border-[var(--electric)] pl-3`}>
            <div className={`whitespace-pre-wrap leading-6 text-white/90 ${primary ? "max-w-[1100px] text-[14px]" : "text-[13px] leading-5"}`}>{message.content}</div>
          </div>
        ),
      )}
      {thinking && (
        <div className={`flex items-center gap-2 pt-1 ${primary ? "pl-3" : "pl-3"}`}>
          <span
            aria-hidden
            className="block size-1.5 rounded-full bg-white/85 motion-safe:animate-pulse"
            style={{ animationDuration: "2.8s" }}
          />
          <span className="line-label">MI IS WORKING</span>
        </div>
      )}
    </div>
  );
}

function Composer({
  thread,
  primary,
}: {
  thread: ReturnType<typeof useDeckThread>;
  primary?: boolean;
}) {
  const { input, setInput, thinking, send } = thread;
  return (
    <div className={primary ? "shrink-0 border-t border-white/8" : "shrink-0"}>
      <div className={`flex flex-wrap gap-1.5 ${primary ? "px-6 pt-3 md:px-10" : "px-3 pb-2"}`}>
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
        className={
          primary
            ? "flex w-full items-center gap-3 px-6 py-4 md:px-10"
            : "flex items-center gap-2 border-t border-white/8 p-2.5"
        }
      >
        <input
          data-testid="mi-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={primary ? "Tell MI what you need…" : "Tell MI…"}
          className={
            primary
              ? "min-w-0 flex-1 rounded-md border border-white/14 bg-white/[0.02] px-4 py-3 text-[14px] outline-none transition placeholder:text-white/25 focus:border-white/35"
              : "min-w-0 flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-white/25"
          }
        />
        <button
          type="submit"
          disabled={thinking || !input.trim()}
          className={
            primary
              ? "grid size-11 shrink-0 place-items-center rounded-md border border-white/16 text-white/80 transition enabled:hover:border-white/45 enabled:hover:text-white disabled:text-white/25"
              : "text-white/80 transition enabled:hover:text-white disabled:text-white/25"
          }
        >
          <SendHorizonal className="size-4" />
        </button>
      </form>
    </div>
  );
}

/** The primary surface: the conversation IS the interface. */
export function DeckConversation() {
  const thread = useDeckThread();
  useEffect(() => {
    document.documentElement.setAttribute("data-mi-ready", "1");
    return () => {
      delete document.documentElement.dataset.miReady;
    };
  }, []);
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden" aria-label="MI, your chief of staff">
      <header className="flex items-center gap-3 border-b border-white/8 px-6 py-3 md:px-10">
        <span className="status-dot animate-pulse text-[var(--electric)]" style={{ animationDuration: "3.5s" }} />
        <span className="font-display text-[12px] uppercase tracking-[0.3em] text-white">MI</span>
        <span className="line-label">CHIEF OF STAFF · LIVE ON YOUR PIPELINE</span>
      </header>
      <Stream thread={thread} primary />
      <Composer thread={thread} primary />
    </section>
  );
}

/** The floating companion for secondary surfaces. */
export function ChatDock() {
  const [open, setOpen] = useState(false);
  const thread = useDeckThread();
  useEffect(() => {
    document.documentElement.setAttribute("data-mi-ready", "1");
    return () => {
      delete document.documentElement.dataset.miReady;
    };
  }, []);
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
        <aside className="fixed bottom-[6rem] right-4 z-[80] flex h-[min(78dvh,760px)] w-[min(calc(100vw-2rem),560px)] flex-col">
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
            <Stream thread={thread} />
            <Composer thread={thread} />
          </div>
        </aside>
      )}
    </>
  );
}

"use client";

import type { ReactNode, TextareaHTMLAttributes } from "react";
import { Bot, Info, Mic, Paperclip, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversationMode } from "@/lib/types";

type StatusBadgeProps = {
  label: string;
  tone?: "neutral" | "bright" | "muted";
  className?: string;
};

export function StatusBadge({
  label,
  tone = "neutral",
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[0.62rem] font-medium uppercase tracking-[0.26em]",
        tone === "bright" && "border-white/18 bg-white text-black",
        tone === "neutral" && "border-white/12 bg-white/[0.04] text-white/74",
        tone === "muted" && "border-white/8 bg-transparent text-white/46",
        className,
      )}
    >
      <span className="status-dot" />
      {label}
    </span>
  );
}

export function HeroGradientCanvas({ className }: { className?: string }) {
  return (
    <div className={cn("absolute inset-0 overflow-hidden rounded-[inherit]", className)}>
      <div className="ambient-grid" />
      <div className="soft-bloom soft-bloom-blue left-[-8%] top-[4%] size-[26rem]" />
      <div className="soft-bloom soft-bloom-magenta right-[-6%] top-[8%] size-[22rem]" />
      <div className="soft-bloom soft-bloom-blue bottom-[-28%] left-[28%] size-[34rem] opacity-30" />
      <div className="subtle-noise" />
    </div>
  );
}

type WorkspaceHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  actions,
}: WorkspaceHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-white/8 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="line-label">{eyebrow}</p>
        <h1 className="mt-3 max-w-4xl text-[clamp(2rem,4vw,4.5rem)] font-medium tracking-[-0.06em] text-white">
          {title}
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-white/62">{description}</p>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

type AttachmentButtonProps = {
  disabled?: boolean;
  onClick: () => void;
};

export function AttachmentButton({
  disabled,
  onClick,
}: AttachmentButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Upload document"
      onClick={onClick}
      className="flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/78 transition hover:border-white/18 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-35"
    >
      <Paperclip className="size-4" />
    </button>
  );
}

type SendMessageButtonProps = {
  disabled?: boolean;
  onClick: () => void;
};

export function SendMessageButton({
  disabled,
  onClick,
}: SendMessageButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Send message"
      onClick={onClick}
      className="flex size-12 items-center justify-center rounded-full border border-white bg-white text-black transition hover:bg-white/92 disabled:cursor-not-allowed disabled:border-white/18 disabled:bg-white/10 disabled:text-white/38"
    >
      <Send className="size-4" />
    </button>
  );
}

type ModeSelectorProps = {
  modes: readonly ConversationMode[];
  value: ConversationMode;
  onChange: (mode: ConversationMode) => void;
};

export function ModeSelector({ modes, value, onChange }: ModeSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[1rem] border border-white/8 bg-white/[0.02] p-1.5">
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={cn(
            "rounded-[0.8rem] px-3 py-2 text-[0.62rem] font-medium uppercase tracking-[0.24em] transition",
            value === mode
              ? "bg-white text-black"
              : "text-white/52 hover:bg-white/[0.04] hover:text-white/86",
          )}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}

type ComposerInputProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function ComposerInput(props: ComposerInputProps) {
  return (
    <textarea
      {...props}
      rows={2}
      className={cn(
        "min-h-[76px] w-full resize-none bg-transparent px-1 py-1 text-[0.98rem] leading-7 text-white placeholder:text-white/34 focus:outline-none",
        props.className,
      )}
    />
  );
}

type UserMessageProps = {
  content: string;
  timestamp: string;
};

export function UserMessage({ content, timestamp }: UserMessageProps) {
  return (
    <div className="ml-auto max-w-[42rem] rounded-[1.5rem] rounded-br-md bg-white px-5 py-4 text-black shadow-[0_18px_44px_rgba(0,0,0,0.34)]">
      <p className="text-sm leading-7">{content}</p>
      <p className="mt-2 text-[0.68rem] uppercase tracking-[0.22em] text-black/48">{timestamp}</p>
    </div>
  );
}

type SystemMessageProps = {
  title?: string;
  content: string;
  timestamp: string;
  variant?: "system" | "assistant" | "internal";
};

export function SystemMessage({
  title,
  content,
  timestamp,
  variant = "system",
}: SystemMessageProps) {
  const icon =
    variant === "assistant" ? (
      <Bot className="size-4" />
    ) : variant === "internal" ? (
      <Sparkles className="size-4" />
    ) : (
      <Info className="size-4" />
    );

  return (
    <div
      className={cn(
        "max-w-[42rem] rounded-[1.4rem] border px-5 py-4",
        variant === "assistant" && "border-white/10 bg-white/[0.04]",
        variant === "system" && "border-white/12 bg-black/65",
        variant === "internal" && "border-dashed border-white/16 bg-white/[0.02]",
      )}
    >
      <div className="flex items-center gap-3 text-[0.66rem] uppercase tracking-[0.26em] text-white/46">
        <span className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/68">
          {icon}
        </span>
        <span>{title ?? (variant === "assistant" ? "1OS" : "System event")}</span>
        <span className="ml-auto text-white/32">{timestamp}</span>
      </div>
      <p className="mt-3 text-sm leading-7 text-white/72">{content}</p>
    </div>
  );
}

export function VoicePlaceholder() {
  return (
    <div className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/44">
      <Mic className="size-4" />
    </div>
  );
}

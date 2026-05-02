"use client";

import type { TextareaHTMLAttributes } from "react";
import { Bot, Info, Paperclip, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

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
      <div className="whitespace-pre-wrap text-sm leading-7">{content}</div>
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
      <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-white/72">{content}</div>
    </div>
  );
}

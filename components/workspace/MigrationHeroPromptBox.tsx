"use client";

import { type FormEvent, useRef } from "react";
import { ArrowUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type MigrationHeroPromptBoxProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

export function MigrationHeroPromptBox({
  value,
  onValueChange,
  onSubmit,
  disabled = false,
}: MigrationHeroPromptBoxProps) {
  const canSubmit = !disabled && value.trim().length > 0;
  const formRef = useRef<HTMLFormElement | null>(null);

  const submitRequest = () => {
    if (!canSubmit) {
      return;
    }

    onSubmit();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitRequest();
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="elevated-input rounded-[1.8rem] px-5 py-5 sm:px-6 sm:py-6"
    >
      <textarea
        rows={3}
        value={value}
        disabled={disabled}
        placeholder="Ask 1OS to help you migrate"
        enterKeyHint="send"
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            submitRequest();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        className="min-h-[5.2rem] w-full resize-none bg-transparent text-left text-sm leading-7 text-white placeholder:text-white/38 focus:outline-none disabled:cursor-not-allowed disabled:opacity-55 sm:text-[0.98rem]"
      />

      <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
        <button
          type="button"
          aria-label="Add attachment"
          disabled
          className="inline-flex size-10 items-center justify-center rounded-full border border-white/14 bg-white/[0.02] text-white/72 opacity-55"
        >
          <Plus className="size-4" />
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-full border border-white/14 bg-black px-4 py-2 text-[0.63rem] font-medium uppercase tracking-[0.24em] text-white/70 transition-colors duration-200 hover:border-white/24 hover:text-white"
          >
            Build
          </button>
          <button
            type="button"
            aria-label="Submit request"
            disabled={!canSubmit}
            onClick={submitRequest}
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-full border transition-colors duration-200",
              canSubmit
                ? "border-white bg-white text-black hover:bg-white/90"
                : "cursor-not-allowed border-white/18 bg-white/10 text-white/34",
            )}
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
    </form>
  );
}

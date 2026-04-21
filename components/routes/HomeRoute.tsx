"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMarkOneOS } from "@/components/sidebar/BrandMarkOneOS";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { MigrationHeroPromptBox } from "@/components/workspace/MigrationHeroPromptBox";

const conversationSuggestions = [
  "How are you?",
  "What does Foundation-1 do?",
  "Explain Generocity.",
  "I want to start migrating from Eskom.",
  "What documents do you need from me?",
  "What is my current status?",
] as const;

export function HomeRoute() {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const { activeCaseId, cases, sendMessage, setActiveCaseId } = useWorkspace();

  useEffect(() => {
    if (!activeCaseId && cases.length > 0) {
      setActiveCaseId(cases[0].id);
    }
  }, [activeCaseId, cases, setActiveCaseId]);

  const targetCaseId =
    (activeCaseId && cases.some((migrationCase) => migrationCase.id === activeCaseId)
      ? activeCaseId
      : null) ??
    cases[0]?.id ??
    null;

  const openCase = (caseId: string) => {
    setActiveCaseId(caseId);
    startTransition(() => {
      router.push(`/case/${caseId}`);
    });
  };

  const handleSubmit = () => {
    const trimmed = draft.trim();
    const nextCaseId = targetCaseId ?? cases[0]?.id ?? null;

    if (!trimmed || !nextCaseId) {
      return;
    }

    sendMessage(nextCaseId, trimmed, "Migrate");
    setDraft("");
    openCase(nextCaseId);
  };

  const handleSuggestionClick = (suggestion: string) => {
    const nextCaseId = targetCaseId ?? cases[0]?.id ?? null;

    if (!nextCaseId) {
      return;
    }

    sendMessage(nextCaseId, suggestion, "Migrate");
    setDraft("");
    openCase(nextCaseId);
  };

  return (
    <div className="min-h-[calc(100vh-6rem)]">
      <section className="app-surface surface-ring relative min-h-[calc(100vh-6rem)] rounded-[2rem] border border-white/12 bg-[#050505] p-4 sm:p-6 lg:p-8">
        <div className="ambient-grid" />
        <div className="subtle-noise" />
        <div className="soft-bloom soft-bloom-blue left-[15%] top-[2%] h-[300px] w-[300px]" />
        <div className="soft-bloom soft-bloom-magenta right-[12%] top-[6%] h-[280px] w-[280px]" />

        <div className="relative z-10 flex h-full flex-col">
          <header className="flex items-center justify-between gap-4">
            <BrandMarkOneOS />
            <p className="hidden text-[0.62rem] uppercase tracking-[0.3em] text-white/48 md:block">
              Managed Migration Workspace
            </p>
          </header>

          <div className="mx-auto mt-10 flex w-full max-w-[72rem] flex-1 flex-col">
            <div className="mx-auto w-full max-w-[56rem] text-center">
              <h1 className="font-display text-[clamp(2rem,5vw,4.4rem)] font-semibold tracking-[-0.02em] text-white">
                Let&apos;s Migrate.
              </h1>
              <p className="mx-auto mt-4 max-w-[48rem] text-sm leading-7 text-white/64 sm:text-base">
                Chat naturally to get guidance, compare products, and move your migration forward step by step.
              </p>
            </div>

            <div className="mx-auto mt-8 w-full max-w-[56rem]">
              <MigrationHeroPromptBox
                value={draft}
                onValueChange={setDraft}
                onSubmit={handleSubmit}
                disabled={!targetCaseId}
              />
            </div>

            <div className="mx-auto mt-6 w-full max-w-[56rem]">
              <p className="line-label text-center">Start Here</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {conversationSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={!targetCaseId}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="rounded-[0.95rem] border border-white/12 bg-black/45 px-4 py-3 text-left text-sm text-white/74 transition hover:border-white/22 hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

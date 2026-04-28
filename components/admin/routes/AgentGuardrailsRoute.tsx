"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { AdminHeader } from "@/components/admin/AdminPrimitives";
import type { AgentConfig } from "@/lib/assistant/agent-config";

const KNOWN_MODES = [
  "Migrate",
  "Register",
  "Review Documents",
  "Proposal Support",
  "Term Sheet Support",
  "Close Deal",
];

const inputClass =
  "w-full rounded-[0.85rem] border border-white/12 bg-[rgba(8,8,8,0.78)] px-3 py-2 text-sm text-white placeholder:text-white/36 focus:border-white/24 focus:outline-none";
const textareaClass = `${inputClass} min-h-[7rem] font-mono text-[0.78rem] leading-5`;
const labelClass = "mb-1.5 block text-[0.62rem] uppercase tracking-[0.2em] text-white/52";

function listToText(list: string[]) {
  return list.join("\n");
}
function textToList(text: string) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeIntegerInput(value: string) {
  const digitsOnly = value.replace(/[^\d]/g, "");
  return digitsOnly.replace(/^0+(?=\d)/, "");
}

function buildPayload(
  config: AgentConfig,
  doNotSayText: string,
  escalationText: string,
  minMonthlySpendText: string,
) {
  return {
    systemPrompt: config.systemPrompt?.trim() || null,
    onboardingPlaybook: config.onboardingPlaybook?.trim() || null,
    tone: config.tone?.trim() || null,
    doNotSay: textToList(doNotSayText),
    escalationTriggers: textToList(escalationText),
    modeOverrides: Object.fromEntries(
      Object.entries(config.modeOverrides)
        .map(([k, v]) => [k, v.trim()])
        .filter(([, v]) => v),
    ),
    prequalification: {
      ...config.prequalification,
      minMonthlySpendZar: Number(minMonthlySpendText || "0") || 0,
    },
  };
}

function saveLabel(updatedAt: string | null) {
  return updatedAt ? `Saved ${new Date(updatedAt).toLocaleString()}` : "Not saved yet";
}

export function AgentGuardrailsRoute({ initialConfig }: { initialConfig: AgentConfig }) {
  const [config, setConfig] = useState<AgentConfig>(initialConfig);
  const [doNotSayText, setDoNotSayText] = useState(listToText(initialConfig.doNotSay));
  const [escalationText, setEscalationText] = useState(listToText(initialConfig.escalationTriggers));
  const [minMonthlySpendText, setMinMonthlySpendText] = useState(
    String(initialConfig.prequalification.minMonthlySpendZar),
  );
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState(
    JSON.stringify(
      buildPayload(
        initialConfig,
        listToText(initialConfig.doNotSay),
        listToText(initialConfig.escalationTriggers),
        String(initialConfig.prequalification.minMonthlySpendZar),
      ),
    ),
  );
  const [pending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const payload = buildPayload(config, doNotSayText, escalationText, minMonthlySpendText);
  const isDirty = JSON.stringify(payload) !== lastSavedFingerprint;

  function updateModeOverride(mode: string, value: string) {
    setConfig((prev) => ({
      ...prev,
      modeOverrides: { ...prev.modeOverrides, [mode]: value },
    }));
  }

  function handleSave() {
    setStatusMessage(null);
    setErrorMessage(null);
    if (!isDirty && config.updatedAt) {
      setStatusMessage(saveLabel(config.updatedAt));
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/agent-config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setErrorMessage(body?.error ?? `Save failed (${res.status}).`);
          return;
        }
        const json = (await res.json()) as { config: AgentConfig };
        const savedPayload = buildPayload(
          json.config,
          listToText(json.config.doNotSay),
          listToText(json.config.escalationTriggers),
          String(json.config.prequalification.minMonthlySpendZar),
        );
        setConfig(json.config);
        setDoNotSayText(listToText(json.config.doNotSay));
        setEscalationText(listToText(json.config.escalationTriggers));
        setMinMonthlySpendText(String(json.config.prequalification.minMonthlySpendZar));
        setLastSavedFingerprint(JSON.stringify(savedPayload));
        setStatusMessage(`Saved at ${new Date(json.config.updatedAt ?? Date.now()).toLocaleTimeString()}.`);
      } catch {
        setErrorMessage("Unable to reach the guardrails service. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="Agent Behavior"
        title="Agent Guardrails"
        description="Tune how 1OS speaks to customers, what it must never say, and how it guides them through onboarding. Changes take effect on the very next chat message — no deploy."
        actions={
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <span className="text-[0.68rem] uppercase tracking-[0.18em] text-white/45">
              {isDirty ? "Unsaved changes" : saveLabel(config.updatedAt)}
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.06] px-5 py-2 text-xs font-medium uppercase tracking-[0.2em] text-white transition hover:border-white/24 hover:bg-white/[0.1] disabled:opacity-50"
            >
              <ShieldCheck className="size-3.5" />
              {pending ? "Saving…" : isDirty ? "Save changes" : "Save guardrails"}
            </button>
          </div>
        }
      />

      {statusMessage ? (
        <div className="rounded-[1rem] border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-2.5 text-sm text-emerald-200">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-[1rem] border border-rose-400/20 bg-rose-400/[0.06] px-4 py-2.5 text-sm text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      <section className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-5">
        <h2 className="text-base font-medium text-white">Base system prompt</h2>
        <p className="mt-1 text-xs text-white/56">
          Foundational personality and product rules. Leave blank to use the built-in default.
        </p>
        <label className={`${labelClass} mt-4`}>System prompt</label>
        <textarea
          className={textareaClass}
          rows={10}
          placeholder="Leave blank to use built-in Foundation-1 default."
          value={config.systemPrompt ?? ""}
          onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
        />

        <label className={`${labelClass} mt-4`}>Tone directive</label>
        <input
          className={inputClass}
          placeholder="e.g. warm, plain English, concise, no jargon"
          value={config.tone ?? ""}
          onChange={(e) => setConfig({ ...config, tone: e.target.value })}
        />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-5">
        <h2 className="text-base font-medium text-white">Onboarding playbook</h2>
        <p className="mt-1 text-xs text-white/56">
          Step-by-step script the agent follows to walk customers through onboarding. Use numbered steps.
        </p>
        <textarea
          className={`${textareaClass} mt-4`}
          rows={10}
          placeholder={`Step 1 — Greet the customer by name and confirm the business…\nStep 2 — Ask for 6 most recent utility bills…\nStep 3 — Walk them through the EOI…`}
          value={config.onboardingPlaybook ?? ""}
          onChange={(e) => setConfig({ ...config, onboardingPlaybook: e.target.value })}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-5">
          <h2 className="text-base font-medium text-white">Hard guardrails — never say</h2>
          <p className="mt-1 text-xs text-white/56">One rule per line. Treated as absolute prohibitions.</p>
          <textarea
            className={`${textareaClass} mt-4`}
            rows={8}
            placeholder={`Never quote specific tariff figures.\nNever promise guaranteed savings percentages.\nNever give legal advice.`}
            value={doNotSayText}
            onChange={(e) => setDoNotSayText(e.target.value)}
          />
        </section>

        <section className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-5">
          <h2 className="text-base font-medium text-white">Escalation triggers</h2>
          <p className="mt-1 text-xs text-white/56">
            Phrases or topics that must hand off to a human. One per line.
          </p>
          <textarea
            className={`${textareaClass} mt-4`}
            rows={8}
            placeholder={`lawyer\ncomplaint\ncancel my contract\nrefund`}
            value={escalationText}
            onChange={(e) => setEscalationText(e.target.value)}
          />
        </section>
      </div>

      <section className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-5">
        <h2 className="text-base font-medium text-white">Per-mode instructions</h2>
        <p className="mt-1 text-xs text-white/56">
          Extra direction layered on top when the customer is in a specific conversation mode.
        </p>
        <div className="mt-4 space-y-4">
          {KNOWN_MODES.map((mode) => (
            <div key={mode}>
              <label className={labelClass}>{mode}</label>
              <textarea
                className={textareaClass}
                rows={3}
                placeholder={`Extra instructions for "${mode}" mode…`}
                value={config.modeOverrides[mode] ?? ""}
                onChange={(e) => updateModeOverride(mode, e.target.value)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-5">
        <h2 className="text-base font-medium text-white">Pre-qualification rules (Register mode)</h2>
        <p className="mt-1 text-xs text-white/56">
          When the agent collects business details conversationally, it must pass these gates before submitting a lead.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Minimum monthly electricity spend (ZAR)</label>
            <input
              className={inputClass}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="10000"
              value={minMonthlySpendText}
              onFocus={(e) => {
                if (e.currentTarget.value === "0") {
                  e.currentTarget.select();
                }
              }}
              onChange={(e) => setMinMonthlySpendText(normalizeIntegerInput(e.target.value))}
              onBlur={() => {
                if (!minMonthlySpendText) {
                  setMinMonthlySpendText("0");
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-3 pt-5">
            <label className="flex items-center gap-2 text-xs text-white/72">
              <input
                type="checkbox"
                checked={config.prequalification.requireRegistered}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    prequalification: { ...config.prequalification, requireRegistered: e.target.checked },
                  })
                }
              />
              Require business to be CIPC-registered
            </label>
            <label className="flex items-center gap-2 text-xs text-white/72">
              <input
                type="checkbox"
                checked={config.prequalification.requireOperational}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    prequalification: { ...config.prequalification, requireOperational: e.target.checked },
                  })
                }
              />
              Require business to be currently operational
            </label>
          </div>
        </div>
        <label className={`${labelClass} mt-4`}>Soft disqualify message</label>
        <textarea
          className={textareaClass}
          rows={3}
          value={config.prequalification.softDisqualifyMessage}
          onChange={(e) =>
            setConfig({
              ...config,
              prequalification: { ...config.prequalification, softDisqualifyMessage: e.target.value },
            })
          }
        />
      </section>

      <p className="text-xs text-white/48">
        Last updated{" "}
        {config.updatedAt ? new Date(config.updatedAt).toLocaleString() : "never"}
        {config.updatedBy ? ` by ${config.updatedBy}` : ""}.
      </p>

      <div className="sticky bottom-4 z-20 rounded-[1.2rem] border border-white/12 bg-black/88 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-white">
              {isDirty ? "Guardrails changed" : "Guardrails saved"}
            </p>
            <p className="mt-1 text-xs text-white/56">
              {isDirty
                ? "Save to apply these rules to the very next customer message."
                : saveLabel(config.updatedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-white/92 disabled:cursor-not-allowed disabled:border-white/18 disabled:bg-white/10 disabled:text-white/38"
          >
            <ShieldCheck className="size-3.5" />
            {pending ? "Saving…" : isDirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>
    </div>
  );
}

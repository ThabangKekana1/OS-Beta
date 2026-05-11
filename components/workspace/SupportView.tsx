"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, LifeBuoy, Mail, MessageSquareText, PhoneCall } from "lucide-react";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";

const requestTypes = [
  "General support",
  "Pricing and commercials",
  "Proposal review",
  "Documents and onboarding",
  "Call me back",
] as const;

const contactMethods = ["Email", "Phone call", "WhatsApp"] as const;

type RequestType = (typeof requestTypes)[number];
type ContactMethod = (typeof contactMethods)[number];

type SubmitState = "idle" | "submitting" | "success" | "error";

export function SupportView() {
  const { activeCase, activeWorkspaceId } = useWorkspace();
  const [requestType, setRequestType] = useState<RequestType>("General support");
  const [contactMethod, setContactMethod] = useState<ContactMethod>("Email");
  const [contactValue, setContactValue] = useState("");
  const [message, setMessage] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!activeCase) {
    return (
      <div className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-8 text-center text-white/64">
        Select a business from the left rail before requesting support from 1OS.
      </div>
    );
  }

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedMessage = message.trim();
    const trimmedContactValue = contactValue.trim();

    if (trimmedMessage.length < 12) {
      setSubmitState("error");
      setErrorMessage("Add a short description of what you need from support.");
      return;
    }

    setSubmitState("submitting");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/workspace/support", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: activeWorkspaceId,
          caseName: activeCase.business.name,
          requestType,
          preferredContactMethod: contactMethod,
          preferredContactValue: trimmedContactValue || null,
          message: trimmedMessage,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Unable to send your support request.");
      }

      setSubmitState("success");
      setMessage("");
      setContactValue("");
    } catch (error) {
      setSubmitState("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to send your support request.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="line-label">Support</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em] text-white">
            {activeCase.business.name}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            Request help from 1OS support when you need a human follow-up on commercials, documents,
            onboarding, or proposal questions.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.04] px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.2em] text-white/68">
          <LifeBuoy className="size-3.5" /> 1OS support
        </span>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <form
          onSubmit={submitRequest}
          className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.84)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.42)]"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-white/46">
                Support type
              </span>
              <select
                value={requestType}
                onChange={(event) => setRequestType(event.target.value as RequestType)}
                className="h-11 rounded-[0.95rem] border border-white/12 bg-black/55 px-3 text-sm text-white outline-none transition focus:border-white/28"
              >
                {requestTypes.map((option) => (
                  <option key={option} value={option} className="bg-zinc-950">
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-white/46">
                Preferred contact
              </span>
              <select
                value={contactMethod}
                onChange={(event) => setContactMethod(event.target.value as ContactMethod)}
                className="h-11 rounded-[0.95rem] border border-white/12 bg-black/55 px-3 text-sm text-white outline-none transition focus:border-white/28"
              >
                {contactMethods.map((option) => (
                  <option key={option} value={option} className="bg-zinc-950">
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mt-4 flex flex-col gap-2">
            <span className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-white/46">
              Contact detail
            </span>
            <input
              value={contactValue}
              onChange={(event) => setContactValue(event.target.value)}
              placeholder="Optional email address, phone number, or WhatsApp number"
              className="h-11 rounded-[0.95rem] border border-white/12 bg-black/55 px-3 text-sm text-white outline-none transition placeholder:text-white/32 focus:border-white/28"
            />
          </label>

          <label className="mt-4 flex flex-col gap-2">
            <span className="text-[0.62rem] font-medium uppercase tracking-[0.2em] text-white/46">
              What do you need help with?
            </span>
            <textarea
              rows={7}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Describe what you need from support. Be specific about the proposal, onboarding step, pricing question, or callback you want."
              className="rounded-[1rem] border border-white/12 bg-black/55 px-3 py-3 text-sm text-white outline-none transition placeholder:text-white/32 focus:border-white/28"
            />
          </label>

          {submitState === "success" ? (
            <div className="mt-4 flex items-start gap-3 rounded-[1rem] border border-emerald-400/24 bg-emerald-400/8 p-3 text-sm text-emerald-100">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <p>
                Your request has been logged on this onboarding profile for 1OS support to pick
                up.
              </p>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-4 rounded-[1rem] border border-rose-400/24 bg-rose-400/8 p-3 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/44">
              Dawn will keep tracking your workflow while support handles the request.
            </p>
            <button
              type="submit"
              disabled={submitState === "submitting"}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-black transition hover:bg-white/88 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <MessageSquareText className="size-3.5" />
              {submitState === "submitting" ? "Sending" : "Request Support"}
            </button>
          </div>
        </form>

        <aside className="rounded-[1.5rem] border border-white/10 bg-[rgba(8,8,8,0.78)] p-5">
          <p className="line-label">What happens next</p>
          <div className="mt-4 space-y-3">
            <div className="rounded-[1rem] border border-white/10 bg-black/30 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-white">
                <Mail className="size-4 text-white/74" />
                Logged against your client profile
              </p>
              <p className="mt-2 text-sm leading-6 text-white/58">
                The request is attached to {activeCase.business.name} so support has the exact client
                context when they respond.
              </p>
            </div>

            <div className="rounded-[1rem] border border-white/10 bg-black/30 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-white">
                <PhoneCall className="size-4 text-white/74" />
                Follow-up task created
              </p>
              <p className="mt-2 text-sm leading-6 text-white/58">
                A support follow-up task is created immediately so the request does not sit in
                chat without an owner.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

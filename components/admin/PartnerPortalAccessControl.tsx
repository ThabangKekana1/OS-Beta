"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { OrbitalBusyDot } from "@/components/FoundationMark";

/**
 * Opens the partner portal for an association Foundation-1 already holds. The
 * onboarding invite flow creates a new organisation, so it cannot be used here.
 */
export function PartnerPortalAccessControl({
  associationId,
  associationName,
}: {
  associationId: string;
  associationName: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ actionLink: string | null; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  async function grant() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/associations/${encodeURIComponent(associationId)}/portal-access`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; actionLink?: string | null; emailed?: boolean }
        | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? "Could not grant access.");
      setResult({ actionLink: payload.actionLink ?? null, emailed: Boolean(payload.emailed) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not grant access.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/16 px-2.5 text-[0.6rem] uppercase tracking-[0.12em] text-white/70 transition hover:bg-white/10"
      >
        <KeyRound className="size-3" /> Portal access
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-white/14 bg-white/[0.03] p-3">
      <p className="text-[0.6rem] uppercase tracking-[0.14em] text-white/45">
        Partner portal access · {associationName}
      </p>
      {result ? (
        <div className="space-y-2">
          <p className="text-[0.68rem] text-white/70">
            {result.emailed
              ? "Access granted and the sign-in email was sent."
              : "Access granted. Email is not configured, so send this link yourself."}
          </p>
          {result.actionLink ? (
            <>
              <p className="break-all rounded-md border border-white/12 bg-black/40 p-2 font-mono text-[0.6rem] text-white/70">
                {result.actionLink}
              </p>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(result.actionLink ?? "");
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                }}
                className="inline-flex h-7 items-center rounded-lg border border-white bg-white px-3 text-[0.6rem] uppercase tracking-[0.12em] text-black"
              >
                {copied ? "Copied" : "Copy sign-in link"}
              </button>
            </>
          ) : null}
        </div>
      ) : (
        <>
          <input
            value={email}
            onChange={(event) => { setError(""); setEmail(event.target.value); }}
            placeholder="partner contact email"
            className="h-8 w-full rounded-lg border border-white/14 bg-white/[0.04] px-3 text-[0.7rem] text-white placeholder:text-white/25"
          />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="contact name (optional)"
            className="h-8 w-full rounded-lg border border-white/14 bg-white/[0.04] px-3 text-[0.7rem] text-white placeholder:text-white/25"
          />
          {error ? <p className="text-[0.65rem] text-rose-200" role="alert">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void grant()}
              disabled={busy || !email}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white bg-white px-3 text-[0.6rem] uppercase tracking-[0.12em] text-black disabled:opacity-40"
            >
              {busy ? <OrbitalBusyDot /> : null} Grant access
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-7 items-center rounded-lg border border-white/16 px-3 text-[0.6rem] uppercase tracking-[0.12em] text-white/60"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

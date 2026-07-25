"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ExternalLink,
  FileKey2,
  Mail,
  ShieldCheck,
} from "lucide-react";
import {
  UFMS_DIRECT_KYC_ITEMS,
  UFMS_KYC_RECIPIENT_DISPLAY,
  ufmsDirectKycMailto,
} from "@/lib/ufms-direct-kyc";

type DirectUfmsKycHandoffProps = {
  profileId: string;
  accessCode: string;
  businessName: string;
  signedProposalReceived: boolean;
  confirmedAt?: string | null;
  confirmedBy?: string | null;
  onConfirmed?: () => void;
};

function dateLabel(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-ZA", { dateStyle: "long", timeStyle: "short" }).format(parsed);
}

export function DirectUfmsKycHandoff({
  profileId,
  accessCode,
  businessName,
  signedProposalReceived,
  confirmedAt,
  confirmedBy,
  onConfirmed,
}: DirectUfmsKycHandoffProps) {
  const [items, setItems] = useState<Record<string, boolean>>({});
  const [senderName, setSenderName] = useState("");
  const [sentDirectly, setSentDirectly] = useState(false);
  const [recipientOnly, setRecipientOnly] = useState(false);
  const [noFoundationCopy, setNoFoundationCopy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const mailto = useMemo(
    () => ufmsDirectKycMailto({ companyName: businessName, caseReference: profileId }),
    [businessName, profileId],
  );
  const allItemsReady = UFMS_DIRECT_KYC_ITEMS.every((item) => items[item.id]);
  const canConfirm =
    signedProposalReceived
    && allItemsReady
    && senderName.trim().length >= 2
    && sentDirectly
    && recipientOnly
    && noFoundationCopy;

  async function confirmSubmission() {
    if (!canConfirm) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/migration/kyc-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          accessCode,
          senderName: senderName.trim(),
          sentDirectlyConfirmed: true,
          recipientOnlyConfirmed: true,
          allItemsAttachedConfirmed: true,
          noFoundationOneCopyConfirmed: true,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "Unable to record the direct submission.");
        return;
      }
      onConfirmed?.();
    } catch {
      setError("Unable to reach the confirmation service. Your email is unaffected; retry the confirmation.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="ufms-direct-kyc" className="rounded-[8px] border border-white/[0.12] bg-[#050505] p-5 shadow-[0_30px_100px_rgba(0,0,0,.28)] md:p-7">
      <header className="flex items-start justify-between gap-5">
        <div>
          <p className="font-mono text-[0.58rem] uppercase tracking-[0.19em] text-violet-200/60">Bank KYC handoff · strict boundary</p>
          <h2 className="mt-3 text-2xl font-medium tracking-[-0.045em] text-white">
            Send the bank pack directly to UFMS.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">
            Strict POPIA boundary: these six files must be attached in your own email and sent only to {UFMS_KYC_RECIPIENT_DISPLAY}. Do not upload them to Foundation-1, copy Foundation-1, or include anyone else on the email.
          </p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-[6px] border border-violet-200/30 bg-violet-200 text-black">
          <ShieldCheck className="size-5" />
        </span>
      </header>

      {!signedProposalReceived ? (
        <div className="mt-5 rounded-[6px] border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-white/58">
          This handoff unlocks after the formal UFMS proposal has been signed and returned. No bank KYC is requested before then.
        </div>
      ) : confirmedAt ? (
        <div className="mt-5 rounded-[6px] border border-violet-200/20 bg-violet-200/[0.055] p-5">
          <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-[5px] bg-violet-200 text-black"><Check className="size-4" /></span>
            <div>
              <p className="font-medium text-white">Direct transmission recorded.</p>
              <p className="mt-1 text-sm leading-6 text-white/58">
                {confirmedBy ?? "The authorised sender"} confirmed submission to {UFMS_KYC_RECIPIENT_DISPLAY}
                {dateLabel(confirmedAt) ? ` on ${dateLabel(confirmedAt)}` : ""}. Foundation-1 retained only this confirmation—not the files or filenames—and can now follow up on receipt.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-2">
            {UFMS_DIRECT_KYC_ITEMS.map((item, index) => (
              <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-[6px] border border-white/10 bg-white/[0.025] p-4 transition hover:border-violet-200/30">
                <input
                  type="checkbox"
                  checked={Boolean(items[item.id])}
                  onChange={(event) => setItems((current) => ({ ...current, [item.id]: event.target.checked }))}
                  className="mt-1 size-4 accent-white"
                />
                <span className="grid size-6 shrink-0 place-items-center rounded-md border border-white/12 text-[0.62rem] text-white/52">{index + 1}</span>
                <span>
                  <span className="block text-sm font-medium text-white/90">{item.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-white/45">{item.detail}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-5 rounded-[6px] border border-white/12 bg-white/[0.035] p-4">
            <div className="flex items-start gap-3">
              <FileKey2 className="mt-0.5 size-4 shrink-0 text-white/70" />
              <p className="text-xs leading-5 text-white/52">
                Foundation-1 does not receive, proxy, inspect, store, hash, or list these files. The button below opens a pre-addressed email in your own mail application; attach all six items there.
              </p>
            </div>
            <a
              href={mailto}
              className={`mt-4 inline-flex h-10 items-center gap-2 rounded-[6px] border px-4 text-xs font-medium transition ${allItemsReady ? "border-white bg-white text-black hover:bg-white/88" : "pointer-events-none border-white/10 bg-white/5 text-white/30"}`}
              aria-disabled={!allItemsReady}
            >
              <Mail className="size-4" /> Open email to {UFMS_KYC_RECIPIENT_DISPLAY}
              <ExternalLink className="size-3.5" />
            </a>
          </div>

          <div className="mt-5 grid gap-3 rounded-[6px] border border-white/10 p-4">
            <label className="grid gap-2 text-sm text-white/68">
              Name of the person who sent the email
              <input
                value={senderName}
                onChange={(event) => setSenderName(event.target.value)}
                placeholder="Full name"
                className="h-10 rounded-[6px] border border-white/14 bg-black px-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-violet-200/45"
              />
            </label>
            {[
              [sentDirectly, setSentDirectly, `I sent the six-item pack directly from our email account to ${UFMS_KYC_RECIPIENT_DISPLAY}.`],
              [recipientOnly, setRecipientOnly, `${UFMS_KYC_RECIPIENT_DISPLAY} was the only recipient (no CC or BCC).`],
              [noFoundationCopy, setNoFoundationCopy, "I did not send or copy the documents to Foundation-1, Green Share, or any other person."],
            ].map(([checked, setter, label]) => (
              <label key={String(label)} className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-white/58">
                <input
                  type="checkbox"
                  checked={Boolean(checked)}
                  onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)}
                  className="mt-1 size-4 accent-white"
                />
                <span>{String(label)}</span>
              </label>
            ))}
            {error ? <p role="alert" className="text-xs text-rose-200">{error}</p> : null}
            <button
              type="button"
              onClick={() => void confirmSubmission()}
              disabled={!canConfirm || submitting}
              className="mt-1 inline-flex h-10 items-center justify-center rounded-[6px] border border-white bg-white px-4 text-xs font-medium text-black transition hover:bg-white/88 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/30"
            >
              {submitting ? "Recording confirmation…" : "I sent the pack directly — notify Foundation-1"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

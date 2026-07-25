"use client";

import { useState } from "react";

type MandateLeadView = {
  clientProfileId: string;
  company: string;
  businessRegistrationNumber: string;
  contactName: string;
  stage: string;
  proposalAcceptedAt: string | null;
  mandateSignedBy: string | null;
  mandateSignedAt: string | null;
  isSigned: boolean;
};

type MandateSigningFormProps = {
  token: string;
  initialLead: MandateLeadView;
};

function signedAtLabel(value: string | null) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

const MANDATE_POINTS = [
  "Foundation-1 (Pty) Ltd is authorised to coordinate your migration case, utility analysis, proposal process and status follow-up.",
  "Foundation-1 may share only the non-KYC migration documents you have authorised for the relevant formal proposal process.",
  "After the formal UFMS proposal is signed, you send the bank KYC pack directly to info@UFMS.net. Foundation-1 does not receive or store those files.",
  "This mandate is not a purchase, credit, or installation agreement. Any funded solution is only binding once you sign the funder's own agreement.",
  "You may withdraw this mandate in writing at any time before you sign a funding agreement.",
];

export function MandateSigningForm({ token, initialLead }: MandateSigningFormProps) {
  const [lead, setLead] = useState(initialLead);
  const [fullName, setFullName] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedAt = signedAtLabel(lead.mandateSignedAt);

  const submitMandate = async () => {
    setError(null);

    if (fullName.trim().length < 2) {
      setError("Enter your full name as the authorised signatory.");
      return;
    }
    if (!consent) {
      setError("Tick the consent box to sign the mandate.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/mandate/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim(), consent }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        lead?: MandateLeadView;
      } | null;

      if (!response.ok || !payload?.ok || !payload.lead) {
        setError(payload?.error ?? "Unable to record the mandate signature. Please try again.");
        return;
      }

      setLead(payload.lead);
    } catch {
      setError("Unable to reach the mandate service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-3xl">
      <section className="rounded-[1.4rem] border border-white/12 bg-white/[0.04] px-5 py-5 sm:px-7 sm:py-6">
        <p className="text-[0.66rem] uppercase tracking-[0.26em] text-white/46">
          Foundation-1 Mandate
        </p>
        <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em] text-white">
          Mandate for {lead.company}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/68">
          Your Migration Proposal is accepted. This mandate authorises Foundation-1 (Pty) Ltd to
          prepare and submit your client file to funder partners so your funded energy solution can
          be arranged. Bank KYC remains a direct client-to-UFMS transmission.
        </p>

        <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-white/46">Business</span>
            <strong className="text-white/86">{lead.company}</strong>
          </div>
          {lead.businessRegistrationNumber ? (
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-white/46">Registration number</span>
              <strong className="text-white/86">{lead.businessRegistrationNumber}</strong>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-white/46">Registered contact</span>
            <strong className="text-white/86">{lead.contactName}</strong>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
          <p className="text-[0.62rem] uppercase tracking-[0.2em] text-white/42">
            What this mandate authorises
          </p>
          <ul className="mt-2 grid gap-2 text-sm leading-6 text-white/70">
            {MANDATE_POINTS.map((point) => (
              <li key={point} className="flex gap-2">
                <span aria-hidden="true" className="text-white/40">
                  •
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {lead.isSigned ? (
          <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100/78">
            <p className="font-medium text-emerald-100">Mandate signed.</p>
            <p className="mt-1">
              Signed by {lead.mandateSignedBy ?? "the authorised signatory"}
              {signedAt ? ` on ${signedAt}` : ""}. Foundation-1 will countersign and open your KYC
              handoff instructions after the formal UFMS proposal is issued and signed.
            </p>
          </div>
        ) : (
          <form
            className="mt-5 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitMandate();
            }}
          >
            <label className="grid gap-2 text-sm text-white/70">
              Full name of authorised signatory
              <input
                type="text"
                value={fullName}
                autoComplete="name"
                placeholder={lead.contactName || "Full name"}
                onChange={(event) => {
                  setError(null);
                  setFullName(event.target.value);
                }}
                className="rounded-xl border border-white/14 bg-black/40 px-4 py-2.5 text-sm text-white placeholder:text-white/32 focus:border-white/34 focus:outline-none"
              />
            </label>
            <label className="flex items-start gap-3 text-sm leading-6 text-white/70">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => {
                  setError(null);
                  setConsent(event.target.checked);
                }}
                className="mt-1 h-4 w-4 accent-white"
              />
              <span>
                I am authorised to act for {lead.company} and I mandate Foundation-1 (Pty) Ltd to
                coordinate our migration file as described above, excluding custody of our bank KYC documents.
              </span>
            </label>

            {error ? (
              <p
                className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <div>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl border border-white/18 bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-60"
              >
                {submitting ? "Signing…" : "Sign Mandate"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

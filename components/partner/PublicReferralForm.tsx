"use client";

import { useState } from "react";

export function PublicReferralForm({ partnerOrgId }: { partnerOrgId: string }) {
  const [contactName, setContactName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/refer/${encodeURIComponent(partnerOrgId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contactName: contactName.trim(),
            company: company.trim(),
            email: email.trim().toLowerCase(),
          }),
        },
      );
      const json = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !json.ok) {
        setError(json.error ?? "Could not submit. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-[1.4rem] border border-emerald-400/30 bg-emerald-400/5 p-6 text-center">
        <h2 className="text-lg font-medium text-white">Thanks — we'll be in touch.</h2>
        <p className="mt-2 text-sm leading-6 text-white/65">
          The 1OS team will reach out within one business day.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-[1.4rem] border border-white/10 bg-white/[0.02] p-6"
    >
      <Field
        label="Your name"
        value={contactName}
        onChange={setContactName}
        placeholder="Jane Mokoena"
        autoComplete="name"
        required
      />
      <Field
        label="Company"
        value={company}
        onChange={setCompany}
        placeholder="Acme Logistics"
        autoComplete="organization"
        required
      />
      <Field
        label="Work email"
        value={email}
        onChange={setEmail}
        placeholder="jane@acme.co.za"
        type="email"
        autoComplete="email"
        required
      />

      {error ? (
        <div className="rounded-[0.9rem] border border-rose-400/30 bg-rose-400/5 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-full border border-white/20 bg-white/[0.08] px-5 py-2.5 text-sm text-white transition hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Submitting..." : "Request a callback"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.65rem] uppercase tracking-[0.22em] text-white/55">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="rounded-[0.9rem] border border-white/12 bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none"
      />
    </label>
  );
}

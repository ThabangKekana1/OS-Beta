"use client";

import { useState } from "react";
import { Check, FileUp } from "lucide-react";
import { OrbitalBusyDot } from "@/components/FoundationMark";

type PartnerProposalIssueControlProps = {
  caseId: string;
  eoiSigned: boolean;
  status?: "issued" | "signed" | "direct_kyc_confirmed" | null;
  issuedAt?: string | null;
  signedAt?: string | null;
  confirmedAt?: string | null;
};

function date(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

export function PartnerProposalIssueControl({
  caseId,
  eoiSigned,
  status,
  issuedAt,
  signedAt,
  confirmedAt,
}: PartnerProposalIssueControlProps) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function issue() {
    if (!file || !eoiSigned) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("file", file, file.name);
    try {
      const response = await fetch(`/api/admin/migration-cases/${encodeURIComponent(caseId)}/partner-proposal`, {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "Unable to issue the formal proposal.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Unable to reach the proposal service.");
    } finally {
      setBusy(false);
    }
  }

  if (status) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
        <p className="flex items-center gap-2 text-[0.66rem] font-medium uppercase tracking-[0.14em] text-white/70">
          <Check className="size-3.5" /> {status === "direct_kyc_confirmed" ? "KYC sent direct" : status === "signed" ? "Formal proposal signed" : "Formal proposal issued"}
        </p>
        <p className="mt-2 text-[0.68rem] leading-5 text-white/36">
          {confirmedAt
            ? `Client confirmed direct-to-UFMS transmission ${date(confirmedAt)}.`
            : signedAt
              ? `Signed copy received ${date(signedAt)}.`
              : `Issued ${date(issuedAt)}.`}
        </p>
        {confirmedAt ? <p className="mt-2 text-[0.66rem] leading-5 text-emerald-200/62">Follow up with UFMS on receipt. No bank KYC is held by Foundation-1.</p> : null}
      </div>
    );
  }

  if (!eoiSigned) {
    return <p className="text-[0.68rem] leading-5 text-white/30">Formal proposal issue unlocks after the post-assessment EOI.</p>;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
      <label className="block text-[0.62rem] uppercase tracking-[0.14em] text-white/42">
        Issued UFMS proposal PDF
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={(event) => { setError(""); setFile(event.target.files?.[0] ?? null); }}
          className="mt-2 block max-w-full text-[0.68rem] text-white/48 file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-2 file:py-1 file:text-[0.62rem] file:text-black"
        />
      </label>
      <button
        type="button"
        onClick={() => void issue()}
        disabled={!file || busy}
        className="mt-3 inline-flex h-8 items-center gap-2 rounded-lg border border-white bg-white px-3 text-[0.62rem] font-medium uppercase tracking-[0.13em] text-black transition hover:bg-white/88 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/25"
      >
        {busy ? <OrbitalBusyDot /> : <FileUp className="size-3.5" />}
        {busy ? "Issuing" : "Issue to client"}
      </button>
      {error ? <p className="mt-2 text-[0.68rem] text-rose-200" role="alert">{error}</p> : null}
    </div>
  );
}

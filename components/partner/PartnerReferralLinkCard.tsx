"use client";

import { useState } from "react";

export function PartnerReferralLinkCard({ partnerOrgId }: { partnerOrgId: string }) {
  const [copied, setCopied] = useState(false);

  // Build absolute URL on the client to use the actual deployed origin.
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/refer/${encodeURIComponent(partnerOrgId)}`
      : `/refer/${encodeURIComponent(partnerOrgId)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[1.6rem] border border-white/10 bg-white/[0.02] p-6">
      <div>
        <h2 className="text-base font-medium text-white">Your referral link</h2>
        <p className="mt-1 text-xs text-white/55">
          Share this link with prospects. Submissions are auto-credited to your
          organisation.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          className="flex-1 rounded-[0.9rem] border border-white/12 bg-white/[0.03] px-4 py-2.5 text-xs text-white/80 focus:border-white/30 focus:outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="rounded-full border border-white/20 bg-white/[0.08] px-4 py-2 text-xs text-white transition hover:bg-white/[0.14]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

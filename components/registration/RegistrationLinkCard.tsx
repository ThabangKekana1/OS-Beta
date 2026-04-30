"use client";

import { useState } from "react";
import { registrationLinkIdForProfile, registrationLinkPath } from "@/lib/registration-links";
import type { RegistrationSourceRole } from "@/lib/admin-types";

type RegistrationLinkCardProps = {
  email: string;
  role: RegistrationSourceRole;
  agentId: string | null;
};

export function RegistrationLinkCard({
  email,
  role,
  agentId,
}: RegistrationLinkCardProps) {
  const [origin] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin,
  );
  const [copied, setCopied] = useState(false);
  const linkId = registrationLinkIdForProfile({ email, role, agentId });
  const path = registrationLinkPath(linkId);
  const url = origin ? `${origin}${path}` : path;

  const copyLink = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="app-surface rounded-[1.4rem] p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="line-label">Your Client Registration Link</p>
          <p className="mt-2 text-sm text-white/60">
            Clients who register through this link are recorded against this internal profile.
          </p>
          <p className="mt-3 break-all rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white/78">
            {url}
          </p>
        </div>
        <button
          type="button"
          onClick={copyLink}
          className="rounded-[0.8rem] border border-white/14 px-3 py-2 text-xs uppercase tracking-[0.2em] text-white/72 transition hover:border-white/26 hover:text-white"
        >
          {copied ? "Copied" : "Copy Link"}
        </button>
      </div>
    </section>
  );
}

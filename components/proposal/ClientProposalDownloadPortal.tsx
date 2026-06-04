"use client";

import { useState } from "react";

type ProposalDocument = {
  id: string;
  title: string;
  fileName: string | null;
  uploadedAt: string;
};

type ProposalLeadView = {
  clientProfileId: string;
  company: string;
  contactName: string;
  proposalCount: number;
};

type ClientProposalDownloadPortalProps = {
  token: string;
  initialLead: ProposalLeadView;
  initialDocuments: ProposalDocument[];
};

const NDA_TERMS = [
  "The proposal, pricing, savings models, financing structure, site assumptions, supplier information, implementation methods, and related communication are confidential to Foundation-1.",
  "The proposal may be used only to evaluate a potential transaction with Foundation-1 and may be shared only with directors, employees, financiers, legal advisors, tax advisors, or professional consultants who need it for that purpose.",
  "The proposal may not be disclosed, published, copied, forwarded, uploaded, distributed, or made available to any third party except as permitted above without Foundation-1's prior written approval.",
  "For 24 months from acceptance, the client may not bypass Foundation-1 to deal directly or indirectly with any financier, installer, EPC contractor, supplier, energy partner, property owner, site owner, developer, or other commercial counterparty introduced by Foundation-1 for a substantially similar solar, energy-as-a-service, financing, infrastructure, or electricity supply transaction.",
  "The non-circumvention obligation does not apply where the client can prove an active, documented relationship with the relevant party before Foundation-1 introduced or disclosed that party.",
];

export function ClientProposalDownloadPortal({
  token,
  initialLead,
  initialDocuments,
}: ClientProposalDownloadPortalProps) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState(initialLead.company);
  const [accepted, setAccepted] = useState(false);
  const [acceptanceId, setAcceptanceId] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAccept = name.trim().length > 1 && company.trim().length > 1;

  async function acceptNda() {
    if (!canAccept) {
      setError("Enter the authorised representative and company name before accepting.");
      return;
    }

    setIsAccepting(true);
    setError(null);
    try {
      const response = await fetch(`/api/proposal/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          company: company.trim(),
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        acceptanceId?: string;
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.acceptanceId) {
        setError(payload.error ?? "Unable to record NDA acceptance.");
        return;
      }

      setAcceptanceId(payload.acceptanceId);
      setAccepted(true);
    } catch {
      setError("Unable to reach the proposal service. Please try again.");
    } finally {
      setIsAccepting(false);
    }
  }

  return (
    <section className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      <header className="border-b border-white/8 px-6 py-5">
        <p className="text-[0.58rem] uppercase tracking-[0.3em] text-lime-200/58">
          Foundation-1 proposal download
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-white">
          {initialLead.company}
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/52">
          Profile {initialLead.clientProfileId}. Proposal files are released only after accepting
          the non-disclosure agreement below.
        </p>
      </header>

      <div className="grid gap-5 p-6 md:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-xl border border-white/10 bg-black/24 p-4">
          <p className="text-[0.58rem] uppercase tracking-[0.22em] text-white/38">
            Non-disclosure agreement
          </p>
          <div className="mt-4 space-y-3 text-xs leading-5 text-white/56">
            {NDA_TERMS.map((term, index) => (
              <p key={term}>
                <span className="text-lime-200/62">{index + 1}.</span> {term}
              </p>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/24 p-4">
          {accepted ? (
            <>
              <p className="text-[0.58rem] uppercase tracking-[0.22em] text-lime-200/62">
                NDA accepted
              </p>
              <h2 className="mt-3 text-xl font-semibold tracking-[-0.025em] text-white">
                Proposal files unlocked.
              </h2>
              {initialDocuments.length === 0 ? (
                <p className="mt-3 text-sm leading-6 text-white/54">
                  No proposal has been uploaded to this client profile yet. Keep this link and
                  return once Foundation-1 has issued the proposal.
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {initialDocuments.map((document) => (
                    <li
                      key={document.id}
                      className="rounded-lg border border-white/10 bg-white/[0.035] p-3"
                    >
                      <p className="text-sm font-medium text-white">{document.title}</p>
                      <p className="mt-1 text-xs text-white/38">
                        {document.fileName ?? "Proposal file"} • {document.uploadedAt}
                      </p>
                      <a
                        href={`/api/proposal/${encodeURIComponent(token)}/documents/${encodeURIComponent(document.id)}?acceptance=${encodeURIComponent(acceptanceId ?? "")}`}
                        className="mt-3 inline-flex rounded-full border border-lime-200/70 bg-lime-200 px-4 py-2 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-black transition hover:bg-white"
                      >
                        Download Proposal
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p className="text-[0.58rem] uppercase tracking-[0.22em] text-white/38">
                Acceptance required
              </p>
              <label className="mt-4 block">
                <span className="text-[0.58rem] uppercase tracking-[0.2em] text-white/34">
                  Authorised representative
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Full name"
                  className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none placeholder:text-white/24"
                />
              </label>
              <label className="mt-4 block">
                <span className="text-[0.58rem] uppercase tracking-[0.2em] text-white/34">
                  Client company
                </span>
                <input
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="Company name"
                  className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none placeholder:text-white/24"
                />
              </label>
              {error ? <p className="mt-3 text-sm text-rose-200/82">{error}</p> : null}
              <button
                type="button"
                onClick={acceptNda}
                disabled={!canAccept || isAccepting}
                className="mt-5 inline-flex rounded-full border border-lime-200/70 bg-lime-200 px-5 py-2.5 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-black transition hover:bg-white disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-white/34"
              >
                {isAccepting ? "Recording acceptance" : "Accept NDA and view proposal"}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import type { EoiTemplateLead } from "@/lib/eoi-template";

type EoiLeadView = EoiTemplateLead & {
  stage: string;
  eoiSignedBy: string | null;
  eoiSignedAt: string | null;
  isSigned: boolean;
};

type EoiSigningFormProps = {
  token: string;
  initialLead: EoiLeadView;
};

function signedAtLabel(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function EoiDocument({ lead }: { lead: EoiLeadView }) {
  const signer = lead.eoiSignedBy ?? lead.contactName;
  const approvedAt = signedAtLabel(lead.eoiSignedAt);

  return (
    <article className="mx-auto aspect-[210/297] w-full max-w-[210mm] overflow-hidden bg-white px-7 py-10 text-black shadow-[0_30px_120px_rgba(0,0,0,0.48)] sm:px-[24mm] sm:py-[24mm]">
      <div className="flex h-full flex-col">
        <h1 className="text-[clamp(1rem,2.3vw,1.55rem)] font-bold uppercase leading-tight">
          Expression of Interest: Renewable Energy Supply
        </h1>

        <p className="mt-[9%] text-[clamp(0.86rem,1.65vw,1.18rem)] leading-8">
          <strong>To Whom It May Concern:</strong> Green Share VPP
        </p>

        <p className="mt-[6%] text-[clamp(0.86rem,1.65vw,1.18rem)] leading-8">
          <em>{lead.company}</em> has been approached by Green Share VPP, to supply Renewable Energy to{" "}
          <em>{lead.company}</em> sites for operation of its facilities.
        </p>

        <p className="mt-[5%] text-[clamp(0.86rem,1.65vw,1.18rem)] leading-8">
          Subject to the receipt of the relevant approvals, we hereby confirm our interest to procure
          renewable energy from Green Share VPP and would like to enter into an information sharing
          and terms formulation period with the intent of reaching commercial and technical alignment.
          We hereby request you to commence your engagement with the relevant stakeholder in order to
          procure the approvals required to make the said terms available.
        </p>

        <p className="mt-[5%] text-[clamp(0.86rem,1.65vw,1.18rem)] leading-8">
          Should we reach commercial and technical alignment, <em>{lead.company}</em> would want to
          explore entering into a comprehensive Zero-Capex Solar agreement.
        </p>

        <p className="mt-[5%] text-[clamp(0.86rem,1.65vw,1.18rem)] leading-8">
          This letter is a non-binding expression of interest, and remains subject to a contract
          between the parties. There is no intention that the content of this letter shall create
          legal relations between <em>{lead.company}</em> and Green Share VPP.
        </p>

        <div className="mt-auto space-y-2 pt-8 text-[clamp(0.82rem,1.45vw,1.02rem)] leading-6">
          <p>Kind Regards,</p>
          <div className="pt-4">
            <p>{signer}</p>
            <p>{lead.userProfile.role}</p>
            <p>{lead.company}</p>
            <p>{lead.businessRegistrationNumber}</p>
            <p>1OS Profile Number: {lead.clientProfileId}</p>
          </div>
        </div>

        <div className="mt-8 border-t border-black/18 pt-4 text-[clamp(0.72rem,1.25vw,0.88rem)] leading-6">
          <p>
            <strong>Digital approval:</strong>{" "}
            {lead.isSigned ? `Approved by ${signer}${approvedAt ? ` on ${approvedAt}` : ""}.` : "Pending client approval."}
          </p>
        </div>
      </div>
    </article>
  );
}

export function EoiSigningForm({ token, initialLead }: EoiSigningFormProps) {
  const [lead, setLead] = useState(initialLead);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const signedAt = signedAtLabel(lead.eoiSignedAt);

  const submit = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/eoi/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signedBy: lead.contactName,
          acceptedTerms: approved,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        lead?: EoiLeadView;
      };

      if (!response.ok || !payload.ok || !payload.lead) {
        setError(payload.error ?? "Unable to submit approval.");
        return;
      }

      setLead(payload.lead);
      setApproved(false);
    } catch {
      setError("Unable to reach the approval service. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (lead.isSigned) {
    return (
      <div className="w-full max-w-5xl">
        <section className="mb-5 rounded-[1.4rem] border border-emerald-400/25 bg-emerald-400/10 px-5 py-4 text-center">
          <p className="text-[0.66rem] uppercase tracking-[0.26em] text-emerald-100/72">
            Expression of Interest
          </p>
          <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em] text-white">
            EOI approved
          </h1>
          <p className="mt-3 text-sm leading-7 text-white/68">
            Signed Expression of Interest is saved to the client profile documents.
          </p>
          <p className="mt-2 text-sm text-white/62">
            Approved by {lead.eoiSignedBy ?? lead.contactName}
            {signedAt ? ` on ${signedAt}` : ""}
          </p>
        </section>
        <EoiDocument lead={lead} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl">
      <section className="mb-5 rounded-[1.4rem] border border-white/12 bg-white/[0.04] px-5 py-4">
        <p className="text-[0.66rem] uppercase tracking-[0.26em] text-white/46">
          Expression of Interest
        </p>
        <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em] text-white">
          Review EOI for {lead.company}
        </h1>
        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
          <label className="flex items-start gap-3 text-sm leading-6 text-white/72">
            <input
              type="checkbox"
              checked={approved}
              onChange={(event) => setApproved(event.target.checked)}
              className="mt-1"
            />
            <span>Approve Expression of Interest</span>
          </label>

          {error ? (
            <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={submit}
            disabled={isSubmitting || !approved}
            className="mt-4 w-full rounded-xl border border-white/18 bg-white px-3 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      </section>

      <EoiDocument lead={lead} />
    </div>
  );
}

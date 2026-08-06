"use client";

import { useMemo, useState } from "react";
import type {
  PartnerMemberSummary,
  PartnerMissionMetrics,
  PartnerPipelineStage,
} from "@/lib/partner-distribution/types";

type Props = {
  organisationName: string;
  referralCode: string;
  campaignUrl: string;
  members: PartnerMemberSummary[];
  metrics: PartnerMissionMetrics;
};

const STAGE_LABEL: Record<PartnerPipelineStage, string> = {
  invited: "Invited",
  registered: "Registered",
  waiting_for_utility_bills: "Utility bills",
  bills_under_review: "Bills under review",
  proposal_being_prepared: "Proposal in progress",
  proposal_ready: "Proposal ready",
  awaiting_decision: "Awaiting decision",
  kyc: "KYC",
  funding: "Bank submission",
  term_sheet: "Term sheet",
  migration: "Migration",
  completed: "Completed",
};

// The order a member actually travels, used for the funnel and grouping.
const STAGE_ORDER: PartnerPipelineStage[] = [
  "invited",
  "registered",
  "waiting_for_utility_bills",
  "bills_under_review",
  "proposal_being_prepared",
  "proposal_ready",
  "awaiting_decision",
  "kyc",
  "funding",
  "term_sheet",
  "migration",
  "completed",
];

function money(value: number) {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

function day(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString("en-ZA", { dateStyle: "medium" })
    : "Not yet";
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="border-l border-white/10 px-5 py-4 first:border-l-0 first:pl-0">
      <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-white/32">{label}</p>
      <p className="mt-2 text-[22px] font-medium tracking-[-0.04em]">{value}</p>
      {detail ? <p className="mt-1 text-[10px] text-white/35">{detail}</p> : null}
    </div>
  );
}

export default function PartnerDashboard({
  organisationName,
  referralCode,
  campaignUrl,
  members,
  metrics,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<PartnerPipelineStage | "all">("all");

  const counts = useMemo(() => {
    const map = new Map<PartnerPipelineStage, number>();
    for (const member of members) {
      map.set(member.currentStage, (map.get(member.currentStage) ?? 0) + 1);
    }
    return map;
  }, [members]);

  const visible = useMemo(
    () => (filter === "all" ? members : members.filter((m) => m.currentStage === filter)),
    [members, filter],
  );

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(campaignUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[9px] border border-white/12 bg-[#0c0c0c] p-5 md:p-6">
        <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-white/32">Your member link</p>
        <p className="mt-2 break-all font-mono text-[13px] text-white/85">{campaignUrl}</p>
        <p className="mt-2.5 max-w-2xl text-[11px] leading-5 text-white/40">
          Works in WhatsApp broadcasts, newsletters and SMS. Every member who starts an
          assessment through it is attributed to {organisationName} automatically.
        </p>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="mt-4 inline-flex h-9 items-center rounded-[6px] bg-white px-4 text-[11px] font-medium text-black transition hover:bg-zinc-200"
        >
          {copied ? "Copied" : "Copy member link"}
        </button>
      </section>

      <section>
        <div className="grid border-y border-white/10 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Members referred" value={String(metrics.businessesInvited)} />
          <Metric
            label="Signed up"
            value={String(metrics.businessesRegistered)}
            detail={`${metrics.utilityBillsUploaded} sent utility bills`}
          />
          <Metric
            label="Qualified"
            value={String(metrics.qualifiedMigrationCases)}
            detail={`${metrics.migrationProposals} proposals completed`}
          />
          <Metric
            label="Member savings"
            value={metrics.estimatedMonthlyMemberSavingsRands > 0
              ? `${money(metrics.estimatedMonthlyMemberSavingsRands)}/m`
              : "After bill audit"}
            detail="Modelled across qualified members"
          />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[20px] font-medium tracking-[-0.04em]">Member pipeline</h2>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`h-8 rounded-[6px] px-3 text-[11px] transition ${
                filter === "all" ? "bg-white text-black" : "border border-white/12 text-white/55 hover:text-white"
              }`}
            >
              All {members.length}
            </button>
            {STAGE_ORDER.filter((stage) => counts.get(stage)).map((stage) => (
              <button
                key={stage}
                type="button"
                onClick={() => setFilter(stage)}
                className={`h-8 rounded-[6px] px-3 text-[11px] transition ${
                  filter === stage ? "bg-white text-black" : "border border-white/12 text-white/55 hover:text-white"
                }`}
              >
                {STAGE_LABEL[stage]} {counts.get(stage)}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="mt-5 rounded-[9px] border border-white/12 bg-[#0c0c0c] p-8 text-center">
            <p className="text-[13px] text-white/70">
              {members.length === 0 ? "No members yet." : "No members at this stage."}
            </p>
            <p className="mx-auto mt-2 max-w-md text-[11px] leading-5 text-white/38">
              {members.length === 0
                ? "Share your member link to start the pipeline. The first assessment takes a member about a minute and needs no utility bill."
                : "Choose another stage to see the rest of your members."}
            </p>
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-[9px] border border-white/12">
            <div className="hidden grid-cols-[1.6fr_1fr_0.8fr_1.4fr] gap-4 border-b border-white/10 bg-white/[0.02] px-5 py-3 font-mono text-[8px] uppercase tracking-[0.15em] text-white/30 md:grid">
              <span>Member</span>
              <span>Stage</span>
              <span>Registered</span>
              <span>What is happening</span>
            </div>
            {visible.map((member) => (
              <div
                key={member.referralId}
                className="grid gap-2 border-b border-white/8 bg-[#0a0a0a] px-5 py-4 last:border-b-0 md:grid-cols-[1.6fr_1fr_0.8fr_1.4fr] md:items-center md:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-white/88">
                    {member.company ?? "Member"}
                  </p>
                  {member.proposalEconomicallyPositive === true ? (
                    <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.13em] text-white/45">
                      Qualified
                    </p>
                  ) : null}
                </div>
                <p className="text-[12px] text-white/70">{STAGE_LABEL[member.currentStage]}</p>
                <p className="font-mono text-[10px] text-white/38">{day(member.registeredAt)}</p>
                <p className="text-[11px] leading-5 text-white/45">{member.whatFoundationOneIsDoing}</p>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-[10px] leading-5 text-white/28">
          POPIA: this view shows member business names and pipeline stages only. Member
          documents, contact details and personal information stay inside Foundation-1&apos;s
          secure platform. Referral code {referralCode}.
        </p>
      </section>
    </div>
  );
}

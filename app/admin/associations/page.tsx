import type { Metadata } from "next";
import { AssociationRow, type AssociationRowData } from "@/components/admin/AssociationRow";
import {
  memberLinkForCode,
  type AssociationOutreachStage,
  type AssociationRecord,
} from "@/lib/association-outreach";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const metadata: Metadata = {
  title: "Associations | 1-MI Admin",
  description: "The association channel: secretariat outreach, member links and attributed cases.",
};

export const dynamic = "force-dynamic";

/** Stages that still need work, in the order they should be worked. */
const ACTIVE_STAGES: AssociationOutreachStage[] = [
  "in_conversation",
  "proposal_sent",
  "contacted",
  "researching",
  "not_started",
];

export default async function AdminAssociationsPage() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return <p className="text-sm text-white/50">Storage is unavailable.</p>;
  }

  const [{ data: associationRows }, { data: referralRows }] = await Promise.all([
    supabase
      .from("associations")
      .select("*")
      .order("priority_tier", { ascending: true, nullsFirst: false })
      .order("priority_score", { ascending: false, nullsFirst: false })
      .limit(200),
    supabase.from("association_referrals").select("association_id"),
  ]);

  const associations = (associationRows ?? []) as AssociationRecord[];
  const memberCounts = new Map<string, number>();
  for (const row of (referralRows ?? []) as { association_id: string }[]) {
    memberCounts.set(row.association_id, (memberCounts.get(row.association_id) ?? 0) + 1);
  }

  const rows: AssociationRowData[] = associations.map((item) => ({
    id: item.id,
    name: item.name,
    sector: item.sector,
    referralCode: item.referral_code,
    memberLink: memberLinkForCode(item.referral_code),
    website: item.website,
    memberBase: item.member_base,
    productFit: item.product_fit,
    recommendedAction: item.recommended_action,
    priorityTier: item.priority_tier,
    priorityScore: item.priority_score,
    stage: item.outreach_stage,
    contactName: item.contact_name,
    contactRole: item.contact_role,
    contactEmail: item.contact_email,
    lastContactedAt: item.last_contacted_at,
    commissionValue: Number(item.commission_value ?? 0),
    memberCount: memberCounts.get(item.id) ?? 0,
  }));

  const live = rows.filter((row) => row.stage === "live" || row.stage === "agreed");
  const working = rows.filter((row) => ACTIVE_STAGES.includes(row.stage));
  const closed = rows.filter((row) => row.stage === "declined" || row.stage === "dormant");
  const contactable = rows.filter((row) => row.contactEmail).length;
  const attributedMembers = rows.reduce((sum, row) => sum + row.memberCount, 0);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <header className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.35)] md:p-8">
        <p className="line-label">Association channel</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-3xl font-medium tracking-[-0.05em] text-white md:text-5xl">
              One introduction beats a thousand cold emails.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/48">
              Each body here gates hundreds of qualifying members. Work them in tier order, log every
              touch, and hand members a link that attributes their case back to the association that
              sent them.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              [String(rows.length), "Bodies"],
              [String(contactable), "With contact"],
              [String(live.length), "Live"],
              [String(attributedMembers), "Members"],
            ].map(([value, label]) => (
              <div key={label} className="min-w-24 rounded-[1rem] border border-white/10 bg-black/25 p-4 text-center">
                <strong className="block text-xl font-medium text-white md:text-2xl">{value}</strong>
                <span className="mt-1 block text-[0.58rem] uppercase tracking-[0.2em] text-white/34">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {contactable === 0 ? (
        <section className="rounded-[2rem] border border-amber-300/20 bg-amber-300/[0.04] p-5 md:p-6">
          <p className="text-[0.62rem] uppercase tracking-[0.2em] text-amber-100/70">Before you can send</p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
            No secretariat contacts are on record yet. Open a body below, add the member-services
            contact and their email, then send the approach. The websites are on each record.
          </p>
        </section>
      ) : null}

      {live.length ? (
        <section className="space-y-3">
          <p className="text-[0.62rem] uppercase tracking-[0.2em] text-white/34">Live and agreed</p>
          <div className="grid gap-3">
            {live.map((row) => <AssociationRow key={row.id} data={row} />)}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <p className="text-[0.62rem] uppercase tracking-[0.2em] text-white/34">
          Worklist · priority order
        </p>
        <div className="grid gap-3">
          {working.map((row) => <AssociationRow key={row.id} data={row} />)}
        </div>
      </section>

      {closed.length ? (
        <section className="space-y-3">
          <p className="text-[0.62rem] uppercase tracking-[0.2em] text-white/34">Closed and dormant</p>
          <div className="grid gap-3">
            {closed.map((row) => <AssociationRow key={row.id} data={row} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

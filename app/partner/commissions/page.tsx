import { requireServerAuthSession } from "@/lib/auth-server";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";

const ZAR = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
});

export default async function PartnerCommissionsPage() {
  const session = await requireServerAuthSession("partner");

  if (!session.partnerOrgId) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <div className="rounded-[1.6rem] border border-amber-400/30 bg-amber-400/5 p-6">
          <h1 className="text-lg font-medium tracking-[-0.02em] text-white">
            Account not linked
          </h1>
          <p className="mt-2 text-sm leading-6 text-white/58">
            Your partner account is not yet linked to a partner organisation.
          </p>
        </div>
      </div>
    );
  }

  const { snapshot } = await readAdminStateSnapshot();
  const partnerOrg = (snapshot.partnerOrgs ?? []).find(
    (entry) => entry.id === session.partnerOrgId,
  );
  const commissionPct = partnerOrg?.commissionPct ?? 0;

  // Source of truth for commissions: the AdminLead with our partnerOrgId.
  const myAdminLeads = snapshot.leads.filter(
    (lead) => lead.partnerOrgId === session.partnerOrgId,
  );

  type Row = {
    id: string;
    company: string;
    contactName: string;
    stage: string;
    dealValue: number;
    commission: number;
    earned: boolean;
  };

  const rows: Row[] = myAdminLeads.map((lead) => {
    const earned = lead.stage === "Onboarding Complete";
    const commission = Math.round((lead.estimatedValueZar * commissionPct) / 100);
    return {
      id: lead.id,
      company: lead.company,
      contactName: lead.contactName,
      stage: lead.stage,
      dealValue: lead.estimatedValueZar,
      commission,
      earned,
    };
  });

  const totalEarned = rows.filter((r) => r.earned).reduce((sum, r) => sum + r.commission, 0);
  const totalPipeline = rows.filter((r) => !r.earned).reduce((sum, r) => sum + r.commission, 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 py-6">
      <header>
        <p className="line-label">Partner</p>
        <h1 className="mt-1 text-2xl font-medium tracking-[-0.03em] text-white">
          Revenue
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/58">
          {partnerOrg ? (
            <>
              {partnerOrg.name} earns{" "}
              <span className="text-white">{commissionPct}%</span> of each completed
              onboarding.
            </>
          ) : (
            "Revenue rate not configured."
          )}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Earned" value={ZAR.format(totalEarned)} tone="emerald" />
        <StatCard label="In Pipeline" value={ZAR.format(totalPipeline)} tone="sky" />
        <StatCard label="Revenue Rate" value={`${commissionPct}%`} tone="white" />
      </section>

      <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.02]">
        <div className="border-b border-white/8 px-5 py-4">
          <h2 className="text-base font-medium text-white">Lead breakdown</h2>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-white/55">
            No qualified leads yet. Once a referred lead reaches{" "}
            <span className="text-white/80">Qualifies</span> it will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[0.65rem] uppercase tracking-[0.2em] text-white/45">
                <tr>
                  <th className="px-5 py-3 font-normal">Company</th>
                  <th className="px-5 py-3 font-normal">Contact</th>
                  <th className="px-5 py-3 font-normal">Stage</th>
                  <th className="px-5 py-3 font-normal text-right">Deal Value</th>
                  <th className="px-5 py-3 font-normal text-right">Revenue</th>
                  <th className="px-5 py-3 font-normal">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6 text-white/82">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3">{row.company}</td>
                    <td className="px-5 py-3 text-white/65">{row.contactName}</td>
                    <td className="px-5 py-3 text-white/65">{row.stage}</td>
                    <td className="px-5 py-3 text-right">{ZAR.format(row.dealValue)}</td>
                    <td className="px-5 py-3 text-right text-white">
                      {ZAR.format(row.commission)}
                    </td>
                    <td className="px-5 py-3">
                      {row.earned ? (
                        <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-[0.6rem] uppercase tracking-[0.2em] text-emerald-200">
                          Earned
                        </span>
                      ) : (
                        <span className="rounded-full border border-white/14 bg-white/[0.04] px-2.5 py-1 text-[0.6rem] uppercase tracking-[0.2em] text-white/65">
                          Pipeline
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "sky" | "white";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-200"
      : tone === "sky"
        ? "text-sky-200"
        : "text-white";
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-5">
      <p className="line-label">{label}</p>
      <p className={`mt-2 text-3xl font-medium tracking-[-0.03em] ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

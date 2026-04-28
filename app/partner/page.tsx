import { requireServerAuthSession } from "@/lib/auth-server";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";

export default async function PartnerHomePage() {
  const session = await requireServerAuthSession("partner");
  const { snapshot } = await readAdminStateSnapshot();

  const myLeads = session.partnerOrgId
    ? snapshot.salesLeads.filter((lead) => lead.partnerOrgId === session.partnerOrgId)
    : [];

  const partnerOrg = session.partnerOrgId
    ? (snapshot.partnerOrgs ?? []).find((entry) => entry.id === session.partnerOrgId) ?? null
    : null;

  const openCount = myLeads.filter((lead) => lead.status === "Open").length;
  const convertedCount = myLeads.filter((lead) => lead.status === "Converted").length;
  const qualifiesCount = myLeads.filter(
    (lead) => lead.qualificationStage === "Qualifies",
  ).length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-6">
      <header className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-6">
        <p className="line-label">Partner Overview</p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.03em] text-white">
          Welcome, {session.name}
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/58">
          {partnerOrg
            ? `You are referring leads on behalf of ${partnerOrg.name}.`
            : "Your partner organisation has not been linked yet. Contact your account manager."}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Leads" value={myLeads.length} />
        <StatCard label="Open" value={openCount} />
        <StatCard label="Qualified / Converted" value={qualifiesCount + convertedCount} />
      </section>

      <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-lg font-medium tracking-[-0.02em] text-white">Recent leads</h2>
        {myLeads.length === 0 ? (
          <p className="mt-3 text-sm text-white/58">
            No leads yet. Submit your first referral from the sidebar.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-white/8">
            {myLeads.slice(0, 8).map((lead) => (
              <li key={lead.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm text-white">{lead.contactName}</p>
                  <p className="text-xs text-white/54">{lead.company}</p>
                </div>
                <span className="rounded-full border border-white/14 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.22em] text-white/58">
                  {lead.qualificationStage}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.03] p-5">
      <p className="line-label">{label}</p>
      <p className="mt-2 text-3xl font-medium tracking-[-0.03em] text-white">{value}</p>
    </div>
  );
}

import { SalesInboxRoute, type InboxLeadOption } from "@/components/sales/routes/SalesInboxRoute";
import { requireServerAuthSession } from "@/lib/auth-server";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";

export const dynamic = "force-dynamic";

export default async function PartnerInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string; lead?: string; to?: string; subject?: string; body?: string }>;
}) {
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
            Contact your account manager to complete activation.
          </p>
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const { snapshot } = await readAdminStateSnapshot();
  const leadOptions: InboxLeadOption[] = snapshot.salesLeads
    .filter((lead) => lead.partnerOrgId === session.partnerOrgId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((lead) => ({
      id: lead.id,
      label: `${lead.company} · ${lead.contactName ?? "no contact"}`,
      email: lead.email,
    }));

  return (
    <div className="mx-auto max-w-7xl py-6">
      <SalesInboxRoute
        initialThreadId={params.thread ?? null}
        initialLeadFilter={params.lead ?? null}
        viewerRole="partner"
        viewerAgentId={session.agentId}
        initialLeadOptions={leadOptions}
        initialCompose={{
          to: params.to ?? null,
          subject: params.subject ?? null,
          body: params.body ?? null,
          leadId: params.lead ?? null,
        }}
      />
    </div>
  );
}

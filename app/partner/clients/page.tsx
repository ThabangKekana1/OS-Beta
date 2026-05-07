import { PartnerClientsRoute } from "@/components/partner/PartnerClientsRoute";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { requireServerAuthSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function PartnerClientsPage() {
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

  const { snapshot } = await readAdminStateSnapshot();
  const partnerSalesLeads = snapshot.salesLeads.filter(
    (lead) => lead.partnerOrgId === session.partnerOrgId,
  );
  const partnerSalesLeadIds = new Set(partnerSalesLeads.map((lead) => lead.id));
  const linkedAdminLeadIds = new Set(
    partnerSalesLeads
      .map((lead) => lead.linkedAdminLeadId)
      .filter((id): id is string => Boolean(id)),
  );
  const convertedClientProfileIds = new Set(
    partnerSalesLeads
      .map((lead) => lead.convertedClientProfileId)
      .filter((id): id is string => Boolean(id)),
  );
  const clients = snapshot.leads.filter(
    (lead) =>
      lead.isClientRegistered &&
      (lead.partnerOrgId === session.partnerOrgId ||
        linkedAdminLeadIds.has(lead.id) ||
        convertedClientProfileIds.has(lead.clientProfileId) ||
        (lead.linkedSalesLeadId ? partnerSalesLeadIds.has(lead.linkedSalesLeadId) : false)),
  );

  return <PartnerClientsRoute clients={clients} />;
}

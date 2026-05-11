import { SalesLeadsRoute } from "@/components/sales/routes/SalesLeadsRoute";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";

export default async function AdminSequencesPage() {
  const { snapshot } = await readAdminStateSnapshot();
  const partnerOrgs = (snapshot.partnerOrgs ?? [])
    .filter((org) => org.status === "Active")
    .map((org) => ({ id: org.id, name: org.name }));

  return (
    <SalesLeadsRoute
      agentId={null}
      registrationHref="/admin/registration"
      clientHrefBase="/admin/clients"
      inboxHref="/admin/inbox"
      eyebrow="Sequences"
      title="Lead Sequences"
      description="Run outbound email sequences, monitor replies, and qualify leads from one admin view."
      partnerOrgs={partnerOrgs}
      showPartnerAssignment
      showAssignedTo
      allowDelete
    />
  );
}

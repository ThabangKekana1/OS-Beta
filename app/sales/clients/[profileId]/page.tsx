import { AdminLeadProfileRoute } from "@/components/admin/routes/AdminLeadProfileRoute";

export default async function SalesClientProfilePage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  return (
    <AdminLeadProfileRoute
      leadId={profileId}
      backHref="/sales/clients"
      backLabel="Back to Clients"
      actorRole="sales"
    />
  );
}

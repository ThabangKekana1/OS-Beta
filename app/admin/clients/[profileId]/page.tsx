import { AdminLeadProfileRoute } from "@/components/admin/routes/AdminLeadProfileRoute";

export default async function AdminClientProfilePage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  return (
    <AdminLeadProfileRoute
      leadId={profileId}
      backHref="/admin/clients"
      backLabel="Back to Clients"
      actorRole="admin"
    />
  );
}

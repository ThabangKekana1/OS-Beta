import { AdminLeadProfileRoute } from "@/components/admin/routes/AdminLeadProfileRoute";

export default async function AdminLeadProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminLeadProfileRoute
      leadId={id}
      backHref="/admin/clients"
      backLabel="Back to Clients"
      actorRole="admin"
    />
  );
}

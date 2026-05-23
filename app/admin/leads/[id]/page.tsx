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
      backHref="/admin/leads"
      backLabel="Back to Leads"
      actorRole="admin"
    />
  );
}

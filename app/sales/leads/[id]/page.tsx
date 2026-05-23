import { AdminLeadProfileRoute } from "@/components/admin/routes/AdminLeadProfileRoute";

export default async function SalesLeadProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminLeadProfileRoute
      leadId={id}
      backHref="/sales/leads"
      backLabel="Back to Leads"
      actorRole="sales"
    />
  );
}

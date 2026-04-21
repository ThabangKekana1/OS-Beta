import { AdminSalesRepProfileRoute } from "@/components/admin/routes/AdminSalesRepProfileRoute";

export default async function AdminSalesRepProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminSalesRepProfileRoute repId={id} />;
}

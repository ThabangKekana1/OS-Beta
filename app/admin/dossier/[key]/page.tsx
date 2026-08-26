import { AdminDossierRoute } from "@/components/admin/routes/AdminDossierRoute";

export default async function AdminDossierPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return <AdminDossierRoute prospectKey={decodeURIComponent(key)} />;
}

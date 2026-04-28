import { AdminPartnersRoute } from "@/components/admin/routes/AdminPartnersRoute";
import { requireServerAuthSession } from "@/lib/auth-server";

export default async function AdminPartnersPage() {
  await requireServerAuthSession("admin");
  return <AdminPartnersRoute />;
}

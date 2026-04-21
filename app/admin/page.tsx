import { AdminOverviewRoute } from "@/components/admin/routes/AdminOverviewRoute";
import { requireServerAuthSession } from "@/lib/auth-server";

export default async function AdminPage() {
  const session = await requireServerAuthSession("admin");

  return (
    <AdminOverviewRoute
      profileName={session.name}
      email={session.email}
      agentId={session.agentId}
    />
  );
}

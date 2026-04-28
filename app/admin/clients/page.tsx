import { AdminClientsRoute } from "@/components/admin/routes/AdminClientsRoute";
import { requireServerAuthSession } from "@/lib/auth-server";

export default async function AdminClientsPage() {
  const session = await requireServerAuthSession("admin");
  return <AdminClientsRoute viewerAgentId={session.agentId} />;
}

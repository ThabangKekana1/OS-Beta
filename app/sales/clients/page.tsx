import { SalesClientsRoute } from "@/components/sales/routes/SalesClientsRoute";
import { requireServerAuthSession } from "@/lib/auth-server";

export default async function SalesClientsPage() {
  const session = await requireServerAuthSession("sales");
  return <SalesClientsRoute agentId={session.agentId} />;
}

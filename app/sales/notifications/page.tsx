import { SalesNotificationsRoute } from "@/components/sales/routes/SalesNotificationsRoute";
import { requireServerAuthSession } from "@/lib/auth-server";

export default async function SalesNotificationsPage() {
  const session = await requireServerAuthSession("sales");
  return <SalesNotificationsRoute agentId={session.agentId} />;
}

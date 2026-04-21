import { SalesLeadsRoute } from "@/components/sales/routes/SalesLeadsRoute";
import { requireServerAuthSession } from "@/lib/auth-server";

export default async function SalesLeadsPage() {
  const session = await requireServerAuthSession("sales");
  return <SalesLeadsRoute agentId={session.agentId} />;
}

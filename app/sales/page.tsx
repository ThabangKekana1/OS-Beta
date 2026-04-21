import { SalesOverviewRoute } from "@/components/sales/routes/SalesOverviewRoute";
import { requireServerAuthSession } from "@/lib/auth-server";

export default async function SalesPage() {
  const session = await requireServerAuthSession("sales");

  return (
    <SalesOverviewRoute
      profileName={session.name}
      email={session.email}
      agentId={session.agentId}
    />
  );
}

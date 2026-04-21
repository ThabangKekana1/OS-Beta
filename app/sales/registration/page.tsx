import { AdminClientRegistrationRoute } from "@/components/admin/routes/AdminClientRegistrationRoute";
import { requireServerAuthSession } from "@/lib/auth-server";

export default async function SalesRegistrationPage() {
  const session = await requireServerAuthSession("sales");

  return (
    <AdminClientRegistrationRoute
      defaultOwnerId={session.agentId}
      clientHrefBase="/sales/clients"
    />
  );
}

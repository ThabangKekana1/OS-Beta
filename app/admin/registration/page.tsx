import { AdminClientRegistrationRoute } from "@/components/admin/routes/AdminClientRegistrationRoute";
import { requireServerAuthSession } from "@/lib/auth-server";

export default async function AdminRegistrationPage() {
  const session = await requireServerAuthSession("admin");

  return (
    <AdminClientRegistrationRoute
      registrationLinkProfile={{
        email: session.email,
        role: "admin",
        agentId: session.agentId,
      }}
    />
  );
}

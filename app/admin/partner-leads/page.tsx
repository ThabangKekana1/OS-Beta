import { requireServerAuthSession } from "@/lib/auth-server";
import { readAdminStateSnapshot } from "@/lib/admin-state-store";
import { listAgents } from "@/lib/users-db";
import { ADMIN_AGENTS } from "@/lib/admin-mock-data";
import { AdminPartnerLeadsRoute } from "@/components/admin/routes/AdminPartnerLeadsRoute";

export default async function AdminPartnerLeadsPage() {
  await requireServerAuthSession("admin");
  const { snapshot } = await readAdminStateSnapshot();
  const agents =
    (await listAgents()) ??
    ADMIN_AGENTS.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role as "Admin" | "Sales Agent" | "Sales Manager" | "RevOps",
      region: agent.region,
      isActive: true,
    }));

  const partnerLeads = snapshot.salesLeads.filter(
    (lead) => lead.createdByRole === "partner",
  );

  const salesAgents = agents
    .filter(
      (agent) =>
        agent.role === "Sales Agent" ||
        agent.role === "Sales Manager" ||
        agent.role === "Admin",
    )
    .map((agent) => ({ id: agent.id, name: agent.name, role: agent.role }));

  const partnerOrgs = (snapshot.partnerOrgs ?? []).map((org) => ({
    id: org.id,
    name: org.name,
  }));

  return (
    <AdminPartnerLeadsRoute
      initialLeads={partnerLeads}
      salesAgents={salesAgents}
      partnerOrgs={partnerOrgs}
    />
  );
}

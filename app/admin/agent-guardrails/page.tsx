import { requireServerAuthSession } from "@/lib/auth-server";
import { loadAgentConfig } from "@/lib/assistant/agent-config";
import { AgentGuardrailsRoute } from "@/components/admin/routes/AgentGuardrailsRoute";

export const dynamic = "force-dynamic";

export default async function AgentGuardrailsPage() {
  await requireServerAuthSession("admin");
  const config = await loadAgentConfig();
  return <AgentGuardrailsRoute initialConfig={config} />;
}

import { SalesLeadsRoute } from "@/components/sales/routes/SalesLeadsRoute";
import { requireServerAuthSession } from "@/lib/auth-server";

export default async function SalesSequencesPage() {
  const session = await requireServerAuthSession("sales");
  return (
    <SalesLeadsRoute
      agentId={session.agentId}
      eyebrow="Sequences"
      title="Lead Sequences"
      description="Send client outreach from Inbox, track replies, and qualify leads from your assigned book."
      showAssignedTo={false}
    />
  );
}

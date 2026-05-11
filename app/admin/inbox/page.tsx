import { SalesInboxRoute } from "@/components/sales/routes/SalesInboxRoute";
import { getAdminSenderOptions } from "@/lib/admin-mailboxes";
import { requireServerAuthSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string; lead?: string; to?: string; subject?: string; body?: string }>;
}) {
  const session = await requireServerAuthSession("admin");
  const params = await searchParams;
  const senderOptions = getAdminSenderOptions();
  return (
    <SalesInboxRoute
      initialThreadId={params.thread ?? null}
      initialLeadFilter={params.lead ?? null}
      viewerRole="admin"
      viewerAgentId={session.agentId}
      senderOptions={senderOptions}
      initialCompose={{
        to: params.to ?? null,
        subject: params.subject ?? null,
        body: params.body ?? null,
        leadId: params.lead ?? null,
      }}
    />
  );
}

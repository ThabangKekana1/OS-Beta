import { AdminInboxRoute } from "@/components/admin/routes/AdminInboxRoute";
import { requireServerAuthSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function SalesInboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    thread?: string;
    lead?: string;
    to?: string;
    subject?: string;
    body?: string;
    template?: string;
    company?: string;
    name?: string;
  }>;
}) {
  const [params, session] = await Promise.all([
    searchParams,
    requireServerAuthSession("sales"),
  ]);

  return (
    <AdminInboxRoute
      initialThreadId={params.thread ?? null}
      initialLeadFilter={params.lead ?? null}
      viewerRole="sales"
      viewerAgentId={session.agentId}
      viewerEmail={session.email}
      initialCompose={{
        to: params.to ?? null,
        subject: params.subject ?? null,
        body: params.body ?? null,
        leadId: params.lead ?? null,
        template: params.template ?? null,
        company: params.company ?? null,
        contactName: params.name ?? null,
      }}
    />
  );
}

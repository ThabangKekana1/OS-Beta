import { AdminInboxRoute } from "@/components/admin/routes/AdminInboxRoute";
import { getAdminSenderOptions } from "@/lib/admin-mailboxes";
import { requireServerAuthSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function AdminInboxPage({
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
    mailbox?: string;
  }>;
}) {
  const [params, session] = await Promise.all([
    searchParams,
    requireServerAuthSession("admin"),
  ]);
  const senderOptions = getAdminSenderOptions();
  return (
    <AdminInboxRoute
      initialThreadId={params.thread ?? null}
      initialLeadFilter={params.lead ?? null}
      initialMailbox={params.mailbox ?? null}
      viewerRole="admin"
      viewerAgentId={null}
      viewerEmail={session.email}
      senderOptions={senderOptions}
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

import { SalesInboxRoute } from "@/components/sales/routes/SalesInboxRoute";
import { requireServerAuthSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string; lead?: string; to?: string; subject?: string; body?: string }>;
}) {
  await requireServerAuthSession("admin");
  const params = await searchParams;
  return (
    <SalesInboxRoute
      initialThreadId={params.thread ?? null}
      initialLeadFilter={params.lead ?? null}
      initialCompose={{
        to: params.to ?? null,
        subject: params.subject ?? null,
        body: params.body ?? null,
        leadId: params.lead ?? null,
      }}
    />
  );
}

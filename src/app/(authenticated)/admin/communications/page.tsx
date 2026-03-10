import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { auth } from "@/lib/auth";
import {
  COMMUNICATION_STATUS_LABELS,
  COMMUNICATION_THREAD_LABELS,
  COMMUNICATION_VISIBILITY_LABELS,
} from "@/lib/communication";
import { getAdminCommunicationOverview } from "@/lib/queries";
import {
  createCommunicationThread,
  replyToCommunicationThread,
  updateCommunicationThreadStatus,
} from "@/actions/communication-actions";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type SearchParams = Promise<{
  threadType?: string;
  status?: string;
  businessId?: string;
  leadId?: string;
}>;

export default async function AdminCommunicationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session || !["ADMINISTRATOR", "SUPER_ADMIN"].includes(session.user.role)) {
    redirect("/login");
  }

  const filters = await searchParams;
  const data = await getAdminCommunicationOverview(filters);
  const unresolvedThreads = data.threads.filter((thread) =>
    ["OPEN", "PENDING"].includes(thread.status)
  );

  return (
    <div>
      <PageHeader
        title="Communications"
        description={`${unresolvedThreads.length} unresolved thread${unresolvedThreads.length === 1 ? "" : "s"}`}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border"><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Open Business Support</p><p className="mt-1 text-lg font-semibold">{data.threads.filter((thread) => thread.threadType === "BUSINESS_SUPPORT" && ["OPEN", "PENDING"].includes(thread.status)).length}</p></CardContent></Card>
        <Card className="border-border"><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Open Sales Escalations</p><p className="mt-1 text-lg font-semibold">{data.threads.filter((thread) => thread.threadType === "SALES_ESCALATION" && ["OPEN", "PENDING"].includes(thread.status)).length}</p></CardContent></Card>
        <Card className="border-border"><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Open Internal Notes</p><p className="mt-1 text-lg font-semibold">{data.threads.filter((thread) => thread.threadType === "INTERNAL_ADMIN_NOTE" && ["OPEN", "PENDING"].includes(thread.status)).length}</p></CardContent></Card>
        <Card className="border-border"><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Threads</p><p className="mt-1 text-lg font-semibold">{data.threads.length}</p></CardContent></Card>
      </div>

      <Card className="mt-6 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-2 md:grid-cols-5">
            <select name="threadType" defaultValue={filters.threadType ?? ""} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-xs">
              <option value="">All types</option>
              <option value="BUSINESS_SUPPORT">Business support</option>
              <option value="SALES_ESCALATION">Sales escalation</option>
              <option value="INTERNAL_ADMIN_NOTE">Internal administrator note</option>
            </select>
            <select name="status" defaultValue={filters.status ?? ""} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-xs">
              <option value="">All statuses</option>
              <option value="OPEN">Open</option>
              <option value="PENDING">Pending</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
            <select name="businessId" defaultValue={filters.businessId ?? ""} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-xs">
              <option value="">All businesses</option>
              {data.businesses.map((business) => (
                <option key={business.id} value={business.id}>{business.legalName}</option>
              ))}
            </select>
            <select name="leadId" defaultValue={filters.leadId ?? ""} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-xs">
              <option value="">All leads</option>
              {data.leads.map((lead) => (
                <option key={lead.id} value={lead.id}>{lead.businessName}</option>
              ))}
            </select>
            <Button type="submit" size="sm">Apply</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Create Internal Administrator Note</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={async (formData) => {
            "use server";
            await createCommunicationThread(formData);
          }} className="space-y-2">
            <input type="hidden" name="threadType" value="INTERNAL_ADMIN_NOTE" />
            <div className="grid gap-2 md:grid-cols-3">
              <select name="businessId" className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-xs">
                <option value="">Link business (optional)</option>
                {data.businesses.map((business) => (
                  <option key={business.id} value={business.id}>{business.legalName}</option>
                ))}
              </select>
              <select name="leadId" className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-xs">
                <option value="">Link lead (optional)</option>
                {data.leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>{lead.businessName}</option>
                ))}
              </select>
              <select name="dealPipelineId" className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-xs">
                <option value="">Link deal (optional)</option>
                {data.deals.map((deal) => (
                  <option key={deal.id} value={deal.id}>{deal.business.legalName}</option>
                ))}
              </select>
            </div>
            <input name="subject" placeholder="Subject" className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-xs" />
            <textarea name="body" required placeholder="Internal note..." className="h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-xs" />
            <Button type="submit" size="sm">Create note</Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-6 space-y-4">
        {data.threads.length === 0 ? (
          <Card className="border-border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">No communication threads found for the selected filters.</p></CardContent></Card>
        ) : (
          data.threads.map((thread) => (
            <Card key={thread.id} className="border-border">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-sm font-medium">{thread.subject ?? "Untitled thread"}</CardTitle>
                  <Badge variant="outline" className="text-[10px]">{COMMUNICATION_THREAD_LABELS[thread.threadType]}</Badge>
                  <Badge variant="outline" className="text-[10px]">{COMMUNICATION_STATUS_LABELS[thread.status]}</Badge>
                  <Badge variant="outline" className="text-[10px]">{COMMUNICATION_VISIBILITY_LABELS[thread.visibilityScope]}</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {thread.business ? `${thread.business.legalName}` : "No business"}
                  {thread.lead ? ` · ${thread.lead.businessName}` : ""}
                  {thread.dealPipeline ? " · Deal linked" : ""}
                  {` · Updated ${formatDistanceToNow(thread.lastMessageAt, { addSuffix: true })}`}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  {thread.messages.slice(-6).map((message) => (
                    <div key={message.id} className="rounded-md border border-border p-2.5">
                      <p className="text-[10px] text-muted-foreground">
                        {message.author.firstName} {message.author.lastName} · {message.author.role.replace(/_/g, " ")} · {formatDistanceToNow(message.createdAt, { addSuffix: true })}
                      </p>
                      <p className="mt-1 text-xs">{message.body}</p>
                    </div>
                  ))}
                </div>
                <form action={async (formData) => {
                  "use server";
                  await replyToCommunicationThread(formData);
                }} className="space-y-2">
                  <input type="hidden" name="threadId" value={thread.id} />
                  <textarea name="body" required placeholder="Reply..." className="h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-xs" />
                  <Button type="submit" size="sm">Reply</Button>
                </form>
                <form action={async (formData) => {
                  "use server";
                  await updateCommunicationThreadStatus(formData);
                }} className="flex items-center gap-2">
                  <input type="hidden" name="threadId" value={thread.id} />
                  <select name="status" defaultValue={thread.status} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-xs">
                    <option value="OPEN">Open</option>
                    <option value="PENDING">Pending</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                  <Button type="submit" variant="outline" size="sm">Update status</Button>
                </form>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

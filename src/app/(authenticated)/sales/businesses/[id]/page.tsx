import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { createCommunicationThread, replyToCommunicationThread } from "@/actions/communication-actions";
import { COMMUNICATION_STATUS_LABELS } from "@/lib/communication";
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { StageBadge } from "@/components/shared/stage-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { computeStageAge } from "@/lib/stage-engine";
import { format, formatDistanceToNow } from "date-fns";

export default async function SalesBusinessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "SALES_REPRESENTATIVE") redirect("/login");

  const { id } = await params;
  const business = await prisma.business.findFirst({
    where: { id, sourceSalesRepresentativeId: session.user.id },
    include: {
      currentStage: true,
      dealPipeline: {
        include: {
          currentStage: true,
          stageHistory: {
            include: { toStage: true },
            orderBy: { changedAt: "desc" },
            take: 10,
          },
        },
      },
    },
  });

  if (!business) notFound();

  const escalationThreads = await prisma.communicationThread.findMany({
    where: {
      threadType: "SALES_ESCALATION",
      visibilityScope: "SALES_ADMIN",
      businessId: business.id,
      OR: [
        { lead: { is: { salesRepresentativeId: session.user.id } } },
        { business: { is: { sourceSalesRepresentativeId: session.user.id } } },
        { dealPipeline: { is: { sourceSalesRepresentativeId: session.user.id } } },
      ],
    },
    include: {
      lead: { select: { businessName: true } },
      messages: {
        include: {
          author: { select: { firstName: true, lastName: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 20,
      },
    },
    orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }],
  });

  const deal = business.dealPipeline;
  const stageAge = deal ? computeStageAge(deal.stageEnteredAt) : null;

  return (
    <div>
      <PageHeader title={business.legalName} description={business.registrationNumber} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current Stage</p>
            {business.currentStage && (
              <StageBadge stageName={business.currentStage.name} category={business.currentStage.category} className="mt-1" />
            )}
            {stageAge && <p className="mt-1 text-xs text-muted-foreground">{stageAge.label} in stage</p>}
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Qualification</p>
            <Badge variant="outline" className="mt-1 text-[10px]">{business.qualificationStatus.replace(/_/g, " ")}</Badge>
            {business.disqualificationReason && (
              <p className="mt-1 text-[10px] text-destructive">{business.disqualificationReason}</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</p>
            {deal?.isStalled ? (
              <Badge variant="outline" className="mt-1 text-[10px] border-destructive/30 text-destructive">Stalled</Badge>
            ) : (
              <Badge variant="outline" className="mt-1 text-[10px]">Active</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Stage History</CardTitle>
        </CardHeader>
        <CardContent>
          {deal?.stageHistory && deal.stageHistory.length > 0 ? (
            <div className="space-y-2">
              {deal.stageHistory.map((h) => (
                <div key={h.id} className="flex items-center justify-between border-b border-border/50 pb-2">
                  <StageBadge stageName={h.toStage.name} category={h.toStage.category} />
                  <span className="text-[10px] text-muted-foreground">{format(h.changedAt, "dd MMM yyyy HH:mm")}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No stage history</p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4 border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Escalation Threads</CardTitle>
            <Badge variant="outline" className="text-[10px]">{escalationThreads.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={async (formData) => {
            "use server";
            await createCommunicationThread(formData);
          }} className="space-y-2 rounded-md border border-border p-3">
            <input type="hidden" name="threadType" value="SALES_ESCALATION" />
            <input type="hidden" name="businessId" value={business.id} />
            {deal && <input type="hidden" name="dealPipelineId" value={deal.id} />}
            <input name="subject" required placeholder="Escalation subject" className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-xs" />
            <textarea name="body" required placeholder="Describe what is blocked..." className="h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-xs" />
            <Button type="submit" size="sm">Escalate to administrator</Button>
          </form>
          {escalationThreads.length === 0 ? (
            <p className="text-xs text-muted-foreground">No escalation threads linked to this business.</p>
          ) : (
            <div className="space-y-3">
              {escalationThreads.map((thread) => (
                <div key={thread.id} className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">{thread.subject ?? "Untitled escalation thread"}</p>
                    <Badge variant="outline" className="text-[10px]">{COMMUNICATION_STATUS_LABELS[thread.status]}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Last updated {formatDistanceToNow(thread.lastMessageAt, { addSuffix: true })}
                  </p>
                  <div className="space-y-2">
                    {thread.messages.slice(-5).map((message) => (
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
                    <textarea name="body" required placeholder="Reply..." className="h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-xs" />
                    <Button type="submit" size="sm" variant="outline">Reply</Button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

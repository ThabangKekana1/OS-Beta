import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { StageBadge } from "@/components/shared/stage-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { computeStageAge } from "@/lib/stage-engine";
import { format } from "date-fns";

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
    </div>
  );
}

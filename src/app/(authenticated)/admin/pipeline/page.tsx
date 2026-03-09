import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAdminPipelineDeals, getStageDefinitions, getStallReasonDefinitions } from "@/lib/queries";
import { PageHeader } from "@/components/shared/page-header";
import { StageBadge } from "@/components/shared/stage-badge";
import { HealthIndicator } from "@/components/shared/health-indicator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { computeStageAge } from "@/lib/stage-engine";
import { STAGE_GROUPS } from "@/lib/constants";
import Link from "next/link";

export default async function PipelinePage() {
  const session = await auth();
  if (!session || !["ADMINISTRATOR", "SUPER_ADMIN"].includes(session.user.role)) {
    redirect("/login");
  }

  const [deals, stages] = await Promise.all([
    getAdminPipelineDeals(),
    getStageDefinitions(),
  ]);

  const groupedDeals: Record<string, typeof deals> = {};
  for (const [group, codes] of Object.entries(STAGE_GROUPS)) {
    const groupDeals = deals.filter((d) => codes.includes(d.currentStage.code));
    if (groupDeals.length > 0) {
      groupedDeals[group] = groupDeals;
    }
  }

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description={`${deals.length} deals across ${stages.filter((s) => !s.isTerminal).length} active stages`}
      />

      {/* Kanban-style grouped view */}
      <div className="space-y-6">
        {Object.entries(groupedDeals).map(([group, groupDeals]) => (
          <Card key={group} className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{group}</CardTitle>
                <Badge variant="outline" className="text-[10px]">{groupDeals.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Business</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Stage</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Stage Age</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Health</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Next Action</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Owner</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Rep</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupDeals.map((deal) => {
                      const age = computeStageAge(deal.stageEnteredAt);
                      const isOverdue = deal.currentStage.targetDurationHours
                        ? age.hours > deal.currentStage.targetDurationHours
                        : false;

                      return (
                        <tr key={deal.id} className="border-b border-border/50 hover:bg-accent/20">
                          <td className="py-2.5">
                            <Link href={`/admin/businesses/${deal.businessId}`} className="font-medium hover:underline">
                              {deal.business.legalName}
                            </Link>
                            {deal.isStalled && (
                              <p className="text-[10px] text-destructive">
                                Stalled: {deal.stallReason?.name}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5">
                            <StageBadge stageName={deal.currentStage.name} category={deal.currentStage.category} />
                          </td>
                          <td className={`py-2.5 tabular-nums ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                            {age.label}
                            {deal.currentStage.targetDurationHours && (
                              <span className="text-[10px] text-muted-foreground"> / {Math.round(deal.currentStage.targetDurationHours / 24)}d</span>
                            )}
                          </td>
                          <td className="py-2.5">
                            <HealthIndicator status={deal.healthStatus} />
                          </td>
                          <td className="py-2.5 text-muted-foreground">
                            {deal.nextRequiredAction ?? "—"}
                          </td>
                          <td className="py-2.5 text-muted-foreground">
                            {deal.currentStage.ownerRole.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                          </td>
                          <td className="py-2.5 text-muted-foreground">
                            {deal.sourceSalesRepresentative.firstName} {deal.sourceSalesRepresentative.lastName[0]}.
                          </td>
                          <td className="py-2.5 tabular-nums text-muted-foreground">
                            R{deal.business.monthlyElectricitySpendEstimate?.toLocaleString() ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAnalyticsData, getStageDefinitions, getStallReasonDefinitions } from "@/lib/queries";
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session || !["ADMINISTRATOR", "SUPER_ADMIN"].includes(session.user.role)) redirect("/login");

  const [analytics, stages, stallReasons] = await Promise.all([
    getAnalyticsData(),
    getStageDefinitions(),
    getStallReasonDefinitions(),
  ]);

  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const stallReasonMap = new Map(stallReasons.map((sr) => [sr.code, sr]));

  const conversionRate = analytics.totalLeads > 0
    ? Math.round((analytics.totalBusinesses / analytics.totalLeads) * 100)
    : 0;

  const qualificationRate = analytics.totalBusinesses > 0
    ? Math.round((analytics.qualifiedCount / analytics.totalBusinesses) * 100)
    : 0;

  const disqualificationRate = analytics.totalBusinesses > 0
    ? Math.round((analytics.disqualifiedCount / analytics.totalBusinesses) * 100)
    : 0;

  // Rep performance
  const reps = await prisma.user.findMany({
    where: { role: "SALES_REPRESENTATIVE" },
    select: { id: true, firstName: true, lastName: true },
  });

  const repMap = new Map(reps.map((r) => [r.id, r]));

  const repStats = analytics.repPerformance.map((rp) => ({
    rep: repMap.get(rp.sourceSalesRepresentativeId),
    count: rp._count.id,
  })).sort((a, b) => b.count - a.count);

  return (
    <div>
      <PageHeader title="Analytics" description="Pilot performance and pipeline metrics" />

      {/* High-level KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatCard label="Total Leads" value={analytics.totalLeads} />
        <StatCard label="Total Businesses" value={analytics.totalBusinesses} />
        <StatCard label="Qualified" value={analytics.qualifiedCount} />
        <StatCard label="Disqualified" value={analytics.disqualifiedCount} />
        <StatCard label="Lead→Business" value={`${conversionRate}%`} />
        <StatCard label="Qualification Rate" value={`${qualificationRate}%`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Pipeline Distribution */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Deals by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.dealsByStage
                .filter((d) => d._count.id > 0)
                .map((d) => {
                  const stage = stageMap.get(d.currentStageId);
                  return (
                    <div key={d.currentStageId} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{stage?.name ?? "Unknown"}</span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 rounded-full bg-primary/30" style={{ width: `${d._count.id * 20}px` }} />
                        <span className="w-6 text-right text-xs font-medium tabular-nums">{d._count.id}</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        {/* Stalled by Reason */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Stalled Deals by Reason</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.stalledByReason.length === 0 ? (
              <p className="text-xs text-muted-foreground">No stalled deals</p>
            ) : (
              <div className="space-y-2">
                {analytics.stalledByReason.map((sr) => {
                  const reason = stallReasonMap.get(sr.stallReasonCode!);
                  return (
                    <div key={sr.stallReasonCode} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{reason?.name ?? sr.stallReasonCode}</span>
                      <span className="text-xs font-medium tabular-nums">{sr._count.id}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Average Stage Duration */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Average Stage Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.avgStageDurations
                .filter((a) => a._avg.previousStageDurationHours != null)
                .map((a) => {
                  const stage = stageMap.get(a.toStageId);
                  const hours = a._avg.previousStageDurationHours!;
                  const days = Math.round(hours / 24 * 10) / 10;
                  return (
                    <div key={a.toStageId} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{stage?.name ?? "Unknown"}</span>
                      <span className="text-xs font-medium tabular-nums">{days}d avg</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        {/* Sales Rep Performance */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Sales Rep Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {repStats.map((rs, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {rs.rep ? `${rs.rep.firstName} ${rs.rep.lastName}` : "Unknown"}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 rounded-full bg-primary/30" style={{ width: `${rs.count * 15}px` }} />
                    <span className="w-6 text-right text-xs font-medium tabular-nums">{rs.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

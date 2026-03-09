import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAdminDashboardStats, getAdminDocumentExchangeOverview, getAdminPipelineDeals } from "@/lib/queries";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StageBadge } from "@/components/shared/stage-badge";
import { HealthIndicator } from "@/components/shared/health-indicator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STAGE_GROUPS } from "@/lib/constants";
import { computeStageAge } from "@/lib/stage-engine";
import Link from "next/link";
import {
  Zap,
  AlertTriangle,
  FileText,
  Clock,
  ListTodo,
  Send,
  Users,
} from "lucide-react";

export default async function AdminDashboard() {
  const session = await auth();
  if (!session || !["ADMINISTRATOR", "SUPER_ADMIN"].includes(session.user.role)) {
    redirect("/login");
  }

  const [stats, recentDeals, documentExchange] = await Promise.all([
    getAdminDashboardStats(),
    getAdminPipelineDeals(),
    getAdminDocumentExchangeOverview(),
  ]);

  const stalledDeals = recentDeals.filter((d) => d.isStalled);
  const overdueDeals = recentDeals.filter((d) => {
    if (!d.currentStage.targetDurationHours) return false;
    const { hours } = computeStageAge(d.stageEnteredAt);
    return hours > d.currentStage.targetDurationHours;
  });

  return (
    <div>
      <PageHeader
        title="Command Centre"
        description={`${stats.totalDeals} active deals in pipeline`}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Live Deals" value={stats.totalDeals} icon={<Zap size={16} />} />
        <StatCard label="Stalled" value={stats.stalledDeals} icon={<AlertTriangle size={16} />} />
        <StatCard label="Overdue" value={stats.overdueDeals} icon={<Clock size={16} />} />
        <StatCard label="Doc Review" value={stats.pendingDocReview} icon={<FileText size={16} />} />
        <StatCard label="Partner Wait" value={stats.awaitingPartner} icon={<Send size={16} />} />
        <StatCard label="Today Tasks" value={stats.todayTasks} icon={<ListTodo size={16} />} />
        <StatCard label="Total Leads" value={stats.totalLeads} icon={<Users size={16} />} />
      </div>

      {/* Stage Distribution */}
      <div className="mt-6">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Pipeline by Stage Group</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(STAGE_GROUPS).map(([group, codes]) => {
                const count = stats.dealsByStage
                  .filter((s) => codes.includes(s.stageCode))
                  .reduce((acc, s) => acc + s.count, 0);
                if (count === 0 && group === "Closed") return null;
                return (
                  <div key={group} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{group}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 rounded-full bg-primary/20" style={{ width: `${Math.max(count * 15, 4)}px` }} />
                      <span className="w-6 text-right text-xs font-medium tabular-nums">{count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Document Exchange Queues</CardTitle>
              <Link href="/admin/documents" className="text-xs text-muted-foreground hover:text-foreground">
                Open document exchange →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-md border border-border p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Requested, waiting on business</p><p className="mt-1 text-lg font-semibold">{documentExchange.groups.requestsAwaitingUpload.length}</p></div>
              <div className="rounded-md border border-border p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Uploaded, waiting on review</p><p className="mt-1 text-lg font-semibold">{documentExchange.groups.businessUploadsAwaitingReview.length}</p></div>
              <div className="rounded-md border border-border p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Delivered to business</p><p className="mt-1 text-lg font-semibold">{documentExchange.groups.deliveredToBusiness.length}</p></div>
              <div className="rounded-md border border-border p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Awaiting signed return</p><p className="mt-1 text-lg font-semibold">{documentExchange.groups.deliveredAwaitingSignedReturn.length}</p></div>
              <div className="rounded-md border border-border p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Signed returns awaiting partner</p><p className="mt-1 text-lg font-semibold">{documentExchange.groups.signedReturnsAwaitingForward.length}</p></div>
              <div className="rounded-md border border-border p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Partner returned, not yet shared</p><p className="mt-1 text-lg font-semibold">{documentExchange.groups.partnerReturnedAwaitingUpload.length}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Stalled Deals */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Stalled Deals</CardTitle>
              <Badge variant="outline" className="text-[10px]">{stalledDeals.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {stalledDeals.length === 0 ? (
              <p className="text-xs text-muted-foreground">No stalled deals</p>
            ) : (
              <div className="space-y-2">
                {stalledDeals.slice(0, 8).map((deal) => (
                  <Link
                    key={deal.id}
                    href={`/admin/businesses/${deal.businessId}`}
                    className="flex items-center justify-between rounded-md border border-border p-2.5 transition-colors hover:bg-accent/30"
                  >
                    <div>
                      <p className="text-xs font-medium">{deal.business.legalName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {deal.stallReason?.name ?? "Unknown reason"}
                      </p>
                    </div>
                    <div className="text-right">
                      <StageBadge stageName={deal.currentStage.name} category={deal.currentStage.category} />
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {computeStageAge(deal.stageEnteredAt).label} in stage
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overdue Deals */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Overdue Stage Items</CardTitle>
              <Badge variant="outline" className="text-[10px]">{overdueDeals.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {overdueDeals.length === 0 ? (
              <p className="text-xs text-muted-foreground">No overdue items</p>
            ) : (
              <div className="space-y-2">
                {overdueDeals.slice(0, 8).map((deal) => {
                  const age = computeStageAge(deal.stageEnteredAt);
                  const target = deal.currentStage.targetDurationHours ?? 0;
                  return (
                    <Link
                      key={deal.id}
                      href={`/admin/businesses/${deal.businessId}`}
                      className="flex items-center justify-between rounded-md border border-border p-2.5 transition-colors hover:bg-accent/30"
                    >
                      <div>
                        <p className="text-xs font-medium">{deal.business.legalName}</p>
                        <StageBadge stageName={deal.currentStage.name} category={deal.currentStage.category} />
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium tabular-nums">{age.label}</p>
                        <p className="text-[10px] text-muted-foreground">target: {Math.round(target / 24)}d</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full Pipeline Table */}
      <div className="mt-6">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">All Deals</CardTitle>
              <Link href="/admin/pipeline" className="text-xs text-muted-foreground hover:text-foreground">
                View Pipeline →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 text-left font-medium text-muted-foreground">Business</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Stage</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Age</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Health</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Rep</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Admin</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDeals.slice(0, 15).map((deal) => (
                    <tr key={deal.id} className="border-b border-border/50 hover:bg-accent/20">
                      <td className="py-2.5">
                        <Link href={`/admin/businesses/${deal.businessId}`} className="font-medium hover:underline">
                          {deal.business.legalName}
                        </Link>
                      </td>
                      <td className="py-2.5">
                        <StageBadge stageName={deal.currentStage.name} category={deal.currentStage.category} />
                      </td>
                      <td className="py-2.5 tabular-nums text-muted-foreground">
                        {computeStageAge(deal.stageEnteredAt).label}
                      </td>
                      <td className="py-2.5">
                        <HealthIndicator status={deal.healthStatus} />
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {deal.sourceSalesRepresentative.firstName} {deal.sourceSalesRepresentative.lastName[0]}.
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {deal.assignedAdministrator
                          ? `${deal.assignedAdministrator.firstName} ${deal.assignedAdministrator.lastName[0]}.`
                          : "—"}
                      </td>
                      <td className="py-2.5">
                        <Badge variant="outline" className="text-[10px]">{deal.priority}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

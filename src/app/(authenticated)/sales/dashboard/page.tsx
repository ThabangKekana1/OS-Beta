import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSalesRepDashboardData } from "@/lib/queries";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StageBadge } from "@/components/shared/stage-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Users, UserPlus, Building2, CheckCircle, AlertTriangle } from "lucide-react";

export default async function SalesDashboard() {
  const session = await auth();
  if (!session || session.user.role !== "SALES_REPRESENTATIVE") redirect("/login");

  const data = await getSalesRepDashboardData(session.user.id);

  const needsFollowUp = data.businesses.filter(
    (b) => b.dealPipeline?.isStalled || b.qualificationStatus === "EARLY_INTEREST"
  );

  return (
    <div>
      <PageHeader
        title={`Welcome, ${session.user.firstName}`}
        description="Your pipeline overview"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total Leads" value={data.stats.totalLeads} icon={<Users size={16} />} />
        <StatCard label="Invites Sent" value={data.stats.invitesSent} icon={<UserPlus size={16} />} />
        <StatCard label="Registered" value={data.stats.registered} icon={<Building2 size={16} />} />
        <StatCard label="Qualified" value={data.stats.qualified} icon={<CheckCircle size={16} />} />
        <StatCard label="Stalled" value={data.stats.stalled} icon={<AlertTriangle size={16} />} />
      </div>

      {/* Referral Code */}
      {data.profile && (
        <Card className="mt-4 border-border">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Your Referral Code</p>
              <p className="text-sm font-mono font-semibold">{data.profile.uniqueReferralCode}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Registration Link</p>
              <code className="text-[10px] text-muted-foreground">
                {`/register/${data.profile.uniqueReferralCode}`}
              </code>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* My Businesses */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">My Businesses</CardTitle>
              <Link href="/sales/businesses" className="text-xs text-muted-foreground hover:text-foreground">View all →</Link>
            </div>
          </CardHeader>
          <CardContent>
            {data.businesses.length === 0 ? (
              <p className="text-xs text-muted-foreground">No businesses yet. Create a lead to get started.</p>
            ) : (
              <div className="space-y-2">
                {data.businesses.slice(0, 10).map((biz) => (
                  <Link
                    key={biz.id}
                    href={`/sales/businesses/${biz.id}`}
                    className="flex items-center justify-between rounded-md border border-border p-2.5 transition-colors hover:bg-accent/30"
                  >
                    <div>
                      <p className="text-xs font-medium">{biz.legalName}</p>
                      <Badge variant="outline" className="text-[9px] mt-0.5">
                        {biz.qualificationStatus.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="text-right">
                      {biz.currentStage && (
                        <StageBadge stageName={biz.currentStage.name} category={biz.currentStage.category} />
                      )}
                      {biz.dealPipeline?.isStalled && (
                        <p className="mt-0.5 text-[10px] text-destructive">Stalled</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Needs Follow-up */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Needs Follow-up</CardTitle>
          </CardHeader>
          <CardContent>
            {needsFollowUp.length === 0 ? (
              <p className="text-xs text-muted-foreground">All businesses are progressing</p>
            ) : (
              <div className="space-y-2">
                {needsFollowUp.map((biz) => (
                  <div key={biz.id} className="rounded-md border border-border p-2.5">
                    <p className="text-xs font-medium">{biz.legalName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {biz.dealPipeline?.isStalled ? "Deal stalled" : "Needs attention"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Leads */}
        <Card className="border-border lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Recent Leads</CardTitle>
              <Link href="/sales/leads" className="text-xs text-muted-foreground hover:text-foreground">Manage leads →</Link>
            </div>
          </CardHeader>
          <CardContent>
            {data.leads.length === 0 ? (
              <p className="text-xs text-muted-foreground">No leads yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Business</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Contact</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.leads.slice(0, 10).map((lead) => (
                      <tr key={lead.id} className="border-b border-border/50">
                        <td className="py-2 font-medium">{lead.businessName}</td>
                        <td className="py-2 text-muted-foreground">{lead.contactName}</td>
                        <td className="py-2">
                          <Badge variant="outline" className={`text-[10px] ${lead.status === "DEAD" ? "text-destructive border-destructive/30" : ""}`}>
                            {lead.status.replace(/_/g, " ")}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

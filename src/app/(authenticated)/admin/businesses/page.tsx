import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { StageBadge } from "@/components/shared/stage-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function AdminBusinessesPage() {
  const session = await auth();
  if (!session || !["ADMINISTRATOR", "SUPER_ADMIN"].includes(session.user.role)) redirect("/login");

  const businesses = await prisma.business.findMany({
    include: {
      currentStage: true,
      sourceSalesRepresentative: { select: { firstName: true, lastName: true } },
      assignedAdministrator: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader title="All Businesses" description={`${businesses.length} businesses in system`} />
      <Card className="border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Business</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Registration</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Stage</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Qualification</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Rep</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Admin</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Spend</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((biz) => (
                  <tr key={biz.id} className="border-b border-border/50 hover:bg-accent/20">
                    <td className="px-4 py-3">
                      <Link href={`/admin/businesses/${biz.id}`} className="font-medium hover:underline">
                        {biz.legalName}
                      </Link>
                      {biz.tradingName && <p className="text-[10px] text-muted-foreground">{biz.tradingName}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{biz.registrationNumber}</td>
                    <td className="px-4 py-3">
                      {biz.currentStage && <StageBadge stageName={biz.currentStage.name} category={biz.currentStage.category} />}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px]">{biz.qualificationStatus.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {biz.sourceSalesRepresentative.firstName} {biz.sourceSalesRepresentative.lastName[0]}.
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {biz.assignedAdministrator ? `${biz.assignedAdministrator.firstName} ${biz.assignedAdministrator.lastName[0]}.` : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      R{biz.monthlyElectricitySpendEstimate?.toLocaleString() ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

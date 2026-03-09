import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { StageBadge } from "@/components/shared/stage-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function SalesBusinessesPage() {
  const session = await auth();
  if (!session || session.user.role !== "SALES_REPRESENTATIVE") redirect("/login");

  const businesses = await prisma.business.findMany({
    where: { sourceSalesRepresentativeId: session.user.id },
    include: {
      currentStage: true,
      dealPipeline: { include: { currentStage: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader title="My Businesses" description={`${businesses.length} attributed businesses`} />

      <Card className="border-border">
        <CardContent className="p-0">
          {businesses.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-xs text-muted-foreground">No businesses yet. Create leads and send invite links.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Business</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Stage</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Qualification</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {businesses.map((biz) => (
                    <tr key={biz.id} className="border-b border-border/50 hover:bg-accent/20">
                      <td className="px-4 py-3">
                        <Link href={`/sales/businesses/${biz.id}`} className="font-medium hover:underline">
                          {biz.legalName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {biz.currentStage && <StageBadge stageName={biz.currentStage.name} category={biz.currentStage.category} />}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px]">{biz.qualificationStatus.replace(/_/g, " ")}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {biz.dealPipeline?.isStalled && <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">Stalled</Badge>}
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
  );
}

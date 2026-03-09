import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getStallReasonDefinitions } from "@/lib/queries";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function StallReasonsPage() {
  const session = await auth();
  if (!session || session.user.role !== "SUPER_ADMIN") redirect("/login");

  const reasons = await getStallReasonDefinitions();

  return (
    <div>
      <PageHeader title="Stall Reason Definitions" description={`${reasons.length} stall reasons configured`} />

      <Card className="border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Code</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Active</th>
                </tr>
              </thead>
              <tbody>
                {reasons.map((reason) => (
                  <tr key={reason.id} className="border-b border-border/50">
                    <td className="px-4 py-2 font-mono text-[10px]">{reason.code}</td>
                    <td className="px-4 py-2 font-medium">{reason.name}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="text-[9px]">{reason.category ?? "—"}</Badge>
                    </td>
                    <td className="px-4 py-2">{reason.isActive ? "Yes" : "No"}</td>
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

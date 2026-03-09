import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getStageDefinitions } from "@/lib/queries";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function StageSettingsPage() {
  const session = await auth();
  if (!session || session.user.role !== "SUPER_ADMIN") redirect("/login");

  const stages = await getStageDefinitions();

  return (
    <div>
      <PageHeader title="Stage Definitions" description={`${stages.length} stages configured`} />

      <Card className="border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Code</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Owner</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Target</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Terminal</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Visible</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((stage) => (
                  <tr key={stage.id} className="border-b border-border/50">
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{stage.orderIndex}</td>
                    <td className="px-4 py-2 font-mono text-[10px]">{stage.code}</td>
                    <td className="px-4 py-2 font-medium">{stage.name}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="text-[9px]">{stage.category.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{stage.ownerRole.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {stage.targetDurationHours ? `${Math.round(stage.targetDurationHours / 24)}d` : "—"}
                    </td>
                    <td className="px-4 py-2">{stage.isTerminal ? "Yes" : "—"}</td>
                    <td className="px-4 py-2">{stage.isCustomerVisible ? "Yes" : "—"}</td>
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

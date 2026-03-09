import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDocumentTypeDefinitions } from "@/lib/queries";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default async function DocumentSettingsPage() {
  const session = await auth();
  if (!session || session.user.role !== "SUPER_ADMIN") redirect("/login");

  const docTypes = await getDocumentTypeDefinitions();

  return (
    <div>
      <PageHeader title="Document Type Definitions" description={`${docTypes.length} document types`} />

      <Card className="border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Code</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Biz Visible</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Rep Visible</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Biz Upload</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Requires Review</th>
                </tr>
              </thead>
              <tbody>
                {docTypes.map((dt) => (
                  <tr key={dt.id} className="border-b border-border/50">
                    <td className="px-4 py-2 font-mono text-[10px]">{dt.code}</td>
                    <td className="px-4 py-2 font-medium">{dt.name}</td>
                    <td className="px-4 py-2">{dt.visibleToBusiness ? "Yes" : "—"}</td>
                    <td className="px-4 py-2">{dt.visibleToSalesRepresentative ? "Yes" : "—"}</td>
                    <td className="px-4 py-2">{dt.canBusinessUpload ? "Yes" : "—"}</td>
                    <td className="px-4 py-2">{dt.requiresReview ? "Yes" : "—"}</td>
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

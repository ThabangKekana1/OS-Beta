import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { businessResources } from "@/lib/resources";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Download, FileText } from "lucide-react";

export default async function BusinessResourcesPage() {
  const session = await auth();
  if (!session || session.user.role !== "BUSINESS_USER") redirect("/login");

  return (
    <div>
      <PageHeader
        title="Resources"
        description="Pre-loaded business documents available for download"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {businessResources.map((resource) => (
          <Card key={resource.href} className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-medium">{resource.title}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{resource.description}</p>
                </div>
                <FileText size={16} className="text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge variant="outline" className="text-[10px]">{resource.fileName}</Badge>
              <a
                href={resource.href}
                download
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full gap-2")}
              >
                <Download size={14} />
                Download
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

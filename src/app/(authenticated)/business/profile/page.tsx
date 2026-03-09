import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getBusinessDashboardData } from "@/lib/queries";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BusinessProfilePage() {
  const session = await auth();
  if (!session || session.user.role !== "BUSINESS_USER") redirect("/login");

  const data = await getBusinessDashboardData(session.user.id);
  if (!data?.business) redirect("/business/dashboard");

  const biz = data.business;

  return (
    <div>
      <PageHeader title="Business Profile" description="Your registered business details" />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Legal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {[
              ["Legal Name", biz.legalName],
              ["Trading Name", biz.tradingName ?? "—"],
              ["Registration Number", biz.registrationNumber],
              ["Industry", biz.industry ?? "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Contact Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {[
              ["Contact Person", biz.contactPersonName],
              ["Email", biz.contactPersonEmail],
              ["Phone", biz.contactPersonPhone ?? "—"],
              ["Address", biz.physicalAddress ?? "—"],
              ["City", biz.city ?? "—"],
              ["Province", biz.province ?? "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Energy Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monthly Electricity Spend Estimate</span>
              <span className="font-medium">R{biz.monthlyElectricitySpendEstimate?.toLocaleString() ?? "—"}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

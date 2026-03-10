import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateLeadForm } from "@/components/sales/create-lead-form";
import { LeadActions } from "@/components/sales/lead-actions";
import { format } from "date-fns";

export default async function LeadsPage() {
  const session = await auth();
  if (!session || session.user.role !== "SALES_REPRESENTATIVE") redirect("/login");

  const leads = await prisma.lead.findMany({
    where: { salesRepresentativeId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  const activeLeads = leads.filter((l) => l.status !== "DEAD");
  const deadLeads = leads.filter((l) => l.status === "DEAD");

  return (
    <div>
      <PageHeader title="My Leads" description={`${activeLeads.length} active leads`} />
      <Card className="mb-4 border-border">
        <CardContent className="p-4">
          <p className="text-xs font-medium">Registration links are not emailed automatically.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Select the invite action to generate the registration link, then copy and send it manually to the prospect.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="border-border">
            <CardContent className="p-0">
              {activeLeads.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-xs text-muted-foreground">No active leads. Create one to get started.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Business</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Contact</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeLeads.map((lead) => (
                        <tr key={lead.id} className="border-b border-border/50 hover:bg-accent/20">
                          <td className="px-4 py-3 font-medium">{lead.businessName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{lead.contactName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{lead.contactEmail}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-[10px]">{lead.status.replace(/_/g, " ")}</Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{format(lead.createdAt, "dd MMM")}</td>
                          <td className="px-4 py-3">
                            <LeadActions leadId={lead.id} status={lead.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {deadLeads.length > 0 && (
            <Card className="mt-4 border-border">
              <CardContent className="p-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Dead Leads ({deadLeads.length})</p>
                <div className="space-y-1">
                  {deadLeads.map((lead) => (
                    <div key={lead.id} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{lead.businessName}</span>
                      <span>{lead.deadReason ?? "No reason"}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <CreateLeadForm />
      </div>
    </div>
  );
}

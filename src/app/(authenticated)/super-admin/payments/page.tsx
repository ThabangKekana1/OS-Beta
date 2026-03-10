import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSuperAdminPaymentsData } from "@/lib/queries";
import { formatCurrencyFromCents, formatPaymentDate } from "@/lib/payments";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock3, CircleCheck, Wallet, Users } from "lucide-react";

export default async function SuperAdminPaymentsPage() {
  const session = await auth();
  if (!session || session.user.role !== "SUPER_ADMIN") redirect("/login");

  const data = await getSuperAdminPaymentsData();

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Track who still needs to be paid and who has already been paid"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Still to Pay"
          value={formatCurrencyFromCents(data.stats.pendingAmountCents)}
          icon={<Clock3 size={16} />}
        />
        <StatCard label="Pending Items" value={data.stats.pendingCount} icon={<Wallet size={16} />} />
        <StatCard
          label="Paid Out"
          value={formatCurrencyFromCents(data.stats.completedAmountCents)}
          icon={<CircleCheck size={16} />}
        />
        <StatCard label="Completed Items" value={data.stats.completedCount} icon={<Users size={16} />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Still to Pay</CardTitle>
              <Badge variant="outline" className="text-[10px]">{data.pendingPayments.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {data.pendingPayments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No pending payments.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Sales Representative</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Business</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Reference</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Due</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pendingPayments.map((payment) => (
                      <tr key={payment.id} className="border-b border-border/50">
                        <td className="py-3 font-medium">{payment.salesRepresentative.firstName} {payment.salesRepresentative.lastName}</td>
                        <td className="py-3 text-muted-foreground">{payment.business?.legalName ?? payment.lead?.businessName ?? "Unlinked"}</td>
                        <td className="py-3 text-muted-foreground">{payment.referenceCode}</td>
                        <td className="py-3 text-muted-foreground">{formatPaymentDate(payment.dueAt)}</td>
                        <td className="py-3 text-right font-medium">{formatCurrencyFromCents(payment.amountCents, payment.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Paid</CardTitle>
              <Badge variant="outline" className="text-[10px]">{data.completedPayments.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {data.completedPayments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No paid items yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Sales Representative</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Business</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Reference</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Paid</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.completedPayments.map((payment) => (
                      <tr key={payment.id} className="border-b border-border/50">
                        <td className="py-3 font-medium">{payment.salesRepresentative.firstName} {payment.salesRepresentative.lastName}</td>
                        <td className="py-3 text-muted-foreground">{payment.business?.legalName ?? payment.lead?.businessName ?? "Unlinked"}</td>
                        <td className="py-3 text-muted-foreground">{payment.referenceCode}</td>
                        <td className="py-3 text-muted-foreground">{formatPaymentDate(payment.paidAt)}</td>
                        <td className="py-3 text-right font-medium">{formatCurrencyFromCents(payment.amountCents, payment.currency)}</td>
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

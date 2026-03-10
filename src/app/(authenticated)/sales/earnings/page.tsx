import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSalesRepEarningsData } from "@/lib/queries";
import { formatCurrencyFromCents, formatPaymentDate } from "@/lib/payments";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, Clock3, CircleCheck, Receipt } from "lucide-react";

export default async function SalesEarningsPage() {
  const session = await auth();
  if (!session || session.user.role !== "SALES_REPRESENTATIVE") redirect("/login");

  const data = await getSalesRepEarningsData(session.user.id);

  return (
    <div>
      <PageHeader
        title="Earnings"
        description="Pending payments and completed payments for your sourced work"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Pending Value"
          value={formatCurrencyFromCents(data.stats.pendingAmountCents)}
          icon={<Clock3 size={16} />}
        />
        <StatCard label="Pending Payments" value={data.stats.pendingCount} icon={<Wallet size={16} />} />
        <StatCard
          label="Paid Value"
          value={formatCurrencyFromCents(data.stats.completedAmountCents)}
          icon={<CircleCheck size={16} />}
        />
        <StatCard
          label="Total Earnings"
          value={formatCurrencyFromCents(data.stats.totalAmountCents)}
          icon={<Receipt size={16} />}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
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
                      <th className="pb-2 text-left font-medium text-muted-foreground">Reference</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Business</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Description</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Due</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pendingPayments.map((payment) => (
                      <tr key={payment.id} className="border-b border-border/50">
                        <td className="py-3 font-medium">{payment.referenceCode}</td>
                        <td className="py-3 text-muted-foreground">{payment.business?.legalName ?? payment.lead?.businessName ?? "Unlinked"}</td>
                        <td className="py-3 text-muted-foreground">{payment.description}</td>
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
              <CardTitle className="text-sm font-medium">Payments Completed</CardTitle>
              <Badge variant="outline" className="text-[10px]">{data.completedPayments.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {data.completedPayments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No completed payments yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Reference</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Business</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Description</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Paid</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.completedPayments.map((payment) => (
                      <tr key={payment.id} className="border-b border-border/50">
                        <td className="py-3 font-medium">{payment.referenceCode}</td>
                        <td className="py-3 text-muted-foreground">{payment.business?.legalName ?? payment.lead?.businessName ?? "Unlinked"}</td>
                        <td className="py-3 text-muted-foreground">{payment.description}</td>
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

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAllUsers } from "@/lib/queries";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMINISTRATOR: "Administrator",
  SALES_REPRESENTATIVE: "Sales Rep",
  BUSINESS_USER: "Business",
};

export default async function UsersPage() {
  const session = await auth();
  if (!session || session.user.role !== "SUPER_ADMIN") redirect("/login");

  const users = await getAllUsers();

  return (
    <div>
      <PageHeader title="User Management" description={`${users.length} users in system`} />

      <Card className="border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Details</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Login</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border/50 hover:bg-accent/20">
                    <td className="px-4 py-3 font-medium">{user.firstName} {user.lastName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px]">{roleLabels[user.role] ?? user.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-[10px] ${user.status === "ACTIVE" ? "border-white/40" : "border-white/10"}`}>
                        {user.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {user.salesRepProfile && `Code: ${user.salesRepProfile.uniqueReferralCode}`}
                      {user.businessUserProfile && `Business: ${user.businessUserProfile.business?.legalName ?? "—"}`}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {user.lastLoginAt ? format(user.lastLoginAt, "dd MMM HH:mm") : "Never"}
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

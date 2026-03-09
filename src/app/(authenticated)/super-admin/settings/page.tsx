import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { ClipboardList, FileText, AlertTriangle, Users } from "lucide-react";

export default async function SettingsPage() {
  const session = await auth();
  if (!session || session.user.role !== "SUPER_ADMIN") redirect("/login");

  const links = [
    { href: "/super-admin/settings/stages", label: "Stage Definitions", desc: "Configure pipeline stages", icon: <ClipboardList size={18} /> },
    { href: "/super-admin/settings/documents", label: "Document Types", desc: "Configure document definitions", icon: <FileText size={18} /> },
    { href: "/super-admin/settings/stall-reasons", label: "Stall Reasons", desc: "Configure stall reason codes", icon: <AlertTriangle size={18} /> },
    { href: "/super-admin/users", label: "User Management", desc: "Manage all users and roles", icon: <Users size={18} /> },
  ];

  return (
    <div>
      <PageHeader title="Settings" description="System configuration" />
      <div className="grid gap-3 md:grid-cols-2">
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            <Card className="border-border transition-colors hover:bg-accent/20">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="text-muted-foreground">{link.icon}</div>
                <div>
                  <p className="text-sm font-medium">{link.label}</p>
                  <p className="text-xs text-muted-foreground">{link.desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

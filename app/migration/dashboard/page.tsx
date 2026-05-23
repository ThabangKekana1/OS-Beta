import type { Metadata } from "next";
import { MigrationDashboard } from "@/components/migration/MigrationDashboard";
import { MigrationShell } from "@/components/migration/MigrationShell";

export const metadata: Metadata = {
  title: "Migration Dashboard | Foundation-1",
};

export default function MigrationDashboardPage() {
  return (
    <MigrationShell>
      <MigrationDashboard />
    </MigrationShell>
  );
}

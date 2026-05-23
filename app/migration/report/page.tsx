import type { Metadata } from "next";
import { MigrationShell } from "@/components/migration/MigrationShell";
import { MigrationReportPageClient } from "@/components/migration/MigrationReportPageClient";

export const metadata: Metadata = {
  title: "Migration Report | Foundation-1",
};

export default function MigrationReportPage() {
  return (
    <MigrationShell>
      <MigrationReportPageClient />
    </MigrationShell>
  );
}

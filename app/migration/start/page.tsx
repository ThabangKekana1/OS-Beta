import type { Metadata } from "next";
import { MigrationShell } from "@/components/migration/MigrationShell";
import { MigrationStart } from "@/components/migration/MigrationStart";

export const metadata: Metadata = {
  title: "Start Migration Assessment | Foundation-1",
};

export default function MigrationStartPage() {
  return (
    <MigrationShell>
      <MigrationStart />
    </MigrationShell>
  );
}

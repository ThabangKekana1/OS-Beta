import type { Metadata } from "next";
import { MigrationHero } from "@/components/migration/MigrationHero";
import { MigrationShell } from "@/components/migration/MigrationShell";

export const metadata: Metadata = {
  title: "Foundation-1 Energy Migration",
  description:
    "Instant utility profile analysis for financed solar and wheeled energy migration.",
};

export default function MigrationPage() {
  return (
    <MigrationShell>
      <MigrationHero />
    </MigrationShell>
  );
}

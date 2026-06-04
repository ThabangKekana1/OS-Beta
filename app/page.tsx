import { MigrationHero } from "@/components/migration/MigrationHero";
import { MigrationShell } from "@/components/migration/MigrationShell";

export const metadata = {
  title: "Foundation-1 Energy Migration",
  description:
    "Instant migration assessment for financed solar and wheeled energy migration.",
};

export default function Page() {
  return (
    <MigrationShell>
      <MigrationHero />
    </MigrationShell>
  );
}

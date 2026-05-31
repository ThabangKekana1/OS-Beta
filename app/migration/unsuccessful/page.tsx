import type { Metadata } from "next";
import { MigrationShell } from "@/components/migration/MigrationShell";
import { MigrationUnsuccessful } from "@/components/migration/MigrationUnsuccessful";

export const metadata: Metadata = {
  title: "Assessment Unsuccessful | Foundation-1",
  description:
    "Foundation-1 Energy Migration qualification result for businesses below the minimum monthly electricity spend threshold.",
};

export default function MigrationUnsuccessfulPage() {
  return (
    <MigrationShell>
      <MigrationUnsuccessful />
    </MigrationShell>
  );
}

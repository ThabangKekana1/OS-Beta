import type { Metadata } from "next";
import { MigrationShell } from "@/components/migration/MigrationShell";
import { MigrationSuccess } from "@/components/migration/MigrationSuccess";

export const metadata: Metadata = {
  title: "Registration Successful | Foundation-1",
};

export default function MigrationSuccessPage() {
  return (
    <MigrationShell>
      <MigrationSuccess />
    </MigrationShell>
  );
}

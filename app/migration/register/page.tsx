import type { Metadata } from "next";
import { MigrationRegister } from "@/components/migration/MigrationRegister";
import { MigrationShell } from "@/components/migration/MigrationShell";

export const metadata: Metadata = {
  title: "Register Migration Assessment | Foundation-1",
};

export default function MigrationRegisterPage() {
  return (
    <MigrationShell>
      <MigrationRegister />
    </MigrationShell>
  );
}

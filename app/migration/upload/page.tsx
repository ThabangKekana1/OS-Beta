import type { Metadata } from "next";
import { MigrationShell } from "@/components/migration/MigrationShell";
import { UtilityUpload } from "@/components/migration/UtilityUpload";

export const metadata: Metadata = {
  title: "Upload Utility Profile | Foundation-1",
};

export default function MigrationUploadPage() {
  return (
    <MigrationShell>
      <UtilityUpload />
    </MigrationShell>
  );
}

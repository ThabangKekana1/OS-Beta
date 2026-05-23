import type { Metadata } from "next";
import { MigrationShell } from "@/components/migration/MigrationShell";
import { ProposalStatus } from "@/components/migration/ProposalStatus";

export const metadata: Metadata = {
  title: "Migration Proposal Status | Foundation-1",
};

export default function MigrationProposalStatusPage() {
  return (
    <MigrationShell>
      <ProposalStatus />
    </MigrationShell>
  );
}

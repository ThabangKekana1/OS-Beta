import type { Metadata } from "next";
import { MigrationShell } from "@/components/migration/MigrationShell";
import { MigrationStart } from "@/components/migration/MigrationStart";
import type { MigrationLeadAttribution } from "@/components/migration/MigrationState";
import { migrationLinkIdFromPathSegment } from "@/lib/registration-links";
import { findLeadByMigrationLinkFromDatabase } from "@/lib/supabase-db-store";

export const metadata: Metadata = {
  title: "Start Migration Assessment | Foundation-1",
};

export const dynamic = "force-dynamic";

export default async function BrandedMigrationEstimatePage({
  params,
}: {
  params: Promise<{ linkId: string }>;
}) {
  const { linkId: pathSegment } = await params;
  const leadLinkId = migrationLinkIdFromPathSegment(pathSegment ?? "");
  let leadAttribution: MigrationLeadAttribution | null = null;

  if (leadLinkId) {
    const lead = await findLeadByMigrationLinkFromDatabase(leadLinkId);
    if (lead) {
      leadAttribution = {
        linkId: leadLinkId,
        leadId: lead.id,
        clientProfileId: lead.clientProfileId,
        company: lead.company,
        contactName: lead.contactName,
        email: lead.userProfile.email,
        phone: lead.userProfile.phone,
      };
    }
  }

  return (
    <MigrationShell>
      <MigrationStart leadAttribution={leadAttribution} />
    </MigrationShell>
  );
}
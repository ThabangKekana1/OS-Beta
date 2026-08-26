import { redirect } from "next/navigation";
import { migrationLinkIdFromPathSegment } from "@/lib/registration-links";
import { findLeadByMigrationLinkFromDatabase } from "@/lib/supabase-db-store";

export const dynamic = "force-dynamic";

const WEBSITE = process.env.NEXT_PUBLIC_WEBSITE_ORIGIN ?? "https://foundation-1.co.za";

/**
 * Admin-issued lead estimate link. The assessment funnel lives on the
 * Foundation-1 website — this route resolves the lead and forwards with
 * attribution so the website intake posts it back into 1-MI.
 */
export default async function BrandedMigrationEstimatePage({
  params,
}: {
  params: Promise<{ linkId: string }>;
}) {
  const { linkId: pathSegment } = await params;
  const leadLinkId = migrationLinkIdFromPathSegment(pathSegment ?? "");

  if (leadLinkId) {
    const lead = await findLeadByMigrationLinkFromDatabase(leadLinkId);
    if (lead) {
      redirect(
        `${WEBSITE}/pricing?utm_source=lead-link&utm_campaign=lead-${encodeURIComponent(
          leadLinkId,
        )}&company=${encodeURIComponent(lead.company)}`,
      );
    }
  }

  redirect(`${WEBSITE}/pricing`);
}
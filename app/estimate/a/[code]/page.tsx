import { redirect } from "next/navigation";
import { cleanReferralCode, findAssociationByCode } from "@/lib/associations";

export const dynamic = "force-dynamic";

const WEBSITE =
  process.env.NEXT_PUBLIC_WEBSITE_ORIGIN ??
  (process.env.NODE_ENV === "development" ? "http://localhost:3001" : "https://foundation-1.co.za");

/**
 * Association member entry: /estimate/a/[code]
 * Verifies the code and forwards to the WEBSITE assessment funnel with
 * attribution carried in the query string (stored on the assessment as
 * source campaign when the website posts intake back into 1-MI).
 */
export default async function AssociationReferralEntry({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = cleanReferralCode(rawCode);
  if (!code) redirect(`${WEBSITE}/pricing`);

  const association = await findAssociationByCode(code);
  if (!association || association.status !== "active") {
    // Unknown code still gets the funnel — never lose the member.
    redirect(`${WEBSITE}/pricing`);
  }

  redirect(
    `${WEBSITE}/pricing?utm_source=association&utm_campaign=assoc-${encodeURIComponent(
      association.referralCode,
    )}&partner=${encodeURIComponent(association.name)}`,
  );
}

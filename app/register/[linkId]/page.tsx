import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const WEBSITE = process.env.NEXT_PUBLIC_WEBSITE_ORIGIN ?? "https://foundation-1.co.za";

/**
 * Legacy public registration link. The 16-screen typeform is retired: the
 * assessment funnel lives on the Foundation-1 website, so this route forwards
 * to /pricing with the link id preserved as attribution (same pattern as
 * app/estimate/[linkId]/page.tsx).
 */
export default async function PublicRegistrationPage({
  params,
}: {
  params: Promise<{ linkId: string }>;
}) {
  const { linkId } = await params;

  if (linkId) {
    redirect(
      `${WEBSITE}/pricing?utm_source=register-link&utm_campaign=register-${encodeURIComponent(linkId)}`,
    );
  }

  redirect(`${WEBSITE}/pricing`);
}

import Link from "next/link";
import { cookies } from "next/headers";
import { PartnerOnboardingFlow } from "@/components/partner/PartnerOnboardingFlow";
import {
  findPartnerOnboardingCompletion,
  findPartnerOnboardingInvite,
  PARTNER_ONBOARDING_COOKIE,
} from "@/lib/partner-distribution/onboarding";

export default async function PartnerOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite = "" } = await searchParams;
  const cookieStore = await cookies();
  const completionToken =
    cookieStore.get(PARTNER_ONBOARDING_COOKIE)?.value ?? "";

  const [invitation, completionContext] = await Promise.all([
    invite ? findPartnerOnboardingInvite(invite).catch(() => null) : null,
    completionToken
      ? findPartnerOnboardingCompletion(completionToken).catch(() => null)
      : null,
  ]);

  if (!invitation && !completionContext) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#050505] px-6 text-white">
        <section className="w-full max-w-xl rounded-[1.75rem] border border-white/12 bg-white/[0.03] p-8 sm:p-10">
          <p className="text-xs uppercase tracking-[0.22em] text-white/42">
            Invitation required
          </p>
          <h1 className="mt-5 text-4xl font-medium tracking-[-0.045em]">
            Partner access is controlled by Foundation-1.
          </h1>
          <p className="mt-5 leading-7 text-white/58">
            This onboarding link is invalid, expired, or already completed.
            Ask Foundation-1 for a new partner invitation.
          </p>
          <Link
            href="/partner/login"
            className="mt-8 inline-flex rounded-xl border border-white/15 px-5 py-3 text-sm"
          >
            Existing partner login
          </Link>
        </section>
      </main>
    );
  }

  return (
    <PartnerOnboardingFlow
      inviteToken={invitation ? invite : null}
      invitedEmail={invitation?.email ?? null}
      completionContext={completionContext}
    />
  );
}


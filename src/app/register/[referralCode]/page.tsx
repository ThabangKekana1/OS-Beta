import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReferralRegistrationForm } from "@/components/public/referral-registration-form";
import { getActiveReferralContext } from "@/lib/referrals";

export default async function ReferralRegistrationPage({
  params,
}: {
  params: Promise<{ referralCode: string }>;
}) {
  const { referralCode } = await params;

  if (!referralCode) {
    notFound();
  }

  const referral = await getActiveReferralContext(referralCode);

  if (
    !referral ||
    referral.user.role !== "SALES_REPRESENTATIVE" ||
    referral.user.status !== "ACTIVE"
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-lg border-border">
          <CardContent className="space-y-4 p-6 text-center">
            <div>
              <h1 className="font-centauri text-xl tracking-[0.28em]">OS-BETA</h1>
              <p className="mt-3 text-sm font-medium">Referral link invalid or inactive</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ask your Sales Representative for a valid registration link.
              </p>
            </div>
            <Link href="/">
              <Button variant="outline">Return to home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="font-centauri text-2xl tracking-[0.28em]">OS-BETA</h1>
          <p className="mt-2 text-sm text-muted-foreground">Business registration</p>
          <p className="mt-3 text-xs text-muted-foreground">
            This registration is linked to {referral.user.firstName} {referral.user.lastName}.
          </p>
        </div>
        <ReferralRegistrationForm
          referralCode={referralCode}
          salesRepresentativeName={`${referral.user.firstName} ${referral.user.lastName}`}
        />
      </div>
    </div>
  );
}

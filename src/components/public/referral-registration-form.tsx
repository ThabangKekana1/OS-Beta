"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { registerBusinessFromReferral } from "@/actions/public-registration-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ReferralRegistrationFormProps {
  referralCode: string;
  salesRepresentativeName: string;
}

export function ReferralRegistrationForm({
  referralCode,
  salesRepresentativeName,
}: ReferralRegistrationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("referralCode", referralCode);

    const email = String(formData.get("contactPersonEmail") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    startTransition(async () => {
      const result = await registerBusinessFromReferral(formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      const signInResult = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        router.push("/login");
        return;
      }

      router.push("/business/dashboard");
      router.refresh();
    });
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-base">Business Registration</CardTitle>
        <p className="text-sm text-muted-foreground">
          Complete registration to continue with {salesRepresentativeName}&rsquo;s referral link.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          {error && (
            <div className="md:col-span-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="legalName" className="text-xs">Legal Name</Label>
            <Input id="legalName" name="legalName" required />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="tradingName" className="text-xs">Trading Name</Label>
            <Input id="tradingName" name="tradingName" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="registrationNumber" className="text-xs">Registration Number</Label>
            <Input id="registrationNumber" name="registrationNumber" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="industry" className="text-xs">Industry</Label>
            <Input id="industry" name="industry" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactPersonName" className="text-xs">Primary Contact</Label>
            <Input id="contactPersonName" name="contactPersonName" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactPersonEmail" className="text-xs">Contact Email</Label>
            <Input id="contactPersonEmail" name="contactPersonEmail" type="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactPersonPhone" className="text-xs">Contact Number</Label>
            <Input id="contactPersonPhone" name="contactPersonPhone" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="monthlyElectricitySpendEstimate" className="text-xs">Monthly Electricity Spend Estimate</Label>
            <Input id="monthlyElectricitySpendEstimate" name="monthlyElectricitySpendEstimate" type="number" min="0" step="0.01" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="physicalAddress" className="text-xs">Physical Address</Label>
            <Input id="physicalAddress" name="physicalAddress" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city" className="text-xs">City</Label>
            <Input id="city" name="city" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="province" className="text-xs">Province</Label>
            <Input id="province" name="province" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="password" className="text-xs">Password</Label>
            <Input id="password" name="password" type="password" minLength={8} required />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Creating account..." : "Register business"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

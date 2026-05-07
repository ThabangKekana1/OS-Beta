"use client";

import { useRouter } from "next/navigation";
import {
  ClientRegistrationForm,
  type RegistrationFormValues,
} from "@/components/registration/ClientRegistrationForm";
import { RegistrationLinkCard } from "@/components/registration/RegistrationLinkCard";

type RegistrationResponse = {
  ok: boolean;
  error?: string;
};

export function PartnerRegistrationRoute({
  defaultOwnerId,
  email,
  partnerOrgName,
}: {
  defaultOwnerId: string;
  email: string;
  partnerOrgName: string | null;
}) {
  const router = useRouter();

  async function handleSubmit(values: RegistrationFormValues) {
    try {
      const response = await fetch("/api/partner/registration", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = (await response.json()) as RegistrationResponse;

      if (!response.ok || !json.ok) {
        return false;
      }

      router.refresh();
      router.push("/partner/clients");
      return true;
    } catch {
      return false;
    }
  }

  return (
    <div className="flex w-full flex-col gap-4 lg:gap-5">
      <RegistrationLinkCard email={email} role="partner" agentId={null} />
      <ClientRegistrationForm
        defaultOwnerId={defaultOwnerId}
        lockOwner
        eyebrow="Partner Registration"
        title="Register a partner client."
        description={
          partnerOrgName
            ? `Capture a complete registered business profile for ${partnerOrgName}. Registered businesses appear under Clients.`
            : "Capture a complete registered business profile. Registered businesses appear under Clients."
        }
        submitLabel="Register Client"
        onSubmit={handleSubmit}
      />
    </div>
  );
}

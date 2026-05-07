"use client";

import { useRouter } from "next/navigation";
import {
  ClientRegistrationForm,
  type RegistrationFormValues,
} from "@/components/registration/ClientRegistrationForm";

type RegistrationResponse = {
  ok: boolean;
  error?: string;
};

export function PartnerRegistrationRoute({
  defaultOwnerId,
  partnerOrgName,
}: {
  defaultOwnerId: string;
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
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import {
  ClientRegistrationForm,
  type RegistrationFormValues,
} from "@/components/registration/ClientRegistrationForm";

export function AdminClientRegistrationRoute({
  leadHrefBase = "/admin/leads",
  clientHrefBase,
  defaultOwnerId,
}: {
  leadHrefBase?: string;
  clientHrefBase?: string;
  defaultOwnerId?: string | null;
}) {
  const router = useRouter();
  const { agents, actorAgentId, createLead } = useAdminPortal();
  const resolvedOwnerId =
    defaultOwnerId ??
    (actorAgentId && agents.some((agent) => agent.id === actorAgentId)
      ? actorAgentId
      : agents[0]?.id ?? "");

  const handleSubmit = (values: RegistrationFormValues) => {
    const createdLead = createLead({
      ...values,
      ownerId: defaultOwnerId ?? values.ownerId,
    });

    if (!createdLead) {
      return false;
    }

    if (clientHrefBase) {
      router.push(`${clientHrefBase}/${createdLead.clientProfileId}`);
      return true;
    }

    router.push(`${leadHrefBase}/${createdLead.leadId}`);
    return true;
  };

  return (
    <ClientRegistrationForm
      agents={agents}
      defaultOwnerId={resolvedOwnerId}
      lockOwner={Boolean(defaultOwnerId)}
      onSubmit={handleSubmit}
    />
  );
}

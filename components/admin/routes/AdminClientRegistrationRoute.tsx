"use client";

import { useRouter } from "next/navigation";
import { useAdminPortal } from "@/components/admin/AdminPortalProvider";
import {
  ClientRegistrationForm,
  type RegistrationFormValues,
} from "@/components/registration/ClientRegistrationForm";
import { RegistrationLinkCard } from "@/components/registration/RegistrationLinkCard";
import type { RegistrationSourceRole } from "@/lib/admin-types";

export function AdminClientRegistrationRoute({
  leadHrefBase = "/admin/leads",
  clientHrefBase,
  defaultOwnerId,
  registrationLinkProfile,
}: {
  leadHrefBase?: string;
  clientHrefBase?: string;
  defaultOwnerId?: string | null;
  registrationLinkProfile?: {
    email: string;
    role: RegistrationSourceRole;
    agentId: string | null;
  } | null;
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
    <div className="flex w-full flex-col gap-4 lg:gap-5">
      {registrationLinkProfile ? (
        <RegistrationLinkCard
          email={registrationLinkProfile.email}
          role={registrationLinkProfile.role}
          agentId={registrationLinkProfile.agentId}
        />
      ) : null}
      <ClientRegistrationForm
        agents={agents}
        defaultOwnerId={resolvedOwnerId}
        lockOwner={Boolean(defaultOwnerId)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

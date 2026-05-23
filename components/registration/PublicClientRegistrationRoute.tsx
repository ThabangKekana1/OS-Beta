"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ClientRegistrationForm,
  type RegistrationFormValues,
} from "@/components/registration/ClientRegistrationForm";
import { EnergyWaitingRoomBackground } from "@/components/registration/EnergyWaitingRoomBackground";

type PublicClientRegistrationRouteProps = {
  linkId?: string | null;
};

export function PublicClientRegistrationRoute({ linkId = null }: PublicClientRegistrationRouteProps) {
  const [linkOwner, setLinkOwner] = useState<string | null>(null);
  const [isInvalid, setIsInvalid] = useState(false);
  const [registeredProfileId, setRegisteredProfileId] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<Partial<RegistrationFormValues>>({});

  useEffect(() => {
    if (!linkId) {
      return;
    }

    let cancelled = false;

    const loadLink = async () => {
      const response = await fetch(`/api/register/${encodeURIComponent(linkId)}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        source?: { profileName?: string };
        lead?: Partial<RegistrationFormValues> | null;
      } | null;

      if (cancelled) {
        return;
      }

      if (!response.ok || !payload?.ok || !payload.source?.profileName) {
        setIsInvalid(true);
        return;
      }

      setLinkOwner(payload.source.profileName);
      setInitialValues(payload.lead ?? {});
    };

    void loadLink();

    return () => {
      cancelled = true;
    };
  }, [linkId]);

  const handleSubmit = async (values: RegistrationFormValues) => {
    const endpoint = linkId ? `/api/register/${encodeURIComponent(linkId)}` : "/api/register";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify(values),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      clientProfileId?: string;
    } | null;

    if (!response.ok || !payload?.ok || !payload.clientProfileId) {
      return false;
    }

    setRegisteredProfileId(payload.clientProfileId);
    return true;
  };

  if (isInvalid) {
    return (
      <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-black px-6 text-white">
        <EnergyWaitingRoomBackground />
        <section className="app-surface relative z-10 max-w-xl rounded-[1.6rem] p-6 text-center">
          <p className="line-label">Client Registration</p>
          <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em]">
            Registration link not found
          </h1>
          <p className="mt-3 text-sm leading-7 text-white/62">
            This registration link is invalid or has been removed.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-full border border-white/14 px-5 py-2 text-xs uppercase tracking-[0.2em] text-white/72"
          >
            Return to 1OS
          </Link>
        </section>
      </div>
    );
  }

  if (registeredProfileId) {
    return (
      <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-black px-6 text-white">
        <EnergyWaitingRoomBackground />
        <section className="app-surface relative z-10 max-w-xl rounded-[1.6rem] p-6 text-center">
          <p className="line-label">Client Registration</p>
          <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em]">
            Registration submitted
          </h1>
          <p className="mt-3 text-sm leading-7 text-white/62">
            Your profile number is {registeredProfileId}. The 1OS team will continue the onboarding workflow.
          </p>
        </section>
      </div>
    );
  }

  return (
    <ClientRegistrationForm
        key={`${linkId ?? "generic"}-${linkOwner ?? "loading"}`}
        defaultOwnerId="public-link"
        lockOwner
        initialValues={initialValues}
        storageKey={`oneos:registration:${linkId ?? "generic"}`}
        eyebrow="Foundation-1 Registration"
        title={
          linkOwner ? (
            `Complete registration for ${linkOwner}`
          ) : (
            <>
              Register your business for{" "}
              <span className="whitespace-nowrap">zero-cost solar.</span>
            </>
          )
        }
        description={linkId
          ? "This secure form is connected to your dedicated Foundation-1 profile. Complete it once and your dashboard profile is updated automatically."
          : "For businesses discovering Foundation-1 directly, this creates a new dashboard profile for the team to qualify and continue onboarding."}
        submitLabel="Submit Registration"
        onSubmit={handleSubmit}
      />
  );
}

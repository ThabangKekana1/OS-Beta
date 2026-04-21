"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ClientRegistrationForm,
  type RegistrationFormValues,
} from "@/components/registration/ClientRegistrationForm";

type PublicClientRegistrationRouteProps = {
  linkId: string;
};

export function PublicClientRegistrationRoute({ linkId }: PublicClientRegistrationRouteProps) {
  const [linkOwner, setLinkOwner] = useState<string | null>(null);
  const [isInvalid, setIsInvalid] = useState(false);
  const [registeredProfileId, setRegisteredProfileId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadLink = async () => {
      const response = await fetch(`/api/register/${encodeURIComponent(linkId)}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        source?: { profileName?: string };
      } | null;

      if (cancelled) {
        return;
      }

      if (!response.ok || !payload?.ok || !payload.source?.profileName) {
        setIsInvalid(true);
        return;
      }

      setLinkOwner(payload.source.profileName);
    };

    void loadLink();

    return () => {
      cancelled = true;
    };
  }, [linkId]);

  const handleSubmit = async (values: RegistrationFormValues) => {
    const response = await fetch(`/api/register/${encodeURIComponent(linkId)}`, {
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
      <div className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <section className="app-surface max-w-xl rounded-[1.6rem] p-6 text-center">
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
      <div className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <section className="app-surface max-w-xl rounded-[1.6rem] p-6 text-center">
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
    <main className="min-h-screen bg-black px-4 py-6 text-white lg:px-8">
      <ClientRegistrationForm
        defaultOwnerId="public-link"
        lockOwner
        eyebrow="Client Registration"
        title={linkOwner ? `Register with ${linkOwner}` : "Client registration"}
        description="Complete the onboarding registration form. This link is assigned to the 1OS profile that sent it to you."
        submitLabel="Submit Registration"
        onSubmit={handleSubmit}
      />
    </main>
  );
}

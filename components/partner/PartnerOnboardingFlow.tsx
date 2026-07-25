"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  extractPartnerInviteEmails,
  mergePartnerInvites,
  type ParsedPartnerInvite,
} from "@/lib/partner-distribution/invitations";
import {
  PARTNER_TYPES,
  type PartnerType,
} from "@/lib/partner-distribution/types";

const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  association: "Association",
  cooperative: "Cooperative",
  government_programme: "Government Programme",
  consultant: "Consultant",
  introducer: "Introducer",
};

type CompletionContext = {
  email: string;
  referralCode: string;
};

export function PartnerOnboardingFlow({
  inviteToken,
  invitedEmail,
  completionContext,
}: {
  inviteToken: string | null;
  invitedEmail: string | null;
  completionContext: CompletionContext | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(
    completionContext ? 3 : 1,
  );
  const [partnerType, setPartnerType] =
    useState<PartnerType>("association");
  const [organisationName, setOrganisationName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState(
    completionContext?.email ?? invitedEmail ?? "",
  );
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(
    completionContext?.referralCode ?? "",
  );
  const [pastedEmails, setPastedEmails] = useState("");
  const [csvInvitations, setCsvInvitations] = useState<
    ParsedPartnerInvite[]
  >([]);
  const [emailConfirmationRequired, setEmailConfirmationRequired] =
    useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const invitations = useMemo(
    () =>
      mergePartnerInvites(
        extractPartnerInviteEmails(pastedEmails, "paste"),
        csvInvitations,
      ),
    [csvInvitations, pastedEmails],
  );

  const startAccount = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!inviteToken) {
      setError("This Foundation-1 invitation is no longer available.");
      return;
    }
    if (password.length < 12) {
      setError("Use a password with at least 12 characters.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const normalizedEmail = email.trim().toLowerCase();
      const emailRedirectTo =
        `${window.location.origin}/auth/confirm?next=/partner`;
      let authUserId: string | null = null;
      let hasSession = false;

      const signUpResult = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo,
          data: { full_name: contactName.trim() },
        },
      });

      if (
        signUpResult.error
        && !/already|registered|exists/i.test(signUpResult.error.message)
      ) {
        throw signUpResult.error;
      }

      if (
        signUpResult.data.user
        && (signUpResult.data.user.identities?.length ?? 1) > 0
      ) {
        authUserId = signUpResult.data.user.id;
        hasSession = Boolean(signUpResult.data.session);
      } else {
        const signInResult = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (signInResult.error || !signInResult.data.user) {
          throw new Error(
            signUpResult.error?.message
            || "This email already has an account. Enter its existing password.",
          );
        }
        authUserId = signInResult.data.user.id;
        hasSession = Boolean(signInResult.data.session);
      }

      if (signUpResult.error && !authUserId) {
        throw signUpResult.error;
      }

      const response = await fetch("/api/partner/onboarding/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteToken,
          authUserId,
          email: normalizedEmail,
          contactName,
          organisationName,
          partnerType,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        referralCode?: string;
        emailConfirmationRequired?: boolean;
      };
      if (!response.ok || !payload.ok || !payload.referralCode) {
        throw new Error(payload.error ?? "Unable to start onboarding.");
      }

      setReferralCode(payload.referralCode);
      setEmailConfirmationRequired(
        payload.emailConfirmationRequired ?? !hasSession,
      );
      window.history.replaceState(
        {},
        document.title,
        "/partner/onboarding",
      );
      setStep(3);
    } catch (onboardingError) {
      setError(
        onboardingError instanceof Error
          ? onboardingError.message
          : "Unable to start partner onboarding.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const readCsv = async (file: File | null) => {
    if (!file) return;
    if (file.size > 1_000_000) {
      setError("CSV files must be smaller than 1 MB.");
      return;
    }
    const text = await file.text();
    const parsed = extractPartnerInviteEmails(text, "csv");
    if (parsed.length === 0) {
      setError("No valid email addresses were found in that CSV.");
      return;
    }
    setError(null);
    setCsvInvitations(parsed);
  };

  const finishOnboarding = async () => {
    if (invitations.length === 0) {
      setError("Add at least one valid member email.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/partner/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitations }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        email?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error ?? "Unable to complete partner onboarding.",
        );
      }

      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      if (data.session && !emailConfirmationRequired) {
        router.replace("/partner");
        router.refresh();
        return;
      }
      router.replace(
        `/partner/login?email=${encodeURIComponent(payload.email ?? email)}&notice=confirm`,
      );
    } catch (onboardingError) {
      setError(
        onboardingError instanceof Error
          ? onboardingError.message
          : "Unable to complete partner onboarding.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#050505] px-5 py-8 text-white sm:px-8 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-white/45">
              Foundation-1
            </p>
            <p className="mt-2 text-lg font-medium">Migration Leaders</p>
          </div>
          <p className="text-sm text-white/48">Step {step} of 3</p>
        </header>

        <section className="mx-auto mt-12 max-w-3xl">
          {step === 1 ? (
            <>
              <p className="text-sm text-lime-300">Screen one</p>
              <h1 className="mt-4 text-4xl font-medium tracking-[-0.045em] sm:text-6xl">
                Who are you?
              </h1>
              <div className="mt-10 grid gap-3 sm:grid-cols-2">
                {PARTNER_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPartnerType(type)}
                    className={`rounded-2xl border px-5 py-5 text-left text-lg transition ${
                      partnerType === type
                        ? "border-lime-300 bg-lime-300 text-black"
                        : "border-white/12 bg-white/[0.03] text-white hover:border-white/30"
                    }`}
                  >
                    {PARTNER_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="mt-8 rounded-xl bg-white px-6 py-3 font-medium text-black"
              >
                Continue
              </button>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className="text-sm text-lime-300">Screen two</p>
              <h1 className="mt-4 text-4xl font-medium tracking-[-0.045em] sm:text-6xl">
                Create your partner account.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/58">
                Access is invitation-only. Your password is stored and secured
                by Supabase; Foundation-1 never receives it.
              </p>
              <form className="mt-10 space-y-5" onSubmit={startAccount}>
                <Field
                  label="Organisation Name"
                  value={organisationName}
                  onChange={setOrganisationName}
                  autoComplete="organization"
                />
                <Field
                  label="Contact Person"
                  value={contactName}
                  onChange={setContactName}
                  autoComplete="name"
                />
                <Field
                  label="Email"
                  value={email}
                  onChange={setEmail}
                  type="email"
                  autoComplete="email"
                  disabled={Boolean(invitedEmail)}
                />
                <Field
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  hint="At least 12 characters."
                />
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-xl border border-white/15 px-5 py-3 text-white/72"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-xl bg-white px-6 py-3 font-medium text-black disabled:opacity-50"
                  >
                    {isSubmitting ? "Creating account..." : "Continue"}
                  </button>
                </div>
              </form>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <p className="text-sm text-lime-300">Screen three</p>
              <h1 className="mt-4 text-4xl font-medium tracking-[-0.045em] sm:text-6xl">
                Invite your first members.
              </h1>
              <p className="mt-5 text-base leading-7 text-white/58">
                Add up to 100 member emails. CSV content is processed in your
                browser and is never stored as a file.
              </p>

              <label className="mt-10 block">
                <span className="text-xs uppercase tracking-[0.18em] text-white/48">
                  Paste Emails
                </span>
                <textarea
                  value={pastedEmails}
                  onChange={(event) => setPastedEmails(event.target.value)}
                  rows={7}
                  placeholder="member@business.co.za"
                  className="admin-input mt-3 w-full rounded-2xl px-4 py-4"
                />
              </label>

              <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-white/12 bg-white/[0.03] p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">Upload CSV</p>
                  <p className="mt-1 text-sm text-white/48">
                    Any column layout. Email addresses are extracted locally.
                  </p>
                </div>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) =>
                    void readCsv(event.target.files?.[0] ?? null)
                  }
                  className="max-w-full text-sm text-white/65"
                />
              </div>

              <div className="mt-5 rounded-2xl border border-white/12 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-white/42">
                  Partner campaign code
                </p>
                <p className="mt-2 font-mono text-lg text-white">
                  {referralCode}
                </p>
                <p className="mt-2 text-sm text-white/45">
                  Foundation-1 activates the public campaign link after its
                  attribution path is verified.
                </p>
              </div>

              <div className="mt-7 flex items-center justify-between gap-4">
                <p className="text-sm text-white/55">
                  {invitations.length} unique member
                  {invitations.length === 1 ? "" : "s"} ready
                </p>
                <button
                  type="button"
                  onClick={() => void finishOnboarding()}
                  disabled={isSubmitting}
                  className="rounded-xl bg-lime-300 px-6 py-3 font-medium text-black disabled:opacity-50"
                >
                  {isSubmitting ? "Finishing..." : "Finish"}
                </button>
              </div>
            </>
          ) : null}

          {error ? (
            <p className="mt-6 rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  disabled = false,
  minLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  disabled?: boolean;
  minLength?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.18em] text-white/48">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        minLength={minLength}
        required
        className="admin-input mt-2 w-full rounded-xl px-4 py-3 disabled:opacity-55"
      />
      {hint ? (
        <span className="mt-2 block text-xs text-white/42">{hint}</span>
      ) : null}
    </label>
  );
}

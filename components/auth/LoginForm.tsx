"use client";

import { resolveDefaultRouteForRole, type UserRole } from "@/lib/auth";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LoginVariant = "admin" | "sales" | "partner";

const LOGIN_COPY: Record<
  LoginVariant,
  {
    heroEyebrow: string;
    heroTitle: string;
    heroDescription: string;
    formEyebrow: string;
    formTitle: string;
    footer: string;
  }
> = {
  admin: {
    heroEyebrow: "Admin access",
    heroTitle: "Log in to the 1OS admin portal.",
    heroDescription:
      "Use your admin credentials to manage leads, client profiles, and inbox workflow operations.",
    formEyebrow: "Admin sign in",
    formTitle: "Continue to admin portal",
    footer: "Need admin access? Ask an existing administrator to provision your role.",
  },
  sales: {
    heroEyebrow: "Sales access",
    heroTitle: "Log in to the 1OS sales portal.",
    heroDescription:
      "Use your sales credentials to manage your lead book, outreach, and inbox workflow.",
    formEyebrow: "Sales sign in",
    formTitle: "Continue to sales portal",
    footer: "Need sales access? Ask an administrator to provision your profile.",
  },
  partner: {
    heroEyebrow: "Partner access",
    heroTitle: "Your members, and where each one has reached.",
    heroDescription:
      "Sign in to see every member who started an assessment through your link, the stage they are at, and what Foundation-1 is doing next.",
    formEyebrow: "Partner sign in",
    formTitle: "Continue to your members",
    footer:
      "Partner accounts are invitation-only and are provisioned by Foundation-1.",
  },
};

export function LoginForm({
  nextPath,
  variant,
  initialError,
  initialEmail,
  initialNotice,
}: {
  nextPath: string | null;
  variant: LoginVariant;
  initialError?: string | null;
  initialEmail?: string | null;
  initialNotice?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const copy = LOGIN_COPY[variant];

  useEffect(() => {
    const signupEmail = searchParams.get("email");
    if (signupEmail) {
      setEmail(signupEmail);
    }
  }, [searchParams]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: supabaseData, error: supabaseError } =
        await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

      if (supabaseData?.session) {
        if (variant === "partner") {
          const profileResponse = await fetch("/api/auth/me", {
            headers: {
              Authorization: `Bearer ${supabaseData.session.access_token}`,
            },
          });
          const profilePayload = (await profileResponse.json()) as {
            session?: { role?: string } | null;
          };
          if (profilePayload.session?.role !== "partner") {
            await supabase.auth.signOut();
            setError(
              "This account does not have active Foundation-1 partner access.",
            );
            return;
          }
        }

        await fetch("/api/auth/login-event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-1os-api-client": "dashboard",
            Authorization: `Bearer ${supabaseData.session.access_token}`,
          },
          body: JSON.stringify({ eventType: "login" }),
        }).catch((auditError) => {
          console.error("[auth] login audit failed", auditError);
        });
        let destination = nextPath;
        if (!destination) {
          if (variant === "partner") {
            destination = "/partner";
          } else {
            try {
              const meResponse = await fetch("/api/auth/me", {
                headers: { Authorization: `Bearer ${supabaseData.session.access_token}` },
              });
              const mePayload = (await meResponse.json()) as { session?: { role?: string } | null };
              destination = resolveDefaultRouteForRole((mePayload.session?.role as UserRole) ?? "client");
            } catch {
              destination = "/migration/dashboard";
            }
          }
        }
        router.replace(destination);
        router.refresh();
        return;
      }

      if (
        supabaseError &&
        /confirm|verif/i.test(supabaseError.message) &&
        !/invalid/i.test(supabaseError.message)
      ) {
        setError(
          "Please confirm your email address first. Check your inbox for the confirmation link.",
        );
        return;
      }

      setError(supabaseError?.message ?? "Login failed. Please try again.");
    } catch (loginError) {
      console.error("[auth] login request failed", loginError);
      const message =
        loginError instanceof Error && loginError.message.trim()
          ? loginError.message
          : "Unknown browser or network error";
      setError(`Unable to reach login service: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen w-full overflow-hidden bg-[#060606] lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative flex min-h-[42vh] items-center border-b border-white/10 px-6 py-10 sm:px-10 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-14 lg:py-14">
        <div className="relative mx-auto w-full max-w-2xl">
          <span className="inline-flex flex-col items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/foundation-1-wordmark.png"
              alt="Foundation-1"
              width={163}
              height={9}
              className="h-[9px] w-[163px]"
            />
          </span>
          <p className="mt-10 font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">{copy.heroEyebrow}</p>
          <h1 className="mt-4 text-[clamp(1.9rem,3.2vw,2.9rem)] font-medium leading-[1.02] tracking-[-0.05em] text-white">
            {copy.heroTitle}
          </h1>
          <p className="mt-5 max-w-xl text-[13px] leading-7 text-white/50">
            {copy.heroDescription}
          </p>
        </div>
      </section>

      <section className="flex min-h-[50vh] items-center px-6 py-10 sm:px-10 lg:min-h-screen lg:px-14 lg:py-14">
        <div className="mx-auto w-full max-w-[26rem] rounded-[9px] border border-white/14 bg-[#0c0c0c] p-6 sm:p-7">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">{copy.formEyebrow}</p>
          <h2 className="mt-3 text-[20px] font-medium tracking-[-0.04em] text-white">
            {copy.formTitle}
          </h2>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            {initialNotice ? (
              <p className="rounded-[6px] border border-white/20 bg-white/[0.06] px-3 py-2 text-[12px] text-white/80">
                {initialNotice}
              </p>
            ) : null}
            <div>
              <label className="mb-2 block font-mono text-[9px] uppercase tracking-[0.15em] text-white/45" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-[6px] border border-white/16 bg-white/[0.05] px-3 text-[13px] text-white outline-none transition placeholder:text-white/25 focus:border-white/55"
                placeholder="name@organisation.co.za"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="mb-2 block font-mono text-[9px] uppercase tracking-[0.15em] text-white/45" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-[6px] border border-white/16 bg-white/[0.05] px-3 text-[13px] text-white outline-none transition placeholder:text-white/25 focus:border-white/55"
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
            </div>

            {error ? (
              <p className="rounded-[6px] border border-red-300/25 bg-red-400/10 px-3 py-2 text-[12px] text-red-100" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-11 w-full items-center justify-center rounded-[6px] bg-white text-[12px] font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isSubmitting ? "Signing in" : "Sign in"}
            </button>
          </form>

          <p className="mt-5 text-center text-[10px] leading-5 text-white/30">{copy.footer}</p>
        </div>
      </section>
    </div>
  );
}

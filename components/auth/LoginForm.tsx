"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LoginVariant = "admin" | "sales";

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
};

export function LoginForm({
  nextPath,
  variant,
  initialError,
}: {
  nextPath: string | null;
  variant: LoginVariant;
  initialError?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
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
        router.replace(nextPath ?? "/");
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
    <div className="grid min-h-screen w-full overflow-hidden bg-[#050505] lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative flex min-h-[50vh] items-center border-b border-white/10 px-6 py-10 sm:px-10 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-14 lg:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_22%,rgba(62,153,255,0.23),transparent_36%),radial-gradient(circle_at_78%_75%,rgba(248,250,252,0.15),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(0,0,0,0.55)_100%)]" />

        <div className="relative mx-auto w-full max-w-2xl">
          <p className="line-label">{copy.heroEyebrow}</p>
          <h1 className="mt-5 text-[clamp(2rem,4.4vw,4.6rem)] font-medium leading-[0.98] tracking-[-0.05em] text-white">
            {copy.heroTitle}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-white/66">
            {copy.heroDescription}
          </p>
        </div>
      </section>

      <section className="flex min-h-[50vh] items-center px-6 py-10 sm:px-10 lg:min-h-screen lg:px-14 lg:py-14">
        <div className="mx-auto w-full max-w-[34rem] rounded-[1.6rem] border border-white/12 bg-black/50 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.52)] backdrop-blur-xl sm:p-8">
          <p className="line-label">{copy.formEyebrow}</p>
          <h2 className="mt-3 text-2xl font-medium tracking-[-0.04em] text-white">
            {copy.formTitle}
          </h2>

          <form className="space-y-5" onSubmit={onSubmit}>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-white/54" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="admin-input w-full rounded-xl px-3 py-2.5 text-sm"
                placeholder="adalove@email.com"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-white/54" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="admin-input w-full rounded-xl px-3 py-2.5 text-sm"
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
            </div>

            {error ? (
              <p className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl border border-white/18 bg-white/95 px-3 py-2.5 text-sm font-medium text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-white/55">{copy.footer}</p>
        </div>
      </section>
    </div>
  );
}

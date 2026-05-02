"use client";

import Link from "next/link";
import { useState } from "react";

export function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        requiresConfirmation?: boolean;
        email?: string;
      };

      if (!response.ok || payload.ok === false) {
        setError(payload.error ?? "Could not create your account. Please try again.");
        return;
      }

      setVerifyEmail(payload.email ?? email.trim());
    } catch {
      setError("Unable to reach the sign-up service. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (verifyEmail) {
    return (
      <div className="grid min-h-screen w-full place-items-center bg-[#050505] px-6 py-10">
        <div className="w-full max-w-[34rem] rounded-[1.6rem] border border-white/12 bg-black/50 p-8 text-white shadow-[0_30px_120px_rgba(0,0,0,0.52)] backdrop-blur-xl">
          <p className="line-label">Check your inbox</p>
          <h2 className="mt-3 text-2xl font-medium tracking-[-0.04em]">
            Confirm your email to finish signing up
          </h2>
          <p className="mt-5 text-sm leading-7 text-white/70">
            We just sent a confirmation link to{" "}
            <span className="font-medium text-white">{verifyEmail}</span>. Click the link in that
            email to activate your account, then come back and log in.
          </p>
          <p className="mt-3 text-xs text-white/45">
            The email may take a minute to arrive. If you don&apos;t see it, check your spam folder.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="flex-1 rounded-xl border border-white/18 bg-white px-3 py-2.5 text-center text-sm font-medium text-black transition hover:bg-white/90"
            >
              Go to log in
            </Link>
            <Link
              href="/"
              className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-center text-sm font-medium text-white transition hover:bg-white/10"
            >
              Back to 1OS
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen w-full overflow-hidden bg-[#050505] lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative flex min-h-[50vh] items-center border-b border-white/10 px-6 py-10 sm:px-10 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-14 lg:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_22%,rgba(62,153,255,0.23),transparent_36%),radial-gradient(circle_at_78%_75%,rgba(248,250,252,0.15),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(0,0,0,0.55)_100%)]" />

        <div className="relative mx-auto w-full max-w-2xl">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-white/55 transition hover:text-white"
          >
            ← Back to 1OS
          </Link>
          <p className="line-label mt-6">Create your account</p>
          <h1 className="mt-5 text-[clamp(2rem,4.4vw,4.6rem)] font-medium leading-[0.98] tracking-[-0.05em] text-white">
            Talk to Dawn and start your migration off Eskom.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-white/66">
            Your account unlocks the conversation with Dawn — the Foundation-1 migration agent —
            and gives you a private workspace where your case, documents, and migration plan live.
          </p>
        </div>
      </section>

      <section className="flex min-h-[50vh] items-center px-6 py-10 sm:px-10 lg:min-h-screen lg:px-14 lg:py-14">
        <div className="mx-auto w-full max-w-[34rem] rounded-[1.6rem] border border-white/12 bg-black/50 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.52)] backdrop-blur-xl sm:p-8">
          <p className="line-label">Sign up</p>
          <h2 className="mt-3 text-2xl font-medium tracking-[-0.04em] text-white">
            Create your 1OS account
          </h2>

          <form className="space-y-5" onSubmit={onSubmit}>
            <div>
              <label
                className="mb-2 block text-xs uppercase tracking-[0.18em] text-white/54"
                htmlFor="name"
              >
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="admin-input w-full rounded-xl px-3 py-2.5 text-sm"
                placeholder="Your name"
                autoComplete="name"
              />
            </div>

            <div>
              <label
                className="mb-2 block text-xs uppercase tracking-[0.18em] text-white/54"
                htmlFor="email"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="admin-input w-full rounded-xl px-3 py-2.5 text-sm"
                placeholder="adalove@email.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label
                className="mb-2 block text-xs uppercase tracking-[0.18em] text-white/54"
                htmlFor="password"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="admin-input w-full rounded-xl px-3 py-2.5 text-sm"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
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
              {isSubmitting ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-white/55">
            Already have an account?{" "}
            <Link href="/login" className="text-white underline-offset-4 hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}

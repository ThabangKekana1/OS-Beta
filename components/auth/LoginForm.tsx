"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ nextPath }: { nextPath: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        redirectTo?: string;
      };

      if (!response.ok || !payload.ok || !payload.redirectTo) {
        setError(payload.error ?? "Login failed. Please try again.");
        return;
      }

      router.replace(nextPath ?? payload.redirectTo);
      router.refresh();
    } catch {
      setError("Unable to reach login service. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen w-full overflow-hidden bg-[#050505] lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative flex min-h-[50vh] items-center border-b border-white/10 px-6 py-10 sm:px-10 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-14 lg:py-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_22%,rgba(62,153,255,0.23),transparent_36%),radial-gradient(circle_at_78%_75%,rgba(248,250,252,0.15),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(0,0,0,0.55)_100%)]" />

        <div className="relative mx-auto w-full max-w-2xl">
          <p className="line-label">1OS Identity Layer</p>
          <h1 className="mt-5 text-[clamp(2.2rem,4.8vw,5.4rem)] font-medium leading-[0.96] tracking-[-0.06em] text-white">
            Secure sign-in for your operations workspace
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-white/66">
            Access is role-based. Admin profiles open command-level oversight while sales profiles open the dedicated sales execution dashboard.
          </p>
        </div>
      </section>

      <section className="flex min-h-[50vh] items-center px-6 py-10 sm:px-10 lg:min-h-screen lg:px-14 lg:py-14">
        <div className="mx-auto w-full max-w-[34rem] rounded-[1.6rem] border border-white/12 bg-black/50 p-6 shadow-[0_30px_120px_rgba(0,0,0,0.52)] backdrop-blur-xl sm:p-8">
          <p className="line-label">Sign in</p>
          <h2 className="mt-3 text-2xl font-medium tracking-[-0.04em] text-white">
            Continue to dashboard
          </h2>

          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
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
                placeholder="you@1os.foundation-1.co.za"
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
              className="w-full rounded-xl border border-white/18 bg-white px-3 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

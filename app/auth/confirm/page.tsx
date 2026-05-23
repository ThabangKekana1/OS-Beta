"use client";

import type { EmailOtpType } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { sanitizeNextPath } from "@/lib/url";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function resolveNextPath(searchParams: URLSearchParams) {
  const next = sanitizeNextPath(searchParams.get("next"), "/admin");
  if (next !== "/admin") {
    return next;
  }

  const redirectTo = searchParams.get("redirect_to");
  if (!redirectTo) {
    return next;
  }

  try {
    const redirectUrl = new URL(redirectTo, window.location.origin);
    if (redirectUrl.origin !== window.location.origin) {
      return next;
    }
    return sanitizeNextPath(
      `${redirectUrl.pathname}${redirectUrl.search}`,
      next,
    );
  } catch {
    return next;
  }
}

export default function AuthConfirmPage() {
  const [status, setStatus] = useState("Signing you in to 1OS…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function completeConfirmation() {
      const supabase = createSupabaseBrowserClient();
      const searchParams = new URLSearchParams(window.location.search);
      const nextPath = resolveNextPath(searchParams);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      try {
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) {
            throw sessionError;
          }
        } else {
          const tokenHash = searchParams.get("token_hash");
          const type = searchParams.get("type") as EmailOtpType | null;

          if (tokenHash && type) {
            const { error: otpError } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type,
            });
            if (otpError) {
              throw otpError;
            }
          } else {
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (!session) {
              throw new Error("No verification session was returned.");
            }
          }
        }

        if (cancelled) {
          return;
        }

        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.replace(nextPath);
      } catch (authError) {
        if (cancelled) {
          return;
        }
        const message =
          authError instanceof Error
            ? authError.message
            : "We could not complete email verification.";
        setStatus("Verification failed");
        setError(message);
      }
    }

    void completeConfirmation();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid min-h-screen place-items-center bg-[#050505] px-6 py-10 text-white">
      <div className="w-full max-w-[34rem] rounded-[1.6rem] border border-white/12 bg-black/50 p-8 shadow-[0_30px_120px_rgba(0,0,0,0.52)] backdrop-blur-xl">
        <p className="line-label">Email verification</p>
        <h1 className="mt-3 text-2xl font-medium tracking-[-0.04em] text-white">{status}</h1>
        <p className="mt-4 text-sm leading-7 text-white/68">
          {error
            ? "Your verification link could not be completed automatically."
            : "We’re opening the 1OS admin dashboard."}
        </p>
        {error ? (
          <p className="mt-4 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

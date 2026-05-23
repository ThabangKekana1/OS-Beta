"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSignOut = async () => {
    setIsSubmitting(true);

    try {
      await fetch("/api/auth/login-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-1os-api-client": "dashboard",
        },
        body: JSON.stringify({ eventType: "logout" }),
      }).catch(() => undefined);
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      router.push("/login");
      router.refresh();
      setIsSubmitting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onSignOut}
      disabled={isSubmitting}
      className={className ?? "inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-white/78 transition hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"}
    >
      <LogOut className="size-3.5" />
      {isSubmitting ? "Signing out" : "Sign out"}
    </button>
  );
}

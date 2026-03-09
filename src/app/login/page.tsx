"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardRoute } from "@/lib/dashboard-routes";

function getLoginErrorMessage(error: string | undefined) {
  if (!error) return "";
  if (error === "CredentialsSignin") {
    return "Invalid email, password, or inactive account";
  }
  return "Authentication service unavailable. Check the database connection and try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(getLoginErrorMessage(result.error));
        setLoading(false);
        return;
      }

      const res = await fetch("/api/auth/session");
      const session = await res.json();
      const dashboardRoute = getDashboardRoute(session?.user?.role);

      if (!dashboardRoute) {
        setError("Your account role is invalid. Contact an administrator.");
        setLoading(false);
        return;
      }

      router.push(dashboardRoute);
    } catch {
      setError("Authentication service unavailable. Check the database connection and try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Shield size={32} className="mx-auto mb-3 text-primary" />
          <h1 className="text-lg font-semibold">Foundation-1</h1>
          <p className="text-xs text-muted-foreground">Pilot Command Centre</p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            One application with role-based dashboard access.
          </p>
        </div>
        <Card className="border-border">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@foundation1.test"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

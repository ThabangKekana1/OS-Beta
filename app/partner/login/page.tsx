import { LoginForm } from "@/components/auth/LoginForm";

export default async function PartnerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  const { email, notice, error } = await searchParams;
  return (
    <LoginForm
      variant="partner"
      nextPath="/partner"
      initialEmail={email ?? null}
      initialError={error?.trim() || null}
      initialNotice={
        notice === "confirm"
          ? "Your partner profile is ready. Confirm your email, then sign in with your password."
          : null
      }
    />
  );
}


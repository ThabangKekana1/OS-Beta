import { LoginForm } from "@/components/auth/LoginForm";

function loginVariantForPath(nextPath: string | null) {
  if (nextPath?.startsWith("/admin")) return "admin" as const;
  if (nextPath?.startsWith("/sales")) return "sales" as const;
  return "admin" as const;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  // Intentionally do NOT redirect already-authed users. Visiting /login should
  // always show the form so an admin can switch accounts cleanly.
  const { next, error } = await searchParams;
  const nextPath = next && next.startsWith("/") ? next : null;
  const initialError = error?.trim() ? error.trim() : null;

  return (
    <LoginForm
      initialError={initialError}
      nextPath={nextPath}
      variant={loginVariantForPath(nextPath)}
    />
  );
}

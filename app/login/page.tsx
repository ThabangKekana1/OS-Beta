import { LoginForm } from "@/components/auth/LoginForm";

function loginVariantForPath(nextPath: string | null) {
  if (nextPath?.startsWith("/admin")) return "admin" as const;
  if (nextPath?.startsWith("/sales")) return "sales" as const;
  if (nextPath?.startsWith("/partner")) return "partner" as const;
  return "client" as const;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Intentionally do NOT redirect already-authed users. Visiting /login should
  // always show the form so a user can switch accounts (e.g. log out of CRM
  // and back in as a client / Dawn user).
  const { next } = await searchParams;
  const nextPath = next && next.startsWith("/") ? next : null;

  return (
    <LoginForm
      nextPath={nextPath}
      variant={loginVariantForPath(nextPath)}
    />
  );
}

import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getServerAuthSession } from "@/lib/auth-server";
import { resolveDefaultRouteForRole } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getServerAuthSession();

  if (session) {
    redirect(resolveDefaultRouteForRole(session.role));
  }

  const { next } = await searchParams;
  const nextPath = next && next.startsWith("/") ? next : null;

  return <LoginForm nextPath={nextPath} />;
}

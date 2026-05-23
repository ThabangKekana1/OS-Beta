import { redirect } from "next/navigation";
import { PublicClientRegistrationRoute } from "@/components/registration/PublicClientRegistrationRoute";
import { getServerAuthSession } from "@/lib/auth-server";
import { resolveDefaultRouteForRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Business Registration | Foundation-1",
  description: "Register your business for Foundation-1 zero-cost solar assessment.",
};

export default async function Page() {
  const session = await getServerAuthSession();
  if (session) {
    redirect(resolveDefaultRouteForRole(session.role));
  }

  return <PublicClientRegistrationRoute />;
}

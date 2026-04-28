import { redirect } from "next/navigation";
import { AgentLandingRoute } from "@/components/routes/AgentLandingRoute";
import { getServerAuthSession } from "@/lib/auth-server";
import { resolveDefaultRouteForRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getServerAuthSession();
  if (session) {
    redirect(resolveDefaultRouteForRole(session.role));
  }

  return <AgentLandingRoute />;
}

import { SalesSettingsRoute } from "@/components/sales/routes/SalesSettingsRoute";
import { requireServerAuthSession } from "@/lib/auth-server";

export default async function SalesSettingsPage() {
  const session = await requireServerAuthSession("sales");

  return (
    <SalesSettingsRoute profileName={session.name} email={session.email} />
  );
}

import { SalesSettingsRoute } from "@/components/sales/routes/SalesSettingsRoute";
import { requireServerAuthSession } from "@/lib/auth-server";

export default async function SalesSettingsPage() {
  await requireServerAuthSession("sales");

  return <SalesSettingsRoute />;
}

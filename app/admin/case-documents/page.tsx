import { requireServerAuthSession } from "@/lib/auth-server";
import { CaseDocumentsRoute } from "@/components/admin/routes/CaseDocumentsRoute";

export const dynamic = "force-dynamic";

export default async function CaseDocumentsPage() {
  await requireServerAuthSession("admin");
  return <CaseDocumentsRoute />;
}

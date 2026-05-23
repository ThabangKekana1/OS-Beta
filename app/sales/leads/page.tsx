import { AdminLeadsRoute } from "@/components/admin/routes/AdminLeadsRoute";

export default function SalesLeadsPage() {
  return (
    <AdminLeadsRoute
      basePath="/sales"
      showOwnerControls={false}
      showPartnerControls={false}
      allowImport={false}
    />
  );
}

import { SalesLeadsRoute } from "@/components/sales/routes/SalesLeadsRoute";

export default function AdminLeadsPage() {
  return (
    <SalesLeadsRoute
      agentId={null}
      registrationHref="/admin/registration"
      clientHrefBase="/admin/clients"
    />
  );
}

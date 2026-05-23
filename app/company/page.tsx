import CompanyContent from "@/components/public-pages/company";
import { PublicMarketingStaticShell } from "@/components/routes/PublicMarketingLandingRoute";

export default function CompanyPage() {
  return (
    <PublicMarketingStaticShell>
      <CompanyContent />
    </PublicMarketingStaticShell>
  );
}

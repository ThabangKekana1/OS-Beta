import { CaseRoute } from "@/components/routes/CaseRoute";

export default async function CasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <CaseRoute caseId={id} />;
}

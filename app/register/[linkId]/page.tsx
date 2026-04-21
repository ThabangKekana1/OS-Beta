import type { Metadata } from "next";
import { PublicClientRegistrationRoute } from "@/components/registration/PublicClientRegistrationRoute";

export const metadata: Metadata = {
  title: "Client Registration | 1OS",
  description: "Complete your 1OS client onboarding registration form.",
};

export default async function PublicRegistrationPage({
  params,
}: {
  params: Promise<{ linkId: string }>;
}) {
  const { linkId } = await params;

  return <PublicClientRegistrationRoute linkId={linkId} />;
}

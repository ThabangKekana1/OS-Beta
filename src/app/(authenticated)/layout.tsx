import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <AppShell
      user={{
        firstName: session.user.firstName,
        lastName: session.user.lastName,
        email: session.user.email!,
        role: session.user.role,
      }}
    >
      {children}
    </AppShell>
  );
}

import { redirect } from "next/navigation";

export const metadata = {
  title: "1-MI | Foundation-1 Platform",
  robots: { index: false, follow: false },
};

export default function PlatformGatewayPage() {
  redirect("/login");
}

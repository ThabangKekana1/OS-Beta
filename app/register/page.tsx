import { redirect } from "next/navigation";

export const metadata = {
  title: "Create your 1OS account",
};

export default function PublicRegistrationPage() {
  redirect("/signup");
}

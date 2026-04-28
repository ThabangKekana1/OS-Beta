import { SignupForm } from "@/components/auth/SignupForm";

export default async function SignupPage() {
  // Always show the signup form. Don't bounce authed users — they may want
  // to create a fresh account (or are testing as another role).
  return <SignupForm />;
}

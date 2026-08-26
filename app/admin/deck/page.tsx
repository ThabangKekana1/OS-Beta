import { redirect } from "next/navigation";

// The deck concept graduated into the whole admin surface (doc 21):
// Today IS /admin. Old links land there.
export default function LegacyDeckRedirect() {
  redirect("/admin");
}

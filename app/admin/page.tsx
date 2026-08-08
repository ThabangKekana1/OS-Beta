import { redirect } from "next/navigation";

export default function AdminPage() {
  // The operator lands on the Daily Worklist: the constraint-sorted screen
  // that runs the whole book (doc 06 §5.3 item 1).
  redirect("/admin/worklist");
}

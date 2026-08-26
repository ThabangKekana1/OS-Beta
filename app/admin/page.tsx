import { AdminDeckRoute } from "@/components/admin/routes/AdminDeckRoute";

export default function AdminPage() {
  // The founder lands on Today: the decision-first deck (doc 21).
  // The constraint-sorted worklist survives under the console group at
  // /admin/worklist for audit and edge cases.
  return <AdminDeckRoute />;
}

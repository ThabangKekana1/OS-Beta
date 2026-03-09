import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAllTasks } from "@/lib/queries";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { TaskCompleteButton } from "@/components/admin/task-complete-button";

export default async function TasksPage() {
  const session = await auth();
  if (!session || !["ADMINISTRATOR", "SUPER_ADMIN"].includes(session.user.role)) redirect("/login");

  const tasks = await getAllTasks();
  const openTasks = tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED");
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED");

  return (
    <div>
      <PageHeader title="Tasks" description={`${openTasks.length} open tasks`} />

      <Card className="border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Task</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Business</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Assigned To</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Priority</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Due</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {openTasks.map((task) => (
                  <tr key={task.id} className="border-b border-border/50 hover:bg-accent/20">
                    <td className="px-4 py-3">
                      <p className="font-medium">{task.title}</p>
                      {task.description && <p className="text-[10px] text-muted-foreground">{task.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{task.business?.legalName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}` : "Unassigned"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-[10px] ${task.priority === "URGENT" ? "border-destructive/50 text-destructive" : ""}`}>
                        {task.priority}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {task.dueAt ? formatDistanceToNow(task.dueAt, { addSuffix: true }) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px]">{task.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <TaskCompleteButton taskId={task.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

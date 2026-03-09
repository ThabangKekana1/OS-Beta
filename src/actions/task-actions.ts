"use server";

import { requireAuth, requireRole } from "@/lib/auth";
import { createTask, completeTask } from "@/lib/task-engine";
import { taskSchema } from "@/lib/validation";
import { revalidatePath } from "next/cache";

export async function createTaskAction(formData: FormData) {
  const session = await requireRole(["ADMINISTRATOR", "SUPER_ADMIN"]);

  const parsed = taskSchema.safeParse({
    dealPipelineId: formData.get("dealPipelineId") || undefined,
    businessId: formData.get("businessId") || undefined,
    assignedToUserId: formData.get("assignedToUserId") || undefined,
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    taskType: formData.get("taskType") || undefined,
    dueAt: formData.get("dueAt") || undefined,
    priority: (formData.get("priority") as "LOW" | "MEDIUM" | "HIGH" | "URGENT") || undefined,
    ownerRole: (formData.get("ownerRole") as "ADMINISTRATOR") || undefined,
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await createTask({
    ...parsed.data,
    createdByUserId: session.user.id,
    dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : undefined,
  });

  revalidatePath("/admin/tasks");
  return { success: true };
}

export async function completeTaskAction(taskId: string) {
  const session = await requireAuth();
  await completeTask(taskId, session.user.id);
  revalidatePath("/admin/tasks");
  return { success: true };
}

import { UserRole } from "@prisma/client";
import prisma from "./prisma";
import { logActivity } from "./audit";

export async function createTask(params: {
  dealPipelineId?: string;
  businessId?: string;
  assignedToUserId?: string;
  createdByUserId: string;
  title: string;
  description?: string;
  taskType?: string;
  dueAt?: Date;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  ownerRole?: UserRole;
}) {
  const task = await prisma.task.create({
    data: {
      dealPipelineId: params.dealPipelineId,
      businessId: params.businessId,
      assignedToUserId: params.assignedToUserId,
      createdByUserId: params.createdByUserId,
      title: params.title,
      description: params.description,
      taskType: params.taskType,
      dueAt: params.dueAt,
      priority: params.priority ?? "MEDIUM",
      ownerRole: params.ownerRole,
    },
  });

  await logActivity({
    entityType: "Task",
    entityId: task.id,
    actionType: "TASK_CREATED",
    actorUserId: params.createdByUserId,
    metadata: {
      title: params.title,
      taskType: params.taskType,
      dealPipelineId: params.dealPipelineId,
      businessId: params.businessId,
    },
  });

  return task;
}

export async function completeTask(taskId: string, actorUserId: string) {
  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  await logActivity({
    entityType: "Task",
    entityId: task.id,
    actionType: "TASK_COMPLETED",
    actorUserId,
    metadata: { title: task.title },
  });

  return task;
}

export async function createAutoTasks(params: {
  triggerType: "BUSINESS_REGISTERED" | "DOCUMENT_UPLOADED" | "DOCUMENT_REJECTED" | "STAGE_ENTERED" | "SUPPORT_REQUESTED";
  dealPipelineId?: string;
  businessId?: string;
  actorUserId: string;
  stageCode?: string;
  documentTypeCode?: string;
}) {
  const { triggerType, dealPipelineId, businessId, actorUserId } = params;

  switch (triggerType) {
    case "BUSINESS_REGISTERED":
      await createTask({
        dealPipelineId,
        businessId,
        createdByUserId: actorUserId,
        title: "Review new business registration",
        taskType: "REVIEW_REGISTRATION",
        ownerRole: "ADMINISTRATOR",
        priority: "HIGH",
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      break;
    case "DOCUMENT_UPLOADED":
      await createTask({
        dealPipelineId,
        businessId,
        createdByUserId: actorUserId,
        title: `Review uploaded document: ${params.documentTypeCode}`,
        taskType: "REVIEW_DOCUMENT",
        ownerRole: "ADMINISTRATOR",
        priority: "HIGH",
        dueAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      break;
    case "DOCUMENT_REJECTED":
      await createTask({
        dealPipelineId,
        businessId,
        createdByUserId: actorUserId,
        title: `Re-upload required: ${params.documentTypeCode}`,
        taskType: "REUPLOAD_DOCUMENT",
        ownerRole: "BUSINESS_USER",
        priority: "HIGH",
        dueAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      });
      break;
    case "SUPPORT_REQUESTED":
      await createTask({
        dealPipelineId,
        businessId,
        createdByUserId: actorUserId,
        title: "Support request received",
        taskType: "SUPPORT",
        ownerRole: "ADMINISTRATOR",
        priority: "URGENT",
        dueAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      });
      break;
  }
}

"use server";

import { requireRole } from "@/lib/auth";
import { transitionStage, stallDeal, unstallDeal } from "@/lib/stage-engine";
import { stageTransitionSchema, stallDealSchema, disqualifySchema, assignAdminSchema } from "@/lib/validation";
import { logActivity } from "@/lib/audit";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function advanceStage(formData: FormData) {
  const session = await requireRole(["ADMINISTRATOR", "SUPER_ADMIN"]);

  const parsed = stageTransitionSchema.safeParse({
    dealPipelineId: formData.get("dealPipelineId"),
    toStageCode: formData.get("toStageCode"),
    note: formData.get("note"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await transitionStage({
    dealPipelineId: parsed.data.dealPipelineId,
    toStageCode: parsed.data.toStageCode,
    actorUserId: session.user.id,
    actorRole: session.user.role,
    note: parsed.data.note,
  });

  if (!result.success) return { error: result.error };

  revalidatePath("/admin/pipeline");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function markDealStalled(formData: FormData) {
  const session = await requireRole(["ADMINISTRATOR", "SUPER_ADMIN"]);

  const parsed = stallDealSchema.safeParse({
    dealPipelineId: formData.get("dealPipelineId"),
    stallReasonCode: formData.get("stallReasonCode"),
    note: formData.get("note"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await stallDeal({
    dealPipelineId: parsed.data.dealPipelineId,
    stallReasonCode: parsed.data.stallReasonCode,
    actorUserId: session.user.id,
    note: parsed.data.note,
  });

  if (!result.success) return { error: result.error };

  revalidatePath("/admin/pipeline");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function markDealUnstalled(dealPipelineId: string) {
  const session = await requireRole(["ADMINISTRATOR", "SUPER_ADMIN"]);

  const result = await unstallDeal({
    dealPipelineId,
    actorUserId: session.user.id,
  });

  if (!result.success) return { error: result.error };

  revalidatePath("/admin/pipeline");
  return { success: true };
}

export async function disqualifyBusiness(formData: FormData) {
  const session = await requireRole(["ADMINISTRATOR", "SUPER_ADMIN"]);

  const parsed = disqualifySchema.safeParse({
    businessId: formData.get("businessId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const disqualifiedStage = await prisma.pipelineStageDefinition.findUnique({
    where: { code: "DISQUALIFIED" },
  });

  if (!disqualifiedStage) return { error: "Disqualified stage not found" };

  await prisma.$transaction([
    prisma.business.update({
      where: { id: parsed.data.businessId },
      data: {
        qualificationStatus: "DISQUALIFIED",
        disqualificationReason: parsed.data.reason,
        currentStageId: disqualifiedStage.id,
      },
    }),
    prisma.dealPipeline.updateMany({
      where: { businessId: parsed.data.businessId },
      data: { currentStageId: disqualifiedStage.id },
    }),
  ]);

  await logActivity({
    entityType: "Business",
    entityId: parsed.data.businessId,
    actionType: "BUSINESS_DISQUALIFIED",
    actorUserId: session.user.id,
    metadata: { reason: parsed.data.reason },
  });

  revalidatePath("/admin/pipeline");
  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function assignAdministrator(formData: FormData) {
  const session = await requireRole(["ADMINISTRATOR", "SUPER_ADMIN"]);

  const parsed = assignAdminSchema.safeParse({
    businessId: formData.get("businessId"),
    administratorId: formData.get("administratorId"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.$transaction([
    prisma.business.update({
      where: { id: parsed.data.businessId },
      data: { assignedAdministratorId: parsed.data.administratorId },
    }),
    prisma.dealPipeline.updateMany({
      where: { businessId: parsed.data.businessId },
      data: { assignedAdministratorId: parsed.data.administratorId },
    }),
  ]);

  await logActivity({
    entityType: "Business",
    entityId: parsed.data.businessId,
    actionType: "BUSINESS_ASSIGNED",
    actorUserId: session.user.id,
    metadata: { administratorId: parsed.data.administratorId },
  });

  revalidatePath("/admin/pipeline");
  return { success: true };
}

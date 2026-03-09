import { UserRole } from "@prisma/client";
import prisma from "./prisma";
import { logActivity } from "./audit";
import { STAGE_CODES } from "./constants";
import { isAdmin } from "./permissions";

export interface StageTransitionResult {
  success: boolean;
  error?: string;
  dealId?: string;
}

const STAGE_ORDER: string[] = [
  STAGE_CODES.LEAD_SOURCED,
  STAGE_CODES.REGISTRATION_LINK_SENT,
  STAGE_CODES.BUSINESS_REGISTERED,
  STAGE_CODES.APPLICATION_COMPLETED,
  STAGE_CODES.FOUNDATION_ONE_CONTRACT_SIGNED,
  STAGE_CODES.EOI_REQUESTED,
  STAGE_CODES.EOI_UPLOADED,
  STAGE_CODES.EOI_SENT_TO_PARTNER,
  STAGE_CODES.EOI_APPROVED,
  STAGE_CODES.UTILITY_BILL_REQUESTED,
  STAGE_CODES.UTILITY_BILL_UPLOADED,
  STAGE_CODES.UTILITY_BILL_SENT_TO_PARTNER,
  STAGE_CODES.PROPOSAL_RECEIVED,
  STAGE_CODES.PROPOSAL_DELIVERED,
  STAGE_CODES.PROPOSAL_SIGNED,
  STAGE_CODES.PROPOSAL_SENT_TO_PARTNER,
  STAGE_CODES.TERM_SHEET_RECEIVED,
  STAGE_CODES.TERM_SHEET_DELIVERED,
  STAGE_CODES.TERM_SHEET_SIGNED,
  STAGE_CODES.TERM_SHEET_SENT_TO_PARTNER,
  STAGE_CODES.KYC_REQUESTED,
  STAGE_CODES.KYC_UPLOADED,
  STAGE_CODES.KYC_SENT_TO_PARTNER,
  STAGE_CODES.NEDBANK_APPROVED,
  STAGE_CODES.SITE_INSPECTION_STARTED,
  STAGE_CODES.INSTALLATION_IN_PROGRESS,
  STAGE_CODES.COMMISSIONED,
  STAGE_CODES.ACTIVE_SUPPORT,
];

const TERMINAL_STAGES: string[] = [STAGE_CODES.DISQUALIFIED, STAGE_CODES.LOST];

// Stages that business users can trigger by action (upload/sign)
const BUSINESS_TRIGGERABLE_STAGES: Set<string> = new Set([
  STAGE_CODES.BUSINESS_REGISTERED,
  STAGE_CODES.APPLICATION_COMPLETED,
  STAGE_CODES.FOUNDATION_ONE_CONTRACT_SIGNED,
  STAGE_CODES.EOI_UPLOADED,
  STAGE_CODES.UTILITY_BILL_UPLOADED,
  STAGE_CODES.PROPOSAL_SIGNED,
  STAGE_CODES.TERM_SHEET_SIGNED,
  STAGE_CODES.KYC_UPLOADED,
]);

export function canTransitionStage(
  fromStageCode: string,
  toStageCode: string,
  actorRole: UserRole
): { allowed: boolean; reason?: string } {
  if (TERMINAL_STAGES.includes(fromStageCode)) {
    return { allowed: false, reason: "Cannot transition from a terminal stage" };
  }

  if (toStageCode === STAGE_CODES.DISQUALIFIED || toStageCode === STAGE_CODES.LOST) {
    if (!isAdmin(actorRole)) {
      return { allowed: false, reason: "Only administrators can disqualify or mark as lost" };
    }
    return { allowed: true };
  }

  const fromIndex = STAGE_ORDER.indexOf(fromStageCode);
  const toIndex = STAGE_ORDER.indexOf(toStageCode);

  if (fromIndex === -1 || toIndex === -1) {
    return { allowed: false, reason: "Invalid stage code" };
  }

  if (toIndex !== fromIndex + 1) {
    if (!isAdmin(actorRole)) {
      return { allowed: false, reason: "Stages must progress sequentially" };
    }
    if (toIndex <= fromIndex) {
      return { allowed: false, reason: "Cannot move backwards in the pipeline" };
    }
  }

  if (actorRole === "BUSINESS_USER" && !BUSINESS_TRIGGERABLE_STAGES.has(toStageCode)) {
    return { allowed: false, reason: "Business users cannot manually advance to this stage" };
  }

  if (actorRole === "SALES_REPRESENTATIVE") {
    const salesAllowed: string[] = [
      STAGE_CODES.LEAD_SOURCED,
      STAGE_CODES.REGISTRATION_LINK_SENT,
    ];
    if (!salesAllowed.includes(toStageCode)) {
      return { allowed: false, reason: "Sales representatives cannot advance past registration stages" };
    }
  }

  return { allowed: true };
}

export async function transitionStage(params: {
  dealPipelineId: string;
  toStageCode: string;
  actorUserId: string;
  actorRole: UserRole;
  note?: string;
}): Promise<StageTransitionResult> {
  const deal = await prisma.dealPipeline.findUnique({
    where: { id: params.dealPipelineId },
    include: { currentStage: true },
  });

  if (!deal) return { success: false, error: "Deal not found" };

  const validation = canTransitionStage(
    deal.currentStage.code,
    params.toStageCode,
    params.actorRole
  );

  if (!validation.allowed) {
    return { success: false, error: validation.reason };
  }

  const toStage = await prisma.pipelineStageDefinition.findUnique({
    where: { code: params.toStageCode },
  });

  if (!toStage) return { success: false, error: "Target stage not found" };

  const now = new Date();
  const durationMs = now.getTime() - deal.stageEnteredAt.getTime();
  const durationHours = durationMs / (1000 * 60 * 60);

  await prisma.$transaction([
    prisma.pipelineStageHistory.create({
      data: {
        dealPipelineId: deal.id,
        fromStageId: deal.currentStageId,
        toStageId: toStage.id,
        changedByUserId: params.actorUserId,
        previousStageDurationHours: Math.round(durationHours * 100) / 100,
        note: params.note,
      },
    }),
    prisma.dealPipeline.update({
      where: { id: deal.id },
      data: {
        currentStageId: toStage.id,
        stageEnteredAt: now,
        isStalled: false,
        stalledAt: null,
        stallReasonCode: null,
        updatedAt: now,
      },
    }),
    prisma.business.update({
      where: { id: deal.businessId },
      data: { currentStageId: toStage.id },
    }),
  ]);

  await logActivity({
    entityType: "DealPipeline",
    entityId: deal.id,
    actionType: "STAGE_CHANGED",
    actorUserId: params.actorUserId,
    metadata: {
      fromStage: deal.currentStage.code,
      toStage: params.toStageCode,
      durationHours: Math.round(durationHours * 100) / 100,
      note: params.note,
    },
  });

  return { success: true, dealId: deal.id };
}

export async function stallDeal(params: {
  dealPipelineId: string;
  stallReasonCode: string;
  actorUserId: string;
  note?: string;
}): Promise<{ success: boolean; error?: string }> {
  const deal = await prisma.dealPipeline.findUnique({
    where: { id: params.dealPipelineId },
  });

  if (!deal) return { success: false, error: "Deal not found" };

  const reason = await prisma.stallReasonDefinition.findUnique({
    where: { code: params.stallReasonCode },
  });

  if (!reason) return { success: false, error: "Invalid stall reason code" };

  await prisma.dealPipeline.update({
    where: { id: params.dealPipelineId },
    data: {
      isStalled: true,
      stalledAt: new Date(),
      stallReasonCode: params.stallReasonCode,
      healthStatus: "STALLED",
    },
  });

  await logActivity({
    entityType: "DealPipeline",
    entityId: params.dealPipelineId,
    actionType: "DEAL_STALLED",
    actorUserId: params.actorUserId,
    metadata: { stallReasonCode: params.stallReasonCode, note: params.note },
  });

  return { success: true };
}

export async function unstallDeal(params: {
  dealPipelineId: string;
  actorUserId: string;
  note?: string;
}): Promise<{ success: boolean; error?: string }> {
  await prisma.dealPipeline.update({
    where: { id: params.dealPipelineId },
    data: {
      isStalled: false,
      stalledAt: null,
      stallReasonCode: null,
      healthStatus: "HEALTHY",
    },
  });

  await logActivity({
    entityType: "DealPipeline",
    entityId: params.dealPipelineId,
    actionType: "DEAL_UNSTALLED",
    actorUserId: params.actorUserId,
    metadata: { note: params.note },
  });

  return { success: true };
}

export function computeStageAge(stageEnteredAt: Date): {
  hours: number;
  days: number;
  label: string;
} {
  const now = new Date();
  const ms = now.getTime() - stageEnteredAt.getTime();
  const hours = Math.round(ms / (1000 * 60 * 60));
  const days = Math.round(hours / 24);
  const label = days > 0 ? `${days}d` : `${hours}h`;
  return { hours, days, label };
}

export function computeHealthStatus(
  stageEnteredAt: Date,
  targetDurationHours: number | null,
  isStalled: boolean
): string {
  if (isStalled) return "STALLED";
  if (!targetDurationHours) return "HEALTHY";
  const { hours } = computeStageAge(stageEnteredAt);
  if (hours > targetDurationHours * 1.5) return "OVERDUE";
  if (hours > targetDurationHours) return "AT_RISK";
  return "HEALTHY";
}

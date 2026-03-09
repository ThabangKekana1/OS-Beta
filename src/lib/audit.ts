import prisma from "./prisma";

export type AuditAction =
  | "USER_INVITED"
  | "USER_CREATED"
  | "LEAD_CREATED"
  | "LEAD_INVITE_SENT"
  | "LEAD_KILLED"
  | "LEAD_CONVERTED"
  | "BUSINESS_REGISTERED"
  | "BUSINESS_UPDATED"
  | "BUSINESS_ASSIGNED"
  | "BUSINESS_DISQUALIFIED"
  | "BUSINESS_REASSIGNED"
  | "APPLICATION_SUBMITTED"
  | "STAGE_CHANGED"
  | "DEAL_STALLED"
  | "DEAL_UNSTALLED"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_REVIEWED"
  | "DOCUMENT_APPROVED"
  | "DOCUMENT_REJECTED"
  | "DOCUMENT_FORWARDED_TO_PARTNER"
  | "DOCUMENT_RETURNED_FROM_PARTNER"
  | "TASK_CREATED"
  | "TASK_COMPLETED"
  | "TASK_UPDATED"
  | "NOTE_CREATED"
  | "SUPPORT_REQUESTED"
  | "ESCALATION_CREATED"
  | "PARTNER_HANDOFF_RECORDED"
  | "PARTNER_RESPONSE_RECORDED"
  | "QUALIFICATION_UPDATED";

export async function logActivity(params: {
  entityType: string;
  entityId: string;
  actionType: AuditAction;
  actorUserId?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.activityLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      actionType: params.actionType,
      actorUserId: params.actorUserId,
      metadataJson: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAuth, requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import {
  DOCUMENT_PHASE_CONFIG,
  DOCUMENT_PHASE_LABELS,
} from "@/lib/document-exchange";
import prisma from "@/lib/prisma";
import { transitionStage } from "@/lib/stage-engine";
import {
  businessDocumentResponseSchema,
  documentDeliverySchema,
  documentRequestSchema,
  documentReviewSchema,
} from "@/lib/validation";

async function getBusinessContext(businessId: string) {
  return prisma.business.findUnique({
    where: { id: businessId },
    include: {
      dealPipeline: {
        include: {
          currentStage: true,
        },
      },
    },
  });
}

async function advanceDocumentStage(params: {
  dealPipelineId?: string | null;
  toStageCode?: string;
  actorUserId: string;
  actorRole: "SUPER_ADMIN" | "ADMINISTRATOR" | "SALES_REPRESENTATIVE" | "BUSINESS_USER";
  note: string;
}) {
  if (!params.dealPipelineId || !params.toStageCode) return { success: true };

  const deal = await prisma.dealPipeline.findUnique({
    where: { id: params.dealPipelineId },
    include: { currentStage: true },
  });

  if (!deal || deal.currentStage.code === params.toStageCode) {
    return { success: true };
  }

  return transitionStage({
    dealPipelineId: params.dealPipelineId,
    toStageCode: params.toStageCode,
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    note: params.note,
  });
}

function revalidateDocumentViews(businessId: string) {
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/documents");
  revalidatePath(`/admin/businesses/${businessId}`);
  revalidatePath("/business/dashboard");
  revalidatePath("/business/documents");
}

async function createSubmissionVersion(businessId: string, documentTypeId: string) {
  const latestVersion = await prisma.documentSubmission.findFirst({
    where: { businessId, documentTypeId },
    orderBy: { versionNumber: "desc" },
  });

  return (latestVersion?.versionNumber ?? 0) + 1;
}

export async function requestDocumentFromBusiness(formData: FormData) {
  const session = await requireRole(["ADMINISTRATOR", "SUPER_ADMIN"]);

  const parsed = documentRequestSchema.safeParse({
    businessId: formData.get("businessId"),
    exchangePhase: formData.get("exchangePhase"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const config = DOCUMENT_PHASE_CONFIG[parsed.data.exchangePhase];
  const business = await getBusinessContext(parsed.data.businessId);
  if (!business) return { error: "Business not found" };

  const docType = await prisma.documentTypeDefinition.findUnique({
    where: { code: config.requestDocumentTypeCode },
  });
  if (!docType) return { error: "Document type not found" };

  const existingRequest = await prisma.documentSubmission.findFirst({
    where: {
      businessId: business.id,
      exchangePhase: parsed.data.exchangePhase,
      purpose: "REQUESTED_DOCUMENT",
      businessActionRequired: true,
    },
  });
  if (existingRequest) return { error: "This request is already open" };

  const submission = await prisma.documentSubmission.create({
    data: {
      businessId: business.id,
      dealPipelineId: business.dealPipeline?.id,
      documentTypeId: docType.id,
      uploadedByUserId: session.user.id,
      direction: "ADMIN_TO_BUSINESS",
      purpose: "REQUESTED_DOCUMENT",
      exchangePhase: parsed.data.exchangePhase,
      visibleToBusiness: true,
      visibleToAdministrator: true,
      visibleToSalesRepresentative: docType.visibleToSalesRepresentative,
      businessActionRequired: true,
      adminReviewRequired: false,
      partnerHandoffRequired: false,
      fileUrl: `request://${parsed.data.exchangePhase.toLowerCase()}`,
      originalFileName: config.requestTitle,
      mimeType: "text/plain",
      fileSize: 0,
      versionNumber: await createSubmissionVersion(business.id, docType.id),
      reviewStatus: "APPROVED",
    },
  });

  const stageResult = await advanceDocumentStage({
    dealPipelineId: business.dealPipeline?.id,
    toStageCode: config.requestStageCode,
    actorUserId: session.user.id,
    actorRole: session.user.role,
    note: `${DOCUMENT_PHASE_LABELS[parsed.data.exchangePhase]} requested from business`,
  });
  if (!stageResult.success) return { error: stageResult.error };

  await logActivity({
    entityType: "DocumentSubmission",
    entityId: submission.id,
    actionType: "DOCUMENT_UPLOADED",
    actorUserId: session.user.id,
    metadata: {
      exchangePhase: parsed.data.exchangePhase,
      purpose: "REQUESTED_DOCUMENT",
      direction: "ADMIN_TO_BUSINESS",
    },
  });

  revalidateDocumentViews(business.id);
  return { success: true };
}

export async function deliverDocumentToBusiness(formData: FormData) {
  const session = await requireRole(["ADMINISTRATOR", "SUPER_ADMIN"]);

  const parsed = documentDeliverySchema.safeParse({
    businessId: formData.get("businessId"),
    exchangePhase: formData.get("exchangePhase"),
    originalFileName: formData.get("originalFileName"),
    fileUrl: formData.get("fileUrl"),
    publishToBusiness: formData.get("publishToBusiness"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const config = DOCUMENT_PHASE_CONFIG[parsed.data.exchangePhase];
  const business = await getBusinessContext(parsed.data.businessId);
  if (!business) return { error: "Business not found" };

  const documentTypeCode = config.deliveredDocumentTypeCode ?? config.requestDocumentTypeCode;
  const docType = await prisma.documentTypeDefinition.findUnique({
    where: { code: documentTypeCode },
  });
  if (!docType) return { error: "Document type not found" };

  const publishToBusiness = parsed.data.publishToBusiness !== "false";
  const requiresSignedReturn = !!config.signedReturnDocumentTypeCode;

  const submission = await prisma.documentSubmission.create({
    data: {
      businessId: business.id,
      dealPipelineId: business.dealPipeline?.id,
      documentTypeId: docType.id,
      uploadedByUserId: session.user.id,
      direction: "ADMIN_TO_BUSINESS",
      purpose: "DELIVERED_DOCUMENT",
      exchangePhase: parsed.data.exchangePhase,
      visibleToBusiness: publishToBusiness,
      visibleToAdministrator: true,
      visibleToSalesRepresentative: docType.visibleToSalesRepresentative,
      businessActionRequired: publishToBusiness && requiresSignedReturn,
      adminReviewRequired: false,
      partnerHandoffRequired: false,
      fileUrl: parsed.data.fileUrl,
      originalFileName: parsed.data.originalFileName,
      mimeType: parsed.data.originalFileName.endsWith(".zip") ? "application/zip" : "application/pdf",
      fileSize: parsed.data.originalFileName.endsWith(".zip") ? 7340032 : 524288,
      versionNumber: await createSubmissionVersion(business.id, docType.id),
      reviewStatus: "APPROVED",
      returnedFromPartnerAt: new Date(),
      partnerStatus: "RECEIVED_FROM_PARTNER",
    },
  });

  const stageResult = await advanceDocumentStage({
    dealPipelineId: business.dealPipeline?.id,
    toStageCode: publishToBusiness ? config.deliveredStageCode ?? config.requestStageCode : config.requestStageCode,
    actorUserId: session.user.id,
    actorRole: session.user.role,
    note: publishToBusiness
      ? `${DOCUMENT_PHASE_LABELS[parsed.data.exchangePhase]} delivered to business`
      : `${DOCUMENT_PHASE_LABELS[parsed.data.exchangePhase]} received from partner and held by admin`,
  });
  if (!stageResult.success) return { error: stageResult.error };

  await logActivity({
    entityType: "DocumentSubmission",
    entityId: submission.id,
    actionType: "DOCUMENT_RETURNED_FROM_PARTNER",
    actorUserId: session.user.id,
    metadata: {
      exchangePhase: parsed.data.exchangePhase,
      purpose: "DELIVERED_DOCUMENT",
      visibleToBusiness: publishToBusiness,
    },
  });

  revalidateDocumentViews(business.id);
  return { success: true };
}

export async function publishDocumentToBusiness(documentSubmissionId: string) {
  const session = await requireRole(["ADMINISTRATOR", "SUPER_ADMIN"]);

  const submission = await prisma.documentSubmission.findUnique({
    where: { id: documentSubmissionId },
    include: {
      business: {
        include: {
          dealPipeline: true,
        },
      },
    },
  });
  if (!submission) return { error: "Document not found" };

  const config = DOCUMENT_PHASE_CONFIG[submission.exchangePhase];

  await prisma.documentSubmission.update({
    where: { id: documentSubmissionId },
    data: {
      visibleToBusiness: true,
      businessActionRequired: !!config.signedReturnDocumentTypeCode,
    },
  });

  const stageResult = await advanceDocumentStage({
    dealPipelineId: submission.business.dealPipeline?.id,
    toStageCode: config.deliveredStageCode ?? config.requestStageCode,
    actorUserId: session.user.id,
    actorRole: session.user.role,
    note: `${DOCUMENT_PHASE_LABELS[submission.exchangePhase]} delivered to business`,
  });
  if (!stageResult.success) return { error: stageResult.error };

  revalidateDocumentViews(submission.businessId);
  return { success: true };
}

export async function submitBusinessDocument(formData: FormData) {
  const session = await requireRole(["BUSINESS_USER"]);

  const parsed = businessDocumentResponseSchema.safeParse({
    businessId: formData.get("businessId"),
    dealPipelineId: formData.get("dealPipelineId"),
    exchangePhase: formData.get("exchangePhase"),
    parentSubmissionId: formData.get("parentSubmissionId"),
    originalFileName: formData.get("originalFileName"),
    fileUrl: formData.get("fileUrl"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const config = DOCUMENT_PHASE_CONFIG[parsed.data.exchangePhase];
  const parentSubmission = parsed.data.parentSubmissionId
    ? await prisma.documentSubmission.findUnique({ where: { id: parsed.data.parentSubmissionId } })
    : null;

  const documentTypeCode =
    parentSubmission?.purpose === "DELIVERED_DOCUMENT"
      ? config.signedReturnDocumentTypeCode ?? config.requestDocumentTypeCode
      : config.requestDocumentTypeCode;

  const docType = await prisma.documentTypeDefinition.findUnique({
    where: { code: documentTypeCode },
  });
  if (!docType) return { error: "Document type not found" };

  const purpose = parentSubmission?.purpose === "DELIVERED_DOCUMENT" ? "SIGNED_RETURN" : "SUPPORTING_DOCUMENT";
  const nextStageCode =
    purpose === "SIGNED_RETURN"
      ? config.signedStageCode ?? config.uploadedStageCode
      : config.uploadedStageCode;

  const submission = await prisma.documentSubmission.create({
    data: {
      businessId: parsed.data.businessId,
      dealPipelineId: parsed.data.dealPipelineId,
      parentSubmissionId: parsed.data.parentSubmissionId || null,
      documentTypeId: docType.id,
      uploadedByUserId: session.user.id,
      direction: "BUSINESS_TO_ADMIN",
      purpose,
      exchangePhase: parsed.data.exchangePhase,
      visibleToBusiness: true,
      visibleToAdministrator: true,
      visibleToSalesRepresentative: docType.visibleToSalesRepresentative,
      businessActionRequired: false,
      adminReviewRequired: true,
      partnerHandoffRequired: true,
      fileUrl: parsed.data.fileUrl,
      originalFileName: parsed.data.originalFileName,
      mimeType: parsed.data.originalFileName.endsWith(".zip") ? "application/zip" : "application/pdf",
      fileSize: parsed.data.originalFileName.endsWith(".zip") ? 7340032 : 524288,
      versionNumber: await createSubmissionVersion(parsed.data.businessId, docType.id),
      reviewStatus: "PENDING_REVIEW",
    },
  });

  if (parentSubmission) {
    await prisma.documentSubmission.update({
      where: { id: parentSubmission.id },
      data: {
        businessActionRequired: false,
        returnedSignedAt: purpose === "SIGNED_RETURN" ? new Date() : parentSubmission.returnedSignedAt,
      },
    });
  }

  const stageResult = await advanceDocumentStage({
    dealPipelineId: parsed.data.dealPipelineId,
    toStageCode: nextStageCode,
    actorUserId: session.user.id,
    actorRole: session.user.role,
    note: `${DOCUMENT_PHASE_LABELS[parsed.data.exchangePhase]} submitted by business`,
  });
  if (!stageResult.success) return { error: stageResult.error };

  await logActivity({
    entityType: "DocumentSubmission",
    entityId: submission.id,
    actionType: "DOCUMENT_UPLOADED",
    actorUserId: session.user.id,
    metadata: {
      exchangePhase: parsed.data.exchangePhase,
      purpose,
      direction: "BUSINESS_TO_ADMIN",
      parentSubmissionId: parsed.data.parentSubmissionId,
    },
  });

  revalidateDocumentViews(parsed.data.businessId);
  return { success: true };
}

export async function markDocumentDownloaded(documentSubmissionId: string) {
  const session = await requireRole(["BUSINESS_USER"]);

  const submission = await prisma.documentSubmission.findUnique({
    where: { id: documentSubmissionId },
  });
  if (!submission) return { error: "Document not found" };

  await prisma.documentSubmission.update({
    where: { id: documentSubmissionId },
    data: { businessDownloadedAt: new Date() },
  });

  await logActivity({
    entityType: "DocumentSubmission",
    entityId: documentSubmissionId,
    actionType: "DOCUMENT_UPLOADED",
    actorUserId: session.user.id,
    metadata: { event: "BUSINESS_DOWNLOADED_DOCUMENT" },
  });

  revalidateDocumentViews(submission.businessId);
  return { success: true };
}

export async function reviewDocument(formData: FormData) {
  const session = await requireRole(["ADMINISTRATOR", "SUPER_ADMIN"]);

  const parsed = documentReviewSchema.safeParse({
    documentSubmissionId: formData.get("documentSubmissionId"),
    status: formData.get("status"),
    rejectionReason: formData.get("rejectionReason"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const submission = await prisma.documentSubmission.findUnique({
    where: { id: parsed.data.documentSubmissionId },
    include: {
      parentSubmission: true,
      documentType: true,
    },
  });
  if (!submission) return { error: "Document not found" };

  await prisma.documentSubmission.update({
    where: { id: parsed.data.documentSubmissionId },
    data: {
      reviewStatus: parsed.data.status,
      adminReviewRequired: false,
      reviewedByUserId: session.user.id,
      reviewedAt: new Date(),
      rejectionReason: parsed.data.status === "REJECTED" ? parsed.data.rejectionReason : null,
    },
  });

  if (parsed.data.status === "REJECTED" && submission.parentSubmission) {
    await prisma.documentSubmission.update({
      where: { id: submission.parentSubmission.id },
      data: {
        businessActionRequired: true,
        returnedSignedAt: submission.purpose === "SIGNED_RETURN" ? null : submission.parentSubmission.returnedSignedAt,
      },
    });
  }

  await logActivity({
    entityType: "DocumentSubmission",
    entityId: submission.id,
    actionType: parsed.data.status === "APPROVED" ? "DOCUMENT_APPROVED" : "DOCUMENT_REJECTED",
    actorUserId: session.user.id,
    metadata: {
      exchangePhase: submission.exchangePhase,
      rejectionReason: parsed.data.rejectionReason,
    },
  });

  revalidateDocumentViews(submission.businessId);
  return { success: true };
}

export async function forwardToPartner(documentSubmissionId: string): Promise<{ success: boolean; error?: string }> {
  const session = await requireRole(["ADMINISTRATOR", "SUPER_ADMIN"]);

  const submission = await prisma.documentSubmission.findUnique({
    where: { id: documentSubmissionId },
    include: {
      business: {
        include: { dealPipeline: true },
      },
    },
  });
  if (!submission) return { success: false, error: "Document not found" };

  const config = DOCUMENT_PHASE_CONFIG[submission.exchangePhase];

  await prisma.documentSubmission.update({
    where: { id: documentSubmissionId },
    data: {
      forwardedToPartnerAt: new Date(),
      partnerHandoffRequired: false,
      reviewStatus: submission.adminReviewRequired ? "APPROVED" : submission.reviewStatus,
      adminReviewRequired: false,
      reviewedByUserId: submission.adminReviewRequired ? session.user.id : submission.reviewedByUserId,
      reviewedAt: submission.adminReviewRequired ? new Date() : submission.reviewedAt,
    },
  });

  const stageResult = await advanceDocumentStage({
    dealPipelineId: submission.business.dealPipeline?.id,
    toStageCode: config.sentToPartnerStageCode,
    actorUserId: session.user.id,
    actorRole: session.user.role,
    note: `${DOCUMENT_PHASE_LABELS[submission.exchangePhase]} forwarded to partner`,
  });
  if (!stageResult.success) return { success: false, error: stageResult.error };

  await logActivity({
    entityType: "DocumentSubmission",
    entityId: documentSubmissionId,
    actionType: "DOCUMENT_FORWARDED_TO_PARTNER",
    actorUserId: session.user.id,
    metadata: { exchangePhase: submission.exchangePhase },
  });

  revalidateDocumentViews(submission.businessId);
  return { success: true };
}

export async function recordPartnerReturn(documentSubmissionId: string, partnerStatus: string) {
  const session = await requireRole(["ADMINISTRATOR", "SUPER_ADMIN"]);

  const submission = await prisma.documentSubmission.findUnique({
    where: { id: documentSubmissionId },
    include: {
      business: {
        include: { dealPipeline: true },
      },
    },
  });
  if (!submission) return { error: "Document not found" };

  await prisma.documentSubmission.update({
    where: { id: documentSubmissionId },
    data: {
      returnedFromPartnerAt: new Date(),
      partnerStatus,
    },
  });

  const config = DOCUMENT_PHASE_CONFIG[submission.exchangePhase];
  if (partnerStatus === "APPROVED" && config.partnerApprovedStageCode) {
    const stageResult = await advanceDocumentStage({
      dealPipelineId: submission.business.dealPipeline?.id,
      toStageCode: config.partnerApprovedStageCode,
      actorUserId: session.user.id,
      actorRole: session.user.role,
      note: `${DOCUMENT_PHASE_LABELS[submission.exchangePhase]} approved by partner`,
    });
    if (!stageResult.success) return { error: stageResult.error };
  }

  await logActivity({
    entityType: "DocumentSubmission",
    entityId: documentSubmissionId,
    actionType: "DOCUMENT_RETURNED_FROM_PARTNER",
    actorUserId: session.user.id,
    metadata: { partnerStatus },
  });

  revalidateDocumentViews(submission.businessId);
  return { success: true };
}

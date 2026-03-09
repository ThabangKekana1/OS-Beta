import type {
  DocumentExchangePhase,
  DocumentDirection,
  DocumentPurpose,
  DocumentReviewStatus,
} from "@prisma/client";
import { DOC_TYPE_CODES, STAGE_CODES } from "./constants";

export const DOCUMENT_PHASE_LABELS: Record<DocumentExchangePhase, string> = {
  EXPRESSION_OF_INTEREST: "Expression of Interest",
  UTILITY_BILL: "Utility Bill",
  PROPOSAL: "Proposal",
  TERM_SHEET: "Term Sheet",
  KNOW_YOUR_CUSTOMER: "Know Your Customer",
};

export const DOCUMENT_PHASE_CONFIG: Record<
  DocumentExchangePhase,
  {
    requestDocumentTypeCode: string;
    deliveredDocumentTypeCode?: string;
    signedReturnDocumentTypeCode?: string;
    requestStageCode: string;
    uploadedStageCode: string;
    deliveredStageCode?: string;
    signedStageCode?: string;
    sentToPartnerStageCode: string;
    partnerApprovedStageCode?: string;
    requestTitle: string;
    deliveredTitle?: string;
    signedReturnTitle?: string;
  }
> = {
  EXPRESSION_OF_INTEREST: {
    requestDocumentTypeCode: DOC_TYPE_CODES.EXPRESSION_OF_INTEREST,
    requestStageCode: STAGE_CODES.EOI_REQUESTED,
    uploadedStageCode: STAGE_CODES.EOI_UPLOADED,
    sentToPartnerStageCode: STAGE_CODES.EOI_SENT_TO_PARTNER,
    partnerApprovedStageCode: STAGE_CODES.EOI_APPROVED,
    requestTitle: "Expression of Interest requested",
  },
  UTILITY_BILL: {
    requestDocumentTypeCode: DOC_TYPE_CODES.SIX_MONTH_UTILITY_BILL,
    requestStageCode: STAGE_CODES.UTILITY_BILL_REQUESTED,
    uploadedStageCode: STAGE_CODES.UTILITY_BILL_UPLOADED,
    sentToPartnerStageCode: STAGE_CODES.UTILITY_BILL_SENT_TO_PARTNER,
    requestTitle: "Six-month utility bill requested",
  },
  PROPOSAL: {
    requestDocumentTypeCode: DOC_TYPE_CODES.PROPOSAL,
    deliveredDocumentTypeCode: DOC_TYPE_CODES.PROPOSAL,
    signedReturnDocumentTypeCode: DOC_TYPE_CODES.SIGNED_PROPOSAL,
    requestStageCode: STAGE_CODES.PROPOSAL_RECEIVED,
    uploadedStageCode: STAGE_CODES.PROPOSAL_SIGNED,
    deliveredStageCode: STAGE_CODES.PROPOSAL_DELIVERED,
    signedStageCode: STAGE_CODES.PROPOSAL_SIGNED,
    sentToPartnerStageCode: STAGE_CODES.PROPOSAL_SENT_TO_PARTNER,
    requestTitle: "Proposal received from partner",
    deliveredTitle: "Proposal delivered to business",
    signedReturnTitle: "Signed proposal returned by business",
  },
  TERM_SHEET: {
    requestDocumentTypeCode: DOC_TYPE_CODES.TERM_SHEET,
    deliveredDocumentTypeCode: DOC_TYPE_CODES.TERM_SHEET,
    signedReturnDocumentTypeCode: DOC_TYPE_CODES.SIGNED_TERM_SHEET,
    requestStageCode: STAGE_CODES.TERM_SHEET_RECEIVED,
    uploadedStageCode: STAGE_CODES.TERM_SHEET_SIGNED,
    deliveredStageCode: STAGE_CODES.TERM_SHEET_DELIVERED,
    signedStageCode: STAGE_CODES.TERM_SHEET_SIGNED,
    sentToPartnerStageCode: STAGE_CODES.TERM_SHEET_SENT_TO_PARTNER,
    requestTitle: "Term sheet received from partner",
    deliveredTitle: "Term sheet delivered to business",
    signedReturnTitle: "Signed term sheet returned by business",
  },
  KNOW_YOUR_CUSTOMER: {
    requestDocumentTypeCode: DOC_TYPE_CODES.KYC_DOCUMENT_PACK,
    requestStageCode: STAGE_CODES.KYC_REQUESTED,
    uploadedStageCode: STAGE_CODES.KYC_UPLOADED,
    sentToPartnerStageCode: STAGE_CODES.KYC_SENT_TO_PARTNER,
    requestTitle: "Know Your Customer documents requested",
  },
};

export function getDocumentPurposeLabel(purpose: DocumentPurpose) {
  switch (purpose) {
    case "REQUESTED_DOCUMENT":
      return "Requested";
    case "DELIVERED_DOCUMENT":
      return "Delivered";
    case "SIGNED_RETURN":
      return "Signed Return";
    case "SUPPORTING_DOCUMENT":
      return "Supporting";
  }
}

export function getReviewStatusLabel(status: DocumentReviewStatus) {
  switch (status) {
    case "PENDING_REVIEW":
      return "Under Review";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
  }
}

export function getPhaseNextActionLabel(phase: DocumentExchangePhase, purpose: DocumentPurpose) {
  const phaseLabel = DOCUMENT_PHASE_LABELS[phase];
  if (purpose === "REQUESTED_DOCUMENT") return `Upload ${phaseLabel}`;
  if (purpose === "DELIVERED_DOCUMENT") return `Download and return signed ${phaseLabel}`;
  if (purpose === "SIGNED_RETURN") return `Waiting for administrator review for ${phaseLabel}`;
  return `Continue ${phaseLabel}`;
}

export interface ExchangeDocumentView {
  id: string;
  businessId: string;
  parentSubmissionId: string | null;
  direction: DocumentDirection;
  purpose: DocumentPurpose;
  exchangePhase: DocumentExchangePhase;
  visibleToBusiness: boolean;
  visibleToAdministrator: boolean;
  businessActionRequired: boolean;
  adminReviewRequired: boolean;
  partnerHandoffRequired: boolean;
  businessDownloadedAt: Date | null;
  returnedSignedAt: Date | null;
  reviewStatus: DocumentReviewStatus;
  forwardedToPartnerAt: Date | null;
  returnedFromPartnerAt: Date | null;
  originalFileName: string;
  fileUrl: string;
  createdAt: Date;
}

export function getBusinessExchangeGroups<T extends ExchangeDocumentView>(documents: T[]) {
  const visibleDocs = documents.filter((doc) => doc.visibleToBusiness);
  const requiredUploads = visibleDocs.filter(
    (doc) =>
      doc.direction === "ADMIN_TO_BUSINESS" &&
      doc.businessActionRequired &&
      (doc.purpose === "REQUESTED_DOCUMENT" || doc.purpose === "DELIVERED_DOCUMENT")
  );
  const availableDownloads = visibleDocs.filter(
    (doc) => doc.direction === "ADMIN_TO_BUSINESS" && doc.purpose === "DELIVERED_DOCUMENT"
  );
  const uploadedByBusiness = visibleDocs.filter(
    (doc) => doc.direction === "BUSINESS_TO_ADMIN"
  );
  const underReview = uploadedByBusiness.filter(
    (doc) => doc.adminReviewRequired && doc.reviewStatus === "PENDING_REVIEW"
  );
  const nextAction = requiredUploads[0] ?? null;

  return {
    requiredUploads,
    availableDownloads,
    uploadedByBusiness,
    underReview,
    nextAction,
  };
}

export function getAdminExchangeGroups<T extends ExchangeDocumentView>(documents: T[]) {
  const visibleDocs = documents.filter((doc) => doc.visibleToAdministrator);

  return {
    requestsAwaitingUpload: visibleDocs.filter(
      (doc) =>
        doc.direction === "ADMIN_TO_BUSINESS" &&
        doc.purpose === "REQUESTED_DOCUMENT" &&
        doc.businessActionRequired
    ),
    businessUploadsAwaitingReview: visibleDocs.filter(
      (doc) =>
        doc.direction === "BUSINESS_TO_ADMIN" &&
        doc.adminReviewRequired &&
        doc.reviewStatus === "PENDING_REVIEW"
    ),
    deliveredToBusiness: visibleDocs.filter(
      (doc) => doc.direction === "ADMIN_TO_BUSINESS" && doc.purpose === "DELIVERED_DOCUMENT" && doc.visibleToBusiness
    ),
    deliveredAwaitingSignedReturn: visibleDocs.filter(
      (doc) =>
        doc.direction === "ADMIN_TO_BUSINESS" &&
        doc.purpose === "DELIVERED_DOCUMENT" &&
        doc.businessActionRequired &&
        !doc.returnedSignedAt
    ),
    signedReturnsAwaitingForward: visibleDocs.filter(
      (doc) =>
        doc.direction === "BUSINESS_TO_ADMIN" &&
        doc.purpose === "SIGNED_RETURN" &&
        doc.partnerHandoffRequired &&
        doc.reviewStatus === "APPROVED" &&
        !doc.forwardedToPartnerAt
    ),
    partnerReturnedAwaitingUpload: visibleDocs.filter(
      (doc) =>
        doc.direction === "ADMIN_TO_BUSINESS" &&
        doc.purpose === "DELIVERED_DOCUMENT" &&
        !!doc.returnedFromPartnerAt &&
        !doc.visibleToBusiness
    ),
  };
}

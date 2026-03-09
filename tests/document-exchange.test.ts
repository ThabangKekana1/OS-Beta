import { describe, expect, it } from "vitest";
import {
  getAdminExchangeGroups,
  getBusinessExchangeGroups,
  type ExchangeDocumentView,
} from "@/lib/document-exchange";

function makeDocument(overrides: Partial<ExchangeDocumentView>): ExchangeDocumentView {
  return {
    id: "doc",
    businessId: "biz",
    parentSubmissionId: null,
    direction: "BUSINESS_TO_ADMIN",
    purpose: "SUPPORTING_DOCUMENT",
    exchangePhase: "EXPRESSION_OF_INTEREST",
    visibleToBusiness: true,
    visibleToAdministrator: true,
    businessActionRequired: false,
    adminReviewRequired: true,
    partnerHandoffRequired: false,
    businessDownloadedAt: null,
    returnedSignedAt: null,
    reviewStatus: "PENDING_REVIEW",
    forwardedToPartnerAt: null,
    returnedFromPartnerAt: null,
    originalFileName: "file.pdf",
    fileUrl: "/uploads/file.pdf",
    createdAt: new Date("2026-03-09T10:00:00Z"),
    ...overrides,
  };
}

describe("document exchange grouping", () => {
  it("groups business-facing requests, downloads, uploads, and review items", () => {
    const documents = [
      makeDocument({
        id: "request",
        direction: "ADMIN_TO_BUSINESS",
        purpose: "REQUESTED_DOCUMENT",
        businessActionRequired: true,
        adminReviewRequired: false,
        reviewStatus: "APPROVED",
      }),
      makeDocument({
        id: "delivery",
        direction: "ADMIN_TO_BUSINESS",
        purpose: "DELIVERED_DOCUMENT",
        businessActionRequired: true,
        adminReviewRequired: false,
        reviewStatus: "APPROVED",
      }),
      makeDocument({
        id: "upload",
        direction: "BUSINESS_TO_ADMIN",
        purpose: "SUPPORTING_DOCUMENT",
        adminReviewRequired: true,
        reviewStatus: "PENDING_REVIEW",
      }),
    ];

    const groups = getBusinessExchangeGroups(documents);

    expect(groups.requiredUploads.map((doc) => doc.id)).toEqual(["request", "delivery"]);
    expect(groups.availableDownloads.map((doc) => doc.id)).toEqual(["delivery"]);
    expect(groups.uploadedByBusiness.map((doc) => doc.id)).toEqual(["upload"]);
    expect(groups.underReview.map((doc) => doc.id)).toEqual(["upload"]);
    expect(groups.nextAction?.id).toBe("request");
  });

  it("groups administrator queues by explicit exchange state", () => {
    const documents = [
      makeDocument({
        id: "request",
        direction: "ADMIN_TO_BUSINESS",
        purpose: "REQUESTED_DOCUMENT",
        businessActionRequired: true,
        adminReviewRequired: false,
        reviewStatus: "APPROVED",
      }),
      makeDocument({
        id: "review",
        direction: "BUSINESS_TO_ADMIN",
        purpose: "SUPPORTING_DOCUMENT",
        adminReviewRequired: true,
        reviewStatus: "PENDING_REVIEW",
      }),
      makeDocument({
        id: "delivered",
        direction: "ADMIN_TO_BUSINESS",
        purpose: "DELIVERED_DOCUMENT",
        businessActionRequired: true,
        adminReviewRequired: false,
        reviewStatus: "APPROVED",
      }),
      makeDocument({
        id: "signed",
        direction: "BUSINESS_TO_ADMIN",
        purpose: "SIGNED_RETURN",
        adminReviewRequired: false,
        partnerHandoffRequired: true,
        reviewStatus: "APPROVED",
      }),
      makeDocument({
        id: "held",
        direction: "ADMIN_TO_BUSINESS",
        purpose: "DELIVERED_DOCUMENT",
        visibleToBusiness: false,
        adminReviewRequired: false,
        reviewStatus: "APPROVED",
        returnedFromPartnerAt: new Date("2026-03-09T12:00:00Z"),
      }),
    ];

    const groups = getAdminExchangeGroups(documents);

    expect(groups.requestsAwaitingUpload.map((doc) => doc.id)).toEqual(["request"]);
    expect(groups.businessUploadsAwaitingReview.map((doc) => doc.id)).toEqual(["review"]);
    expect(groups.deliveredToBusiness.map((doc) => doc.id)).toEqual(["delivered"]);
    expect(groups.deliveredAwaitingSignedReturn.map((doc) => doc.id)).toEqual(["delivered"]);
    expect(groups.signedReturnsAwaitingForward.map((doc) => doc.id)).toEqual(["signed"]);
    expect(groups.partnerReturnedAwaitingUpload.map((doc) => doc.id)).toEqual(["held"]);
  });
});
